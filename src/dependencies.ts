import type { Page } from 'playwright';
import type {
  ActionNode,
  DependencyEdge,
  DependencyGraph,
  NodeKind,
} from './types';

// =============================================================
// scanAllActions
// NOTE: ブラウザ操作部分は DOM調査（Phase 0-A）完了後に実装。
//       現時点はシグネチャのみ定義。
// =============================================================

export async function scanAllActions(_page: Page): Promise<ActionNode[]> {
  throw new Error(
    'scanAllActions: not implemented yet — requires DOM investigation (Phase 0-A)'
  );
}

// =============================================================
// buildDependencyGraph
// =============================================================

export function buildDependencyGraph(rawNodes: ActionNode[]): DependencyGraph {
  const edges: DependencyEdge[] = [];

  for (const node of rawNodes) {
    const actions = (node.metadata?.actions ?? []) as Array<{
      actionType: string;
      targetName: string;
    }>;
    for (const action of actions) {
      const toKind = resolveTargetKind(action.actionType);
      if (toKind) {
        const toId = `${toKind}:${action.targetName}`;
        edges.push({
          fromId: node.id,
          toId,
          relationLabel: action.actionType,
          sourceLocation: `${node.kind}:${node.name}`,
        });
      }
    }
  }

  const cycles = detectCycles(rawNodes, edges);

  return {
    nodes: rawNodes,
    edges,
    cycles,
    builtAt: new Date().toISOString(),
  };
}

function resolveTargetKind(actionType: string): NodeKind | null {
  const map: Record<string, NodeKind> = {
    tag_add: 'tag',
    tag_remove: 'tag',
    scenario_start: 'scenario',
    scenario_stop: 'scenario',
    rich_menu_switch: 'rich_menu',
    template_send: 'template',
    friend_field_update: 'friend_field',
  };
  return map[actionType] ?? null;
}

// =============================================================
// detectCycles — DFS
// =============================================================

export function detectCycles(
  nodes: ActionNode[],
  edges: DependencyEdge[]
): string[][] {
  const adj = buildAdjacencyList(edges);
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const cycles: string[][] = [];

  function dfs(nodeId: string, path: string[]): void {
    if (inStack.has(nodeId)) {
      const cycleStart = path.indexOf(nodeId);
      cycles.push([...path.slice(cycleStart), nodeId]);
      return;
    }
    if (visited.has(nodeId)) return;

    visited.add(nodeId);
    inStack.add(nodeId);
    path.push(nodeId);

    for (const neighbor of adj.get(nodeId) ?? []) {
      dfs(neighbor, path);
    }

    path.pop();
    inStack.delete(nodeId);
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      dfs(node.id, []);
    }
  }

  return cycles;
}

// =============================================================
// findImpacted — BFS
// =============================================================

export function findImpacted(
  graph: DependencyGraph,
  targetNodeId: string
): ActionNode[] {
  const adj = buildAdjacencyList(graph.edges);
  const queue: string[] = [targetNodeId];
  const visited = new Set<string>([targetNodeId]);
  const result: ActionNode[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighborId of adj.get(current) ?? []) {
      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        queue.push(neighborId);
        const node = graph.nodes.find((n) => n.id === neighborId);
        if (node) result.push(node);
      }
    }
  }

  return result;
}

// =============================================================
// buildAdjacencyList (internal helper)
// =============================================================

function buildAdjacencyList(edges: DependencyEdge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const edge of edges) {
    if (!adj.has(edge.fromId)) adj.set(edge.fromId, []);
    adj.get(edge.fromId)!.push(edge.toId);
  }
  return adj;
}
