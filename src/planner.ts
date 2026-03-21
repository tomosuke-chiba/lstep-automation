import * as path from 'path';
import * as fs from 'fs/promises';
import type {
  DependencyGraph,
  ActionNode,
  ImpactWarning,
  ComponentInfo,
  ComponentStatus,
  Prerequisite,
  SharedResource,
  FreshnessInfo,
  PlanAnalysis,
  NodeKind,
} from './types';
import { loadJson, log, saveJson, generateTimestamp } from './utils';
import { checkDependencies } from './dependency-gate';
// NOTE: loadLatestGraph は使わず、loadAndNormalizeGraph で実データ形式に対応
import { findImpacted, detectCycles } from './dependencies';

// =============================================================
// normalizeGraph
// 実データ形式（from/to/label）→ 型定義形式（fromId/toId/relationLabel）に正規化
// =============================================================

interface RawEdge {
  from?: string;
  to?: string;
  label?: string;
  fromId?: string;
  toId?: string;
  relationLabel?: string;
  sourceLocation?: string;
}

interface RawGraph {
  nodes: ActionNode[];
  edges: RawEdge[];
  cycles?: string[][];
  builtAt: string;
}

function normalizeGraph(raw: RawGraph): DependencyGraph {
  const edges = raw.edges.map((e) => ({
    fromId: e.fromId ?? e.from ?? '',
    toId: e.toId ?? e.to ?? '',
    relationLabel: e.relationLabel ?? e.label ?? '',
    sourceLocation: e.sourceLocation ?? '',
  }));

  const cycles = raw.cycles ?? detectCycles(raw.nodes, edges);

  return {
    nodes: raw.nodes,
    edges,
    cycles,
    builtAt: raw.builtAt,
  };
}

// =============================================================
// loadAndNormalizeGraph
// 最新グラフを読み込み、正規化して返す
// =============================================================

async function loadAndNormalizeGraph(): Promise<DependencyGraph | null> {
  const dataDir = 'data';

  let files: string[];
  try {
    const entries = await fs.readdir(dataDir);
    files = entries
      .filter((f) => f.startsWith('dependency_graph_') && f.endsWith('.json'))
      .sort()
      .reverse();
  } catch {
    log('warn', 'loadAndNormalizeGraph: data/ directory not found');
    return null;
  }

  if (files.length === 0) {
    log('info', 'loadAndNormalizeGraph: no dependency graph files found');
    return null;
  }

  const latest = path.join(dataDir, files[0]);
  log('info', `loadAndNormalizeGraph: loading ${latest}`);
  const raw = await loadJson<RawGraph>(latest);
  if (!raw) return null;

  return normalizeGraph(raw);
}

// =============================================================
// checkDataFreshness
// 依存関係グラフの鮮度を確認する
// =============================================================

export async function checkDataFreshness(): Promise<FreshnessInfo> {
  const dataDir = 'data';

  let files: string[];
  try {
    const entries = await fs.readdir(dataDir);
    files = entries
      .filter((f) => f.startsWith('dependency_graph_') && f.endsWith('.json'))
      .sort()
      .reverse();
  } catch {
    return {
      lastScrapedAt: 'never',
      ageHours: Infinity,
      isStale: true,
      recommendation: 'refresh_required',
    };
  }

  if (files.length === 0) {
    return {
      lastScrapedAt: 'never',
      ageHours: Infinity,
      isStale: true,
      recommendation: 'refresh_required',
    };
  }

  // ファイル名からタイムスタンプを抽出: dependency_graph_YYYYMMDD_HHmmss.json
  const latestFile = files[0];
  const match = latestFile.match(/(\d{8})_(\d{6})/);
  if (!match) {
    return {
      lastScrapedAt: 'unknown',
      ageHours: Infinity,
      isStale: true,
      recommendation: 'refresh_required',
    };
  }

  const dateStr = match[1];
  const timeStr = match[2];
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1;
  const day = parseInt(dateStr.substring(6, 8));
  const hour = parseInt(timeStr.substring(0, 2));
  const minute = parseInt(timeStr.substring(2, 4));
  const second = parseInt(timeStr.substring(4, 6));

  const scrapedAt = new Date(year, month, day, hour, minute, second);
  const ageMs = Date.now() - scrapedAt.getTime();
  const ageHours = Math.round((ageMs / (1000 * 60 * 60)) * 10) / 10;

  let recommendation: FreshnessInfo['recommendation'];
  if (ageHours <= 24) {
    recommendation = 'use';
  } else if (ageHours <= 72) {
    recommendation = 'refresh_recommended';
  } else {
    recommendation = 'refresh_required';
  }

  return {
    lastScrapedAt: scrapedAt.toISOString(),
    ageHours,
    isStale: ageHours > 24,
    recommendation,
  };
}

// =============================================================
// buildGraphSummary
// グラフのサマリー情報を構築する
// =============================================================

function buildGraphSummary(graph: DependencyGraph): PlanAnalysis['graphSummary'] {
  const countByKind = (...kinds: string[]) =>
    graph.nodes.filter((n) => kinds.includes(n.kind)).length;

  return {
    totalNodes: graph.nodes.length,
    totalEdges: graph.edges.length,
    scenarioCount: countByKind('scenario'),
    tagCount: countByKind('tag'),
    templateCount: countByKind('template'),
    friendFieldCount: countByKind('friend_field', 'field'),
  };
}

// =============================================================
// resolveComponentStatus
// ノードIDがグラフ内に存在するかチェック → existing / new
// =============================================================

function resolveComponentStatus(
  nodeId: string,
  graph: DependencyGraph
): ComponentStatus {
  const exists = graph.nodes.some((n) => n.id === nodeId);
  return exists ? 'existing' : 'new';
}

// =============================================================
// analyzeComponents
// コンポーネント一覧の各ステータスと補足を付与する
// =============================================================

export function analyzeComponents(
  componentIds: string[],
  graph: DependencyGraph
): ComponentInfo[] {
  return componentIds.map((nodeId) => {
    const parts = nodeId.split(':');
    const kind = parts[0] as NodeKind;
    const name = parts.slice(1).join(':');
    const status = resolveComponentStatus(nodeId, graph);

    // 既存ノードの場合、被参照数を補足
    let notes: string | undefined;
    if (status === 'existing') {
      const incomingCount = graph.edges.filter((e) => e.toId === nodeId).length;
      if (incomingCount > 0) {
        notes = `${incomingCount}件の設定から参照中`;
      }
    }

    return { nodeId, kind, name, status, notes };
  });
}

// =============================================================
// findPrerequisites
// 各コンポーネントが依存するもの（先に存在すべきもの）を洗い出す
// =============================================================

export function findPrerequisites(
  componentIds: string[],
  graph: DependencyGraph
): Prerequisite[] {
  const prerequisites: Prerequisite[] = [];
  const seen = new Set<string>();

  for (const nodeId of componentIds) {
    // このノードが参照している先（outgoing edges）
    const outgoing = graph.edges
      .filter((e) => e.fromId === nodeId)
      .map((e) => e.toId);

    for (const depId of outgoing) {
      if (seen.has(depId)) continue;
      seen.add(depId);

      const exists = graph.nodes.some((n) => n.id === depId);
      // 今回作るコンポーネントに含まれていれば、新規作成予定
      const isInPlan = componentIds.includes(depId);

      prerequisites.push({
        componentId: depId,
        reason: `"${nodeId}" が "${depId}" を参照`,
        satisfied: exists || isInPlan,
      });
    }
  }

  return prerequisites;
}

// =============================================================
// collectImpacts
// 各コンポーネントの影響警告を集約する
// =============================================================

export function collectImpacts(
  componentIds: string[],
  graph: DependencyGraph
): ImpactWarning[] {
  const allWarnings: ImpactWarning[] = [];
  const seen = new Set<string>();

  for (const nodeId of componentIds) {
    const warnings = checkDependencies(graph, nodeId);
    for (const w of warnings) {
      // 重複メッセージ除去
      const key = `${w.level}:${w.message}`;
      if (!seen.has(key)) {
        seen.add(key);
        allWarnings.push(w);
      }
    }
  }

  return allWarnings;
}

// =============================================================
// findSharedResources
// 複数コンポーネントから参照されている共有リソースを特定
// =============================================================

export function findSharedResources(
  graph: DependencyGraph,
  minUsedBy = 2
): SharedResource[] {
  // 各ノードの被参照数を集計
  const incomingMap = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!incomingMap.has(edge.toId)) {
      incomingMap.set(edge.toId, []);
    }
    incomingMap.get(edge.toId)!.push(edge.fromId);
  }

  const shared: SharedResource[] = [];
  for (const [nodeId, usedBy] of incomingMap) {
    if (usedBy.length >= minUsedBy) {
      const node = graph.nodes.find((n) => n.id === nodeId);
      if (node) {
        shared.push({
          nodeId: node.id,
          name: node.name,
          kind: node.kind,
          usedByCount: usedBy.length,
          usedBy,
        });
      }
    }
  }

  // 被参照数の降順でソート
  shared.sort((a, b) => b.usedByCount - a.usedByCount);
  return shared;
}

// =============================================================
// buildExecutionOrder
// 依存関係を考慮した実行順序（トポロジカルソート）
// =============================================================

export function buildExecutionOrder(
  componentIds: string[],
  graph: DependencyGraph
): string[] {
  // コンポーネント間の依存関係だけを抽出
  const relevantEdges = graph.edges.filter(
    (e) => componentIds.includes(e.fromId) && componentIds.includes(e.toId)
  );

  // Kahn's algorithm でトポロジカルソート
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const id of componentIds) {
    inDegree.set(id, 0);
    adj.set(id, []);
  }

  for (const edge of relevantEdges) {
    adj.get(edge.toId)?.push(edge.fromId); // 依存される側 → 依存する側
    inDegree.set(edge.fromId, (inDegree.get(edge.fromId) ?? 0) + 1);
  }

  // 入次数0のノードから開始
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    for (const neighbor of adj.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  // ソートに入らなかったもの（循環依存等）を末尾に追加
  for (const id of componentIds) {
    if (!sorted.includes(id)) sorted.push(id);
  }

  return sorted;
}

// =============================================================
// analyze — メインの分析関数
// Claude Code が呼び出すエントリポイント
// =============================================================

export async function analyze(
  componentIds: string[]
): Promise<PlanAnalysis> {
  // 1. データ鮮度チェック
  const freshness = await checkDataFreshness();
  log('info', `Data freshness: ${freshness.ageHours}h (${freshness.recommendation})`);

  // 2. グラフ読み込み（実データ形式を正規化）
  const graph = await loadAndNormalizeGraph();
  if (!graph) {
    throw new Error(
      '依存関係グラフが見つかりません。先にデータ取得を実行してください。'
    );
  }

  // 3. 各分析を実行
  const components = analyzeComponents(componentIds, graph);
  const prerequisites = findPrerequisites(componentIds, graph);
  const impacts = collectImpacts(componentIds, graph);
  const sharedResources = findSharedResources(graph);
  const executionOrder = buildExecutionOrder(componentIds, graph);
  const relevantCycles = (graph.cycles ?? []).filter((cycle) =>
    cycle.some((nodeId) => componentIds.includes(nodeId))
  );
  const graphSummary = buildGraphSummary(graph);

  const analysis: PlanAnalysis = {
    analyzedAt: new Date().toISOString(),
    dataFreshness: freshness,
    components,
    prerequisites,
    impacts,
    sharedResources,
    executionOrder,
    cycles: relevantCycles,
    graphSummary,
  };

  // 4. 分析結果を保存
  const ts = generateTimestamp();
  await saveJson(`data/plan_analysis_${ts}.json`, analysis);

  return analysis;
}

// =============================================================
// findRelatedNodes
// 指定ノードに関連するノードを全て取得（影響範囲把握用）
// =============================================================

export function findRelatedNodes(
  nodeId: string,
  graph: DependencyGraph
): { incoming: ActionNode[]; outgoing: ActionNode[]; impacted: ActionNode[] } {
  const incoming = graph.edges
    .filter((e) => e.toId === nodeId)
    .map((e) => graph.nodes.find((n) => n.id === e.fromId))
    .filter((n): n is ActionNode => n !== undefined);

  const outgoing = graph.edges
    .filter((e) => e.fromId === nodeId)
    .map((e) => graph.nodes.find((n) => n.id === e.toId))
    .filter((n): n is ActionNode => n !== undefined);

  const impacted = findImpacted(graph, nodeId);

  return { incoming, outgoing, impacted };
}

// =============================================================
// searchNodes
// ノード名で検索（部分一致）
// =============================================================

export async function searchNodes(
  query: string
): Promise<ActionNode[]> {
  const graph = await loadAndNormalizeGraph();
  if (!graph) return [];

  const lower = query.toLowerCase();
  return graph.nodes.filter(
    (n) => n.name.toLowerCase().includes(lower) || n.id.toLowerCase().includes(lower)
  );
}
