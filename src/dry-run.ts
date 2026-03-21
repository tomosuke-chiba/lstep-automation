import * as readline from 'readline';
import * as path from 'path';
import type {
  DryRunPlan,
  PlannedOperation,
  DependencyGraph,
  OperationKind,
  ImpactWarning,
} from './types';
import { saveJson, loadJson, generateTimestamp, log } from './utils';

// =============================================================
// buildDryRunPlan
// =============================================================

export function buildDryRunPlan(
  ops: PlannedOperation[],
  graph?: DependencyGraph
): DryRunPlan {
  const impactWarnings: ImpactWarning[] = [];

  if (graph) {
    for (const op of ops) {
      const targetNodeId = resolveNodeId(op);
      if (targetNodeId) {
        const warnings = collectWarningsFromGraph(graph, targetNodeId);
        impactWarnings.push(...warnings);
      }
    }
  }

  return {
    planId: `plan_${generateTimestamp()}`,
    operations: ops,
    impactWarnings,
  };
}

function resolveNodeId(op: PlannedOperation): string | null {
  switch (op.operationKind) {
    case 'scenario_duplicate':
      return `scenario:${op.targetName}`;
    case 'tag_create':
      return `tag:${op.targetName}`;
    case 'friend_field_add':
    case 'friend_field_edit':
      return `friend_field:${op.targetName}`;
    default:
      return null;
  }
}

function collectWarningsFromGraph(
  graph: DependencyGraph,
  targetNodeId: string
): ImpactWarning[] {
  const warnings: ImpactWarning[] = [];
  const related = graph.edges
    .filter((e) => e.toId === targetNodeId || e.fromId === targetNodeId)
    .map((e) => (e.fromId === targetNodeId ? e.toId : e.fromId));

  if (related.length > 0) {
    warnings.push({
      level: 'warn',
      message: `"${targetNodeId}" は ${related.length} 件の依存関係があります。変更が他の設定に影響する可能性があります。`,
      relatedNodeIds: related,
    });
  }
  return warnings;
}

// =============================================================
// formatPlanForDisplay
// =============================================================

export function formatPlanForDisplay(plan: DryRunPlan): string {
  const lines: string[] = [];
  lines.push(`\n${'='.repeat(60)}`);
  lines.push(`Dry-run プラン: ${plan.planId}`);
  lines.push('='.repeat(60));

  lines.push(`\n【操作一覧】 (${plan.operations.length}件)`);
  for (const op of plan.operations) {
    lines.push(`  Step ${op.stepNumber}: [${op.operationKind}] ${op.description}`);
    lines.push(`    対象: ${op.targetName}`);
  }

  if (plan.impactWarnings.length > 0) {
    lines.push(`\n【影響警告】 (${plan.impactWarnings.length}件)`);
    for (const w of plan.impactWarnings) {
      const icon = w.level === 'warn' ? '⚠️' : 'ℹ️';
      lines.push(`  ${icon} ${w.message}`);
      if (w.relatedNodeIds.length > 0) {
        lines.push(`    関連: ${w.relatedNodeIds.join(', ')}`);
      }
    }
  } else {
    lines.push('\n【影響警告】 なし');
  }

  lines.push('='.repeat(60));
  return lines.join('\n');
}

// =============================================================
// confirmPlan
// =============================================================

export async function confirmPlan(plan: DryRunPlan): Promise<boolean> {
  console.log(formatPlanForDisplay(plan));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<boolean>((resolve) => {
    rl.question('\n上記の操作を実行しますか？ [y/N]: ', (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

// =============================================================
// backupBeforeWrite
// =============================================================

export async function backupBeforeWrite(
  kind: OperationKind,
  targetName: string,
  data: unknown
): Promise<string> {
  const ts = generateTimestamp();
  const filename = `${kind}_${targetName.replace(/[^\w-]/g, '_')}_${ts}.json`;
  const backupPath = path.join('data', 'backups', filename);
  await saveJson(backupPath, { kind, targetName, backedUpAt: new Date().toISOString(), data });
  log('info', `backup created: ${backupPath}`);
  return backupPath;
}

// =============================================================
// rollback
// =============================================================

export async function rollback(backupPath: string): Promise<void> {
  const backup = await loadJson<{
    kind: OperationKind;
    targetName: string;
    backedUpAt: string;
    data: unknown;
  }>(backupPath);

  if (!backup) {
    throw new Error(`rollback failed: backup not found at ${backupPath}`);
  }

  log('warn', `rolling back from backup: ${backupPath}`, {
    kind: backup.kind,
    targetName: backup.targetName,
    backedUpAt: backup.backedUpAt,
  });
  // 実際のロールバック処理はブラウザ操作系モジュール実装後に追加
}
