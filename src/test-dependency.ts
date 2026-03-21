// @ts-nocheck
/**
 * 依存関係マッピングテスト
 * 1. 全シナリオ詳細取得
 * 2. 依存関係グラフ構築
 * 3. Mermaid図生成
 */
import { connectToLstep, disconnect } from './connection';
import { getScenarioList, getScenarioDetails } from './scenarios';
import { getTagList } from './tags';
import { getFriendFieldList } from './friend-fields';
import { log, saveJson, generateTimestamp } from './utils';

interface DepNode {
  id: string;
  kind: string;
  name: string;
  folder?: string;
}

interface DepEdge {
  from: string;
  to: string;
  label: string;
}

async function main() {
  const cdpUrl = process.env.CDP_URL ?? 'http://127.0.0.1:9222';
  const conn = await connectToLstep({ cdpUrl });

  // Step 1: 全データ取得
  log('info', '=== Step 1: 全データ取得 ===');
  const scenarios = await getScenarioList(conn);
  const tags = await getTagList(conn);
  const fields = await getFriendFieldList(conn);

  log('info', '=== Step 2: シナリオ詳細取得 ===');
  const details = await getScenarioDetails(conn, scenarios);

  // Step 3: 依存関係グラフ構築
  log('info', '=== Step 3: 依存関係グラフ構築 ===');
  const nodes: DepNode[] = [];
  const edges: DepEdge[] = [];

  // シナリオをノードに追加
  for (const s of scenarios) {
    nodes.push({ id: `scenario:${s.id}`, kind: 'scenario', name: s.name });
  }

  // タグをノードに追加
  for (const t of tags) {
    nodes.push({ id: `tag:${t.id}`, kind: 'tag', name: t.name, folder: t.folder });
  }

  // 友だち情報欄をノードに追加
  for (const f of fields) {
    nodes.push({ id: `field:${f.id}`, kind: 'field', name: f.name, folder: f.folder });
  }

  // テンプレート名を収集（ノードとして追加）
  const templateNames = new Set<string>();
  for (const d of details) {
    for (const step of d.steps) {
      const match = step.messagePreview.match(/^\[テンプレート\] (.+?):/);
      if (match) {
        templateNames.add(match[1]);
      }
    }
  }
  for (const tname of templateNames) {
    nodes.push({ id: `template:${tname}`, kind: 'template', name: tname });
  }

  // エッジ: シナリオ → テンプレート
  for (const d of details) {
    for (const step of d.steps) {
      const match = step.messagePreview.match(/^\[テンプレート\] (.+?):/);
      if (match) {
        edges.push({
          from: `scenario:${d.id}`,
          to: `template:${match[1]}`,
          label: `step${step.stepIndex}`,
        });
      }
    }
  }

  log('info', `Graph: ${nodes.length} nodes, ${edges.length} edges`);

  // Step 4: Mermaid図生成
  log('info', '=== Step 4: Mermaid図生成 ===');
  const mermaid = generateMermaid(nodes, edges);
  console.log('\n' + mermaid);

  // 保存
  const ts = generateTimestamp();
  const graph = { nodes, edges, builtAt: new Date().toISOString() };
  await saveJson(`data/dependency_graph_${ts}.json`, graph);
  await saveJson(`data/mermaid_${ts}.md`, mermaid);

  // サマリ出力
  console.log('\n=== サマリ ===');
  console.log(`シナリオ: ${scenarios.length}件`);
  console.log(`タグ: ${tags.length}件`);
  console.log(`友だち情報欄: ${fields.length}件`);
  console.log(`テンプレート参照: ${templateNames.size}件`);
  console.log(`依存エッジ: ${edges.length}件`);

  // テンプレート別の参照元シナリオ
  console.log('\n=== テンプレート → 参照元シナリオ ===');
  const templateUsage = new Map<string, string[]>();
  for (const e of edges) {
    if (e.to.startsWith('template:')) {
      const tname = e.to.replace('template:', '');
      const sname = nodes.find((n) => n.id === e.from)?.name ?? e.from;
      if (!templateUsage.has(tname)) templateUsage.set(tname, []);
      templateUsage.get(tname)!.push(sname);
    }
  }
  for (const [tname, snames] of templateUsage) {
    console.log(`  ${tname}: ${snames.join(', ')}`);
  }

  await disconnect(conn);
  log('info', '=== 完了 ===');
}

function generateMermaid(nodes: DepNode[], edges: DepEdge[]): string {
  const lines: string[] = ['graph LR'];

  // ノード定義（種類別にスタイル分け）
  const usedIds = new Set<string>();
  for (const e of edges) {
    usedIds.add(e.from);
    usedIds.add(e.to);
  }

  for (const node of nodes) {
    if (!usedIds.has(node.id)) continue;
    const safeId = node.id.replace(/[^a-zA-Z0-9_]/g, '_');
    const label = node.name.length > 25 ? node.name.slice(0, 25) + '...' : node.name;

    switch (node.kind) {
      case 'scenario':
        lines.push(`  ${safeId}["🎬 ${label}"]`);
        break;
      case 'template':
        lines.push(`  ${safeId}["📝 ${label}"]`);
        break;
      case 'tag':
        lines.push(`  ${safeId}["🏷️ ${label}"]`);
        break;
      case 'field':
        lines.push(`  ${safeId}["📋 ${label}"]`);
        break;
    }
  }

  // エッジ
  for (const e of edges) {
    const fromId = e.from.replace(/[^a-zA-Z0-9_]/g, '_');
    const toId = e.to.replace(/[^a-zA-Z0-9_]/g, '_');
    lines.push(`  ${fromId} -->|${e.label}| ${toId}`);
  }

  return lines.join('\n');
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
