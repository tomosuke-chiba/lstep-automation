# Lステップ自動化ツール 実装設計書

> 最終更新: 2026-03-17
> ステータス: Phase 1 未着手

---

## 現行要件定義の改善案 TOP3

### 評価テーブル

| # | 改善案 | 現状の問題 | 提案アプローチ | 導入コスト | リターン |
|---|--------|-----------|--------------|:---:|:---:|
| **1** | **TypeScript + 型付きデータモデルの先行確定** | 現在 JavaScript 前提で型定義がない。F1〜F3 を先に実装すると、F4（依存関係マッピング）の入力仕様を後から決める羽目になりコードの大改修が発生する。「`steps: [...]` という仮のJSONで実装 → F4 で参照しようとしたら構造が足りない」という典型的な失敗パターンに直行する | **Phase 0 として `src/types.ts` を最初に設計・確定**。全モジュールが `types.ts` の型定義を参照する形で実装する。TypeScript 化（tsconfig.json 設定: 30分）で型チェックが保護になる | **低**（tsconfig: 30分 / 型定義: 2時間） | **極高**（F4実装時の大改修リスクをゼロにする） |
| **2** | **セレクタ戦略：3層フォールバック + 起動時検証** | 現在は `selectors.json` に1つのセレクタを書くだけ。Lステップが画面更新（Tailwind クラス名変更・SPA の動的ID変更など）すると即座に全機能停止する。かつ「セレクタが壊れたのか」「ページ読み込みが遅いのか」の区別もできない | `selectors.json` のスキーマを `{ "primary": "...", "fallbacks": [...], "lastVerified": "..." }` に変更。`findElement()` 関数が primary → fallbacks の順で試す。**毎実行起動時にセレクタ検証を実行**し、壊れていたら即座にエラーと修正が必要なセレクタ名を表示 | **低**（selectors.json スキーマ変更 + findElement 実装: 2時間） | **高**（「何が壊れたか」の特定が数分 → 数秒に短縮） |
| **3** | **DOM調査スパイクをPhase 1着手前に必須化** | 要件定義書に「画面構造の事前調査が必要」と書いてあるが、スパイクの具体的な手順・成果物・完了条件が定義されていない。Lステップの実際のURL構造・セレクタが不明なまま `selectors.json` をダミーで作ると、Phase 1 の実装全体が動かないまま詰まる | **Phase 0 に「DOM調査スパイク（1〜2時間）」タスクを追加**。成果物: `selectors.json` の全セレクタに実値を記入し `lastVerified` を更新した状態。手順: Chrome デバッグポート起動 → Lステップにログイン → 各管理画面で DevTools を開き `data-*` / `aria-label` / `id` を調査してセレクタを記録 | **低**（1〜2時間のみ） | **極高**（この調査がないと Phase 1 実装全体がブロックされる） |

---

## ディレクトリ・ファイル構成

```
lstep-automation/
├── src/
│   ├── types.ts              # 【Phase 0】全型定義（他の全ファイルが参照）
│   ├── connection.ts         # 【Phase 1】CDP接続・Lステップタブ特定
│   ├── utils.ts              # 【Phase 1】randomWait/retry/log/saveJson/loadJson
│   ├── selectors.ts          # 【Phase 1】selectors.json ローダー + findElement
│   ├── dry-run.ts            # 【Phase 1】DryRunPlan生成・確認・バックアップ
│   ├── dependency-gate.ts    # 【Phase 3】F4グラフを参照した書き込み前影響チェック
│   ├── scenarios.ts          # 【Phase 1/4】F1-1/F1-2/F1-3
│   ├── tags.ts               # 【Phase 2/4】F2-1/F2-2
│   ├── friend-fields.ts      # 【Phase 2/4】F3-1/F3-2
│   ├── dependencies.ts       # 【Phase 3】F4-1スキャン・F4-2グラフ構築
│   ├── doc-generator.ts      # 【Phase 3】F5 Markdown/Mermaid生成
│   └── index.ts              # 【Phase 1〜】CLI エントリポイント
├── selectors/
│   └── selectors.json        # セレクタ外部設定（3層フォールバック形式）
├── data/
│   └── backups/              # 書き込み前の自動バックアップ
├── docs/
│   ├── requirements.md       # 要件定義書
│   └── implementation-plan.md # 本ファイル
├── package.json
├── tsconfig.json
└── README.md
```

---

## 型定義（src/types.ts）

Phase 0 で最初に確定させる。F1〜F5 全モジュールが参照する。

```typescript
// ─────────────────────────────────────────────
// 共通型
// ─────────────────────────────────────────────
export type ScenarioStatus = '配信中' | '停止中' | '下書き';
export type FieldType = 'text' | 'select' | 'date' | 'number';
export type ActionType =
  | 'tag_add' | 'tag_remove'
  | 'scenario_start' | 'scenario_stop'
  | 'rich_menu_switch'
  | 'template_send'
  | 'friend_field_update';

export type NodeKind =
  | 'scenario' | 'tag' | 'friend_field'
  | 'rich_menu' | 'template' | 'auto_reply'
  | 'friend_add_trigger' | 'custom_search';

// ─────────────────────────────────────────────
// F1: シナリオ
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// F2: タグ
// ─────────────────────────────────────────────
export interface Tag {
  id: string;
  name: string;
  folder?: string;
  friendCount: number;
}

// ─────────────────────────────────────────────
// F3: 友だち情報欄
// ─────────────────────────────────────────────
export interface FriendField {
  id: string;
  name: string;
  fieldType: FieldType;
  choices?: { label: string; value: string }[];
  folder?: string;
}

// ─────────────────────────────────────────────
// F4: 依存関係グラフ
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// Dry-run / 操作制御
// ─────────────────────────────────────────────
export type OperationKind =
  | 'scenario_duplicate' | 'tag_create'
  | 'friend_field_add' | 'friend_field_edit';

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
```

---

## 各モジュールの関数シグネチャ

### src/connection.ts
```typescript
export async function connectToLstep(cdpEndpoint?: string): Promise<Browser>
export async function getLstepPage(browser: Browser): Promise<Page>
```

### src/utils.ts
```typescript
export async function randomWait(minMs?: number, maxMs?: number): Promise<void>
export async function retry<T>(fn: () => Promise<T>, opts?: { maxAttempts?: number; delayMs?: number }): Promise<T>
export function log(level: 'info' | 'warn' | 'error', message: string, meta?: unknown): void
export async function saveJson(filePath: string, data: unknown): Promise<void>
export async function loadJson<T>(filePath: string): Promise<T | null>
export function generateTimestamp(): string  // YYYYMMDD_HHmmss
export async function waitForPage(page: Page): Promise<void>
```

### src/selectors.ts
```typescript
export interface SelectorEntry {
  primary: string;
  fallbacks: string[];
  lastVerified?: string;
  note?: string;
}
export function loadSelectors(): SelectorsConfig
export async function findElement(page: Page, entry: SelectorEntry): Promise<ElementHandle>
export async function validateAllSelectors(page: Page): Promise<{ failures: string[] }>
```

### src/dry-run.ts
```typescript
export function buildDryRunPlan(ops: PlannedOperation[], graph?: DependencyGraph): DryRunPlan
export function formatPlanForDisplay(plan: DryRunPlan): string
export async function confirmPlan(plan: DryRunPlan): Promise<boolean>
export async function backupBeforeWrite(kind: OperationKind, targetName: string, data: unknown): Promise<string>
export async function rollback(backupPath: string): Promise<void>
```

### src/dependency-gate.ts
```typescript
export async function loadLatestGraph(): Promise<DependencyGraph | null>
export function checkDependencies(graph: DependencyGraph, targetNodeId: string): ImpactWarning[]
export function formatImpactWarning(warnings: ImpactWarning[]): string
```

### src/scenarios.ts
```typescript
export async function getScenarioList(page: Page): Promise<Scenario[]>
export async function getScenarioDetail(page: Page, scenarioId: string): Promise<ScenarioDetail>
export async function duplicateScenario(page: Page, sourceId: string, newName: string): Promise<OperationResult>
```

### src/tags.ts
```typescript
export async function getTagList(page: Page): Promise<Tag[]>
export async function createTags(page: Page, tagNames: string[]): Promise<OperationResult>
```

### src/friend-fields.ts
```typescript
export async function getFriendFieldList(page: Page): Promise<FriendField[]>
export async function upsertFriendField(page: Page, field: Omit<FriendField, 'id'>): Promise<OperationResult>
```

### src/dependencies.ts
```typescript
export async function scanAllActions(page: Page): Promise<ActionNode[]>
export function buildDependencyGraph(nodes: ActionNode[]): DependencyGraph
export function detectCycles(nodes: ActionNode[], edges: DependencyEdge[]): string[][]
export function findImpacted(graph: DependencyGraph, targetNodeId: string): ActionNode[]
```

### src/doc-generator.ts
```typescript
export function generateMermaidGraph(graph: DependencyGraph, filter?: { kind?: NodeKind; scenarioId?: string }): string
export function generateAccountDoc(opts: { scenarios: ScenarioDetail[]; tags: Tag[]; friendFields: FriendField[]; graph: DependencyGraph }): string
export async function saveDoc(markdown: string, label?: string): Promise<string>
```

---

## selectors.json スキーマ（3層フォールバック形式）

```json
{
  "_meta": { "lastUpdated": "2026-03-17", "note": "DOM調査後に全セレクタを実値に更新すること" },
  "scenarios": {
    "listPageUrl": { "url": "/scenarios", "note": "要DOM調査" },
    "listTable": {
      "primary": "TODO: DOM調査で確定",
      "fallbacks": ["table.scenario-list", "table"],
      "lastVerified": "未調査"
    },
    "listRow":       { "primary": "TODO", "fallbacks": ["table tbody tr"], "lastVerified": "未調査" },
    "rowName":       { "primary": "TODO", "fallbacks": ["td:nth-child(1) a"], "lastVerified": "未調査" },
    "rowStatus":     { "primary": "TODO", "fallbacks": ["td:nth-child(2)"], "lastVerified": "未調査" },
    "detailStepList":{ "primary": "TODO", "fallbacks": [".step-list"], "lastVerified": "未調査" },
    "duplicateButton":{ "primary": "TODO", "fallbacks": ["button:has-text('複製')"], "lastVerified": "未調査" }
  },
  "tags": {
    "listPageUrl": { "url": "/tags", "note": "要DOM調査" },
    "listTable":   { "primary": "TODO", "fallbacks": ["table"], "lastVerified": "未調査" },
    "listRow":     { "primary": "TODO", "fallbacks": ["table tbody tr"], "lastVerified": "未調査" },
    "createButton":{ "primary": "TODO", "fallbacks": ["button:has-text('タグを追加')", "button:has-text('新規作成')"], "lastVerified": "未調査" },
    "nameInput":   { "primary": "TODO", "fallbacks": ["input[name='tag_name']", "input[placeholder*='タグ名']"], "lastVerified": "未調査" },
    "saveButton":  { "primary": "TODO", "fallbacks": ["button[type='submit']", "button:has-text('保存')"], "lastVerified": "未調査" }
  },
  "friendFields": {
    "listPageUrl": { "url": "/friend-fields", "note": "要DOM調査" },
    "listTable":   { "primary": "TODO", "fallbacks": ["table"], "lastVerified": "未調査" },
    "fieldTypeSelect": { "primary": "TODO", "fallbacks": ["select[name='field_type']"], "lastVerified": "未調査" }
  },
  "dependencies": {
    "richMenuListPageUrl": { "url": "/rich-menus", "note": "要DOM調査" },
    "autoReplyListPageUrl":{ "url": "/auto-replies", "note": "要DOM調査" },
    "templateListPageUrl": { "url": "/templates", "note": "要DOM調査" },
    "actionItemInStep":    { "primary": "TODO", "fallbacks": [".action-item", ".step-action"], "lastVerified": "未調査" }
  },
  "common": {
    "paginationNext": { "primary": "TODO", "fallbacks": ["button[aria-label='次のページ']", "a:has-text('次へ')"], "lastVerified": "未調査" }
  }
}
```

---

## F4 依存関係マッピング アルゴリズム

### グラフ構築（擬似コード）
```
function buildDependencyGraph(rawNodes):
  nodeMap = Map<id, ActionNode>
  edges = []

  for each node in rawNodes:
    nodeMap.set(node.id, node)

  for each node in rawNodes:
    for each action in node.metadata.actions ?? []:
      toId = "{action.actionType_target_kind}:{action.targetName}"
      edges.push({ fromId: node.id, toId, relationLabel: action.actionType,
                   sourceLocation: "{node.kind}:{node.name}" })

  cycles = detectCycles(rawNodes, edges)
  return { nodes: rawNodes, edges, cycles, builtAt: ISO8601 }
```

### 循環依存検出 DFS
```
function detectCycles(nodes, edges):
  adj = buildAdjacencyList(edges)
  visited = Set; inStack = Set; cycles = []

  function dfs(nodeId, path):
    if inStack.has(nodeId):
      cycleStart = path.indexOf(nodeId)
      cycles.push(path.slice(cycleStart).concat(nodeId))
      return
    if visited.has(nodeId): return
    visited.add(nodeId); inStack.add(nodeId); path.push(nodeId)
    for neighbor in adj.get(nodeId) ?? []: dfs(neighbor, path)
    path.pop(); inStack.delete(nodeId)

  for each node: if not visited: dfs(node.id, [])
  return cycles
```

### 影響範囲探索 BFS
```
function findImpacted(graph, targetNodeId):
  adj = buildAdjacencyList(graph.edges)
  queue = [targetNodeId]; visited = Set([targetNodeId]); result = []
  while queue not empty:
    current = queue.shift()
    for neighborId in adj.get(current) ?? []:
      if not visited.has(neighborId):
        visited.add(neighborId); queue.push(neighborId)
        result.push(graph.nodes.find(n => n.id == neighborId))
  return result
```

---

## package.json

```json
{
  "name": "lstep-automation",
  "version": "0.1.0",
  "scripts": {
    "dev":             "ts-node src/index.ts",
    "scan":            "ts-node src/index.ts scan",
    "scan:scenarios":  "ts-node src/index.ts scan:scenarios",
    "scan:tags":       "ts-node src/index.ts scan:tags",
    "scan:fields":     "ts-node src/index.ts scan:fields",
    "dep:map":         "ts-node src/index.ts dep:map",
    "dep:doc":         "ts-node src/index.ts dep:doc",
    "build":           "tsc",
    "typecheck":       "tsc --noEmit",
    "lint":            "eslint 'src/**/*.ts'",
    "lint:fix":        "eslint 'src/**/*.ts' --fix"
  },
  "dependencies": {
    "playwright": "^1.42.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "ts-node": "^10.9.2",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "eslint": "^8.57.0"
  },
  "engines": { "node": ">=20.0.0" }
}
```

---

## 実装タスク詳細（1タスク = 1〜2時間）

### Phase 0: 設計確定（実装着手前の必須作業）

| # | タスク | 所要 | 依存 | 並列可否 |
|---|--------|------|------|----------|
| T00 | **DOM調査スパイク**: Chromeデバッグ接続 → 各管理画面のDOM確認 → `selectors.json` に実値を記入 | 2h | なし | - |
| T01 | `package.json` + `tsconfig.json` 初期化、依存パッケージインストール | 0.5h | なし | T00と並列可 |
| T02 | `src/types.ts` 全型定義を確定・記述 | 1.5h | T01 | - |

**Phase 0 合計: 4h**
**完了条件: `selectors.json` の全セレクタに実値が入っており、`types.ts` がコンパイルエラーなし**

---

### Phase 1: 基盤構築 + F1検証

| # | タスク | 所要 | 依存 | 並列可否 |
|---|--------|------|------|----------|
| T03 | `src/utils.ts` 実装（randomWait/retry/log/saveJson/loadJson） | 1.5h | T02 | - |
| T04 | `src/selectors.ts` 実装（loadSelectors/findElement/validateAllSelectors） | 1h | T02, T00 | T03と並列可 |
| T05 | `src/connection.ts` 実装（connectToLstep/getLstepPage） | 1h | T03, T04 | - |
| T06 | `src/dry-run.ts` 実装（buildDryRunPlan/confirmPlan/backupBeforeWrite/rollback） | 2h | T02, T03 | T05と並列可 |
| T07 | `src/scenarios.ts` F1-1 `getScenarioList` 実装 + 実ブラウザ動作確認 | 2h | T05 | - |
| T08 | `src/scenarios.ts` F1-2 `getScenarioDetail` 実装 + 実ブラウザ動作確認 | 2h | T07 | - |
| T09 | `src/index.ts` CLIエントリポイント + `npm run scan:scenarios` 動作確認 | 1h | T06, T08 | - |

**Phase 1 合計: 10.5h**
**完了条件: `npm run scan:scenarios` でシナリオ一覧・詳細が `data/` に JSON 出力される。Dry-run プロンプトが表示される**

---

### Phase 2: データ収集完成

| # | タスク | 所要 | 依存 | 並列可否 |
|---|--------|------|------|----------|
| T10 | `src/tags.ts` `getTagList` 実装 + 動作確認 | 1.5h | T05 | T11と並列可 |
| T11 | `src/friend-fields.ts` `getFriendFieldList` 実装 + 動作確認 | 1.5h | T05 | T10と並列可 |
| T12 | `src/index.ts` に `scan:tags` / `scan:fields` コマンド追加 | 0.5h | T10, T11 | - |

**Phase 2 合計: 3.5h**
**完了条件: `npm run scan:tags` `npm run scan:fields` がそれぞれ JSON を出力する**

---

### Phase 3: 依存関係マッピング（コアゴール）

| # | タスク | 所要 | 依存 | 並列可否 |
|---|--------|------|------|----------|
| T13 | リッチメニュー/自動応答/テンプレート等の管理画面DOM調査 → `selectors.json` 追加 | 1.5h | T00完了後 | - |
| T14 | `src/dependencies.ts` `scanAllActions` 実装（全画面巡回） | 3h | T05, T13 | - |
| T15 | `src/dependencies.ts` `buildDependencyGraph` + `detectCycles` 実装 | 2h | T14 | - |
| T16 | `src/dependencies.ts` `findImpacted` (BFS) 実装 | 1h | T15 | - |
| T17 | `src/dependency-gate.ts` 実装（loadLatestGraph/checkDependencies） | 1h | T16 | - |
| T18 | `src/doc-generator.ts` `generateMermaidGraph` 実装 | 1.5h | T15 | T17と並列可 |
| T19 | `src/doc-generator.ts` `generateAccountDoc` + `saveDoc` 実装 | 2h | T18 | - |
| T20 | `npm run dep:map` `dep:doc` コマンド追加 + 統合テスト | 1h | T17, T19 | - |

**Phase 3 合計: 13h**
**完了条件: `npm run dep:map` で `data/dependency_graph_*.json` が生成。`npm run dep:doc` で Mermaid図入り Markdown が `docs/` に出力される**

---

### Phase 4: 書き込み系（全てDry-run必須）

| # | タスク | 所要 | 依存 | 並列可否 |
|---|--------|------|------|----------|
| T21 | `src/scenarios.ts` F1-3 `duplicateScenario` 実装（Dry-run + 依存チェック + ロールバック） | 2h | T06, T17 | - |
| T22 | `src/tags.ts` F2-2 `createTags` 実装（Dry-run + ロールバック） | 1.5h | T06 | T21と並列可 |
| T23 | `src/friend-fields.ts` F3-2 `upsertFriendField` 実装（Dry-run + 依存チェック + ロールバック） | 2h | T06, T17 | T21と並列可 |
| T24 | 書き込み系コマンド追加 + 統合テスト（Dry-run → 実行 → ロールバック確認） | 1h | T21, T22, T23 | - |

**Phase 4 合計: 6.5h**
**完了条件: 全書き込みコマンドが Dry-run 確認後に実行され、失敗時にロールバックされる**

---

## 総工数見積もり

| フェーズ | 工数 | 主な成果物 |
|---------|------|-----------|
| Phase 0 | 4h | selectors.json（実値入り）、types.ts |
| Phase 1 | 10.5h | CDP接続基盤、Dry-run、シナリオ取得 |
| Phase 2 | 3.5h | タグ・友だち情報欄取得 |
| Phase 3 | 13h | **依存関係グラフ・Mermaid図・構成ドキュメント** |
| Phase 4 | 6.5h | 書き込み系（安全保護付き） |
| **合計** | **37.5h** | **約5〜6日（1日8時間換算）** |

---

## リスクと対策

| リスク | 発生確率 | 対策 |
|--------|---------|------|
| Lステップ画面更新でセレクタ破損 | **高** | 3層フォールバック + 起動時検証（改善案2） |
| F1-F3の出力スキーマがF4要件を満たさない | **高** | Phase 0 で types.ts を先に確定（改善案1） |
| DOM調査なしで実装着手しブロック | **高** | DOM調査スパイクを Phase 0 必須タスクに（改善案3） |
| 書き込み操作の部分失敗でデータ破損 | **中** | Dry-run + バックアップ + ロールバック（要件定義改訂済み） |
| F4スキャンで全画面巡回が不安定 | **中** | randomWait + retry + 構造化ログで追跡 |
