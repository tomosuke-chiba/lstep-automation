// =============================================================
// 共通型
// =============================================================

export type ScenarioStatus = '配信中' | '停止中' | '下書き';
export type FieldType = 'text' | 'select' | 'date' | 'number';
export type ActionType =
  | 'tag_add'
  | 'tag_remove'
  | 'scenario_start'
  | 'scenario_stop'
  | 'rich_menu_switch'
  | 'template_send'
  | 'friend_field_update';

export type NodeKind =
  | 'scenario'
  | 'tag'
  | 'friend_field'
  | 'rich_menu'
  | 'template'
  | 'auto_reply'
  | 'friend_add_trigger'
  | 'custom_search';

// =============================================================
// F1: シナリオ
// =============================================================

export interface StepAction {
  actionType: ActionType;
  targetName: string;
  targetId?: string;
}

export interface BranchCondition {
  conditionType: 'tag_has' | 'tag_not_has' | 'friend_field_eq' | 'other';
  targetName: string;
  value?: string;
}

export interface ScenarioStep {
  stepIndex: number;
  timing: string;
  messageType: string;
  messagePreview: string;
  branchConditions: BranchCondition[];
  actions: StepAction[];
}

export interface Scenario {
  id: string;
  name: string;
  status: ScenarioStatus;
  sendCount: number;
  stepCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioDetail extends Scenario {
  steps: ScenarioStep[];
}

// =============================================================
// F2: タグ
// =============================================================

export interface Tag {
  id: string;
  name: string;
  folder?: string;
  friendCount: number;
}

// =============================================================
// F3: 友だち情報欄
// =============================================================

export interface FriendField {
  id: string;
  name: string;
  fieldType: FieldType;
  choices?: { label: string; value: string }[];
  folder?: string;
}

// =============================================================
// F4: 依存関係グラフ
// =============================================================

export interface ActionNode {
  id: string;         // "{kind}:{name}" 例: "tag:新規"
  kind: NodeKind;
  name: string;
  sourceId?: string;
  metadata?: Record<string, unknown>;
}

export interface DependencyEdge {
  fromId: string;
  toId: string;
  relationLabel: string;
  sourceLocation: string;
}

export interface DependencyGraph {
  nodes: ActionNode[];
  edges: DependencyEdge[];
  cycles: string[][];
  builtAt: string;
}

// =============================================================
// Dry-run / 操作制御
// =============================================================

export type OperationKind =
  | 'scenario_duplicate'
  | 'tag_create'
  | 'friend_field_add'
  | 'friend_field_edit';

export interface PlannedOperation {
  stepNumber: number;
  description: string;
  operationKind: OperationKind;
  targetName: string;
  payload: Record<string, unknown>;
}

export interface ImpactWarning {
  level: 'warn' | 'info';
  message: string;
  relatedNodeIds: string[];
}

export interface DryRunPlan {
  planId: string;
  operations: PlannedOperation[];
  impactWarnings: ImpactWarning[];
  backupPath?: string;
  approvedAt?: string;
}

export interface OperationError {
  stepNumber: number;
  message: string;
  raw?: unknown;
}

export interface OperationResult {
  planId: string;
  success: boolean;
  completedSteps: number;
  totalSteps: number;
  errors: OperationError[];
  rolledBack: boolean;
}

// =============================================================
// Planner（計画作成エンジン）
// =============================================================

export type ComponentStatus = 'existing' | 'new' | 'modify';

export interface ComponentInfo {
  nodeId: string;         // "{kind}:{name}" 形式
  kind: NodeKind;
  name: string;
  status: ComponentStatus;
  notes?: string;         // 補足（例: "9シナリオから共有中"）
}

export interface Prerequisite {
  componentId: string;    // 前提となるコンポーネントのnodeId
  reason: string;         // なぜ前提なのか
  satisfied: boolean;     // 既に存在するか
}

export interface SharedResource {
  nodeId: string;
  name: string;
  kind: NodeKind;
  usedByCount: number;    // 参照元の数
  usedBy: string[];       // 参照元のnodeId一覧
}

export interface FreshnessInfo {
  lastScrapedAt: string;
  ageHours: number;
  isStale: boolean;
  recommendation: 'use' | 'refresh_recommended' | 'refresh_required';
}

export interface PlanAnalysis {
  analyzedAt: string;
  dataFreshness: FreshnessInfo;
  components: ComponentInfo[];
  prerequisites: Prerequisite[];
  impacts: ImpactWarning[];
  sharedResources: SharedResource[];
  executionOrder: string[];        // nodeId の推奨実行順
  cycles: string[][];              // 関連する循環依存
  graphSummary: {
    totalNodes: number;
    totalEdges: number;
    scenarioCount: number;
    tagCount: number;
    templateCount: number;
    friendFieldCount: number;
  };
}
