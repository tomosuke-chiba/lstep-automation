import * as path from 'path';
import * as fs from 'fs/promises';
import type { DependencyGraph, ImpactWarning } from './types';
import { loadJson, log } from './utils';

// =============================================================
// loadLatestGraph
// data/ 配下の dependency_graph_*.json の中で最新を返す
// =============================================================

export async function loadLatestGraph(): Promise<DependencyGraph | null> {
  const dataDir = 'data';

  let files: string[];
  try {
    const entries = await fs.readdir(dataDir);
    files = entries
      .filter((f) => f.startsWith('dependency_graph_') && f.endsWith('.json'))
      .sort()
      .reverse();
  } catch {
    log('warn', 'loadLatestGraph: data/ directory not found or empty');
    return null;
  }

  if (files.length === 0) {
    log('info', 'loadLatestGraph: no dependency graph files found');
    return null;
  }

  const latest = path.join(dataDir, files[0]);
  log('info', `loadLatestGraph: loading ${latest}`);
  return loadJson<DependencyGraph>(latest);
}

// =============================================================
// checkDependencies
// targetNodeId に関連する影響警告を返す
// =============================================================

export function checkDependencies(
  graph: DependencyGraph,
  targetNodeId: string
): ImpactWarning[] {
  const warnings: ImpactWarning[] = [];

  // 直接の依存先（このノードが参照しているもの）
  const outgoing = graph.edges
    .filter((e) => e.fromId === targetNodeId)
    .map((e) => e.toId);

  // このノードを参照しているもの（被依存）
  const incoming = graph.edges
    .filter((e) => e.toId === targetNodeId)
    .map((e) => e.fromId);

  if (incoming.length > 0) {
    warnings.push({
      level: 'warn',
      message: `"${targetNodeId}" は ${incoming.length} 件の設定から参照されています。削除・変更すると動作に影響します。`,
      relatedNodeIds: incoming,
    });
  }

  if (outgoing.length > 0) {
    warnings.push({
      level: 'info',
      message: `"${targetNodeId}" は ${outgoing.length} 件の設定を参照しています。`,
      relatedNodeIds: outgoing,
    });
  }

  // 循環依存チェック
  const inCycle = graph.cycles.some((cycle) => cycle.includes(targetNodeId));
  if (inCycle) {
    warnings.push({
      level: 'warn',
      message: `"${targetNodeId}" は循環依存に含まれています。変更は予期しない動作を引き起こす可能性があります。`,
      relatedNodeIds: [],
    });
  }

  return warnings;
}

// =============================================================
// formatImpactWarning
// =============================================================

export function formatImpactWarning(warnings: ImpactWarning[]): string {
  if (warnings.length === 0) return '影響なし';

  return warnings
    .map((w) => {
      const icon = w.level === 'warn' ? '⚠️' : 'ℹ️';
      const related =
        w.relatedNodeIds.length > 0
          ? `\n    関連: ${w.relatedNodeIds.join(', ')}`
          : '';
      return `${icon} ${w.message}${related}`;
    })
    .join('\n');
}
