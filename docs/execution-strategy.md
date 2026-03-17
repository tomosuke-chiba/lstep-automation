# 実行戦略書：サブエージェント・チーム編成プラン

> 最終更新: 2026-03-17
> 目的: implementation-plan.md のタスクを最速・高品質で実行するための体制設計

---

## 基本方針

| 原則 | 内容 |
|------|------|
| **コンテキスト保護** | メインセッションは「ユーザー対話・共有ファイル編集・結果統合」のみ。実装はサブエージェントに委譲 |
| **並列最大化** | 依存関係のないタスクは同時にサブエージェントで並列実行 |
| **Phase境界でセッションリセット** | Phase完了 → `/clear` → 新セッションで次Phaseへ |
| **品質ゲート厳守** | 各Phaseの完了条件を満たさない限り次Phaseに進まない |
| **ファイル競合防止** | 同じファイルを複数のサブエージェントが同時編集しない |

---

## Phase 0 実行体制（直列・メインで実施）

**なぜ直列か:** DOM調査スパイクは実際のブラウザを操作する必要があり、Claude Codeが直接担当する。

### セッション 0-A: DOM調査スパイク

```
担当: メイン（ユーザーがブラウザを手動操作・Claude Codeがガイド）
目的: selectors.json に実値を記入する
作業:
  1. Chrome デバッグポートで起動 → Lステップにログイン
  2. playwright-local スキルを使って接続テスト
  3. 各管理画面を順番に開いてDOM構造を確認
     - シナリオ一覧ページ → URL確認 + テーブルのセレクタ調査
     - タグ管理ページ → URL確認 + テーブル・ボタンのセレクタ調査
     - 友だち情報管理ページ → URL確認 + セレクタ調査
     - リッチメニュー/自動応答/テンプレート → URL確認のみ
  4. selectors.json の "TODO" を実値に更新

成果物: selectors.json（全セレクタ実値入り・lastVerified更新済み）
完了条件: "TODO" が一つも残っていないこと
```

### セッション 0-B: types.ts 確定

```
担当: サブエージェント（feature-dev:code-architect）
プロンプト概要:
  - implementation-plan.md の型定義セクションをそのまま src/types.ts として作成
  - package.json / tsconfig.json も作成
  - tsc --noEmit でエラーがないことを確認

並列可否: セッション 0-A と並列実行可能（ファイルが独立）
成果物: src/types.ts, package.json, tsconfig.json
完了条件: tsc --noEmit が通る
```

---

## Phase 1 実行体制（2並列）

**セッション 1-A と 1-B を同時起動する**

### セッション 1-A: 基盤モジュール

```
担当: サブエージェント（feature-dev:code-architect）
対象ファイル:
  - src/utils.ts
  - src/selectors.ts
  - src/connection.ts

入力コンテキスト:
  - implementation-plan.md の「各モジュールの関数シグネチャ」セクション
  - selectors.json（Phase 0-A 完成版）
  - src/types.ts（Phase 0-B 完成版）

実装内容:
  - utils.ts: randomWait(2000-3000ms), retry(3回/5秒), log, saveJson, loadJson, generateTimestamp, waitForPage
  - selectors.ts: loadSelectors(), findElement()（primary→fallbacksフォールバック）, validateAllSelectors()
  - connection.ts: connectToLstep('http://localhost:9222'), getLstepPage()

完了条件: typecheck が通る
競合リスク: なし（他エージェントと異なるファイル）
```

### セッション 1-B: Dry-runモジュール

```
担当: サブエージェント（feature-dev:code-architect）
対象ファイル:
  - src/dry-run.ts

入力コンテキスト:
  - implementation-plan.md の「Dry-runモジュール設計」セクション
  - src/types.ts（Phase 0-B 完成版）

実装内容:
  - buildDryRunPlan(): PlannedOperation[] + DependencyGraph? → DryRunPlan
  - formatPlanForDisplay(): 人間が読めるプロンプト文字列生成
    「[DRY RUN] 以下の操作を実行します: ① ... ② ... \n依存関係への影響: ⚠ ... \n実行しますか？ (Y/n):」
  - confirmPlan(): readline でユーザーに Y/n を問い合わせる
  - backupBeforeWrite(): data/backups/{kind}_{name}_{timestamp}.json に保存
  - rollback(): バックアップから復元

完了条件: typecheck が通る
競合リスク: なし（他エージェントと異なるファイル）
```

**1-A + 1-B 完了後 → セッション 1-C に進む**

### セッション 1-C: F1実装 + CLI

```
担当: サブエージェント（feature-dev:code-architect）
対象ファイル:
  - src/scenarios.ts
  - src/index.ts

入力コンテキスト:
  - 1-A, 1-B の成果物（src/utils.ts, selectors.ts, connection.ts, dry-run.ts）
  - selectors.json（scenarios セクション）
  - implementation-plan.md の関数シグネチャ

実装内容:
  - getScenarioList(page): Page → Scenario[]
    selectors.json の scenarios.listTable → rows を iterate → id/name/status/sendCount を抽出
  - getScenarioDetail(page, scenarioId): Page → ScenarioDetail
    シナリオ編集画面へ遷移 → steps[] を抽出（timing/messageType/actions/branchConditions）
  - index.ts: scan:scenarios コマンド実装
    接続 → validateAllSelectors → getScenarioList → 各シナリオで getScenarioDetail → saveJson

完了条件:
  npm run scan:scenarios で data/scenarios_{timestamp}.json が出力される
  出力 JSON が Scenario[] の型を満たす（typecheck 確認）
```

---

## Phase 2 実行体制（2並列）

**セッション 2-A と 2-B を同時起動する**

### セッション 2-A: F2 タグ

```
担当: サブエージェント（feature-dev:code-architect）
対象ファイル: src/tags.ts
依存: Phase 1 完成物（utils, selectors, connection）
実装: getTagList(page) → Tag[]
完了条件: npm run scan:tags で data/tags_{timestamp}.json 出力
競合リスク: なし
```

### セッション 2-B: F3 友だち情報欄

```
担当: サブエージェント（feature-dev:code-architect）
対象ファイル: src/friend-fields.ts
依存: Phase 1 完成物
実装: getFriendFieldList(page) → FriendField[]
完了条件: npm run scan:fields で data/friend-fields_{timestamp}.json 出力
競合リスク: なし
```

**2-A + 2-B 完了後 → index.ts に scan:tags / scan:fields 追加（メインで実施、数行の変更）**

---

## Phase 3 実行体制（段階的並列）

**Phase 3 は依存関係が深いため、段階1 → 段階2 の順で実行する**

### 段階1: 依存グラフエンジン（直列）

```
セッション 3-A: src/dependencies.ts
担当: サブエージェント（feature-dev:code-architect）

実装内容:
  scanAllActions(page): Page → ActionNode[]
    - 巡回対象: シナリオ各ステップ / テンプレート / リッチメニュー / 自動応答 / 友だち追加時設定
    - 各画面でアクション設定（タグ付与/除外/シナリオ開始/リッチメニュー切替）を ActionNode 形式で収集
    - randomWait + retry を確実に挟む
    - 取得できなかった画面はログに残してスキップ（全停止しない）

  buildDependencyGraph(nodes): ActionNode[] → DependencyGraph
    - ノードをインデックス化
    - アクション設定からエッジを抽出（"tag:新規" のような id 形式で統一）
    - detectCycles(DFS) を呼び出して cycles[] を設定

  detectCycles(nodes, edges): string[][]
    - DFS + inStack 方式で循環検出
    - 実装は implementation-plan.md の擬似コード参照

  findImpacted(graph, targetNodeId): ActionNode[]
    - BFS で順方向の影響範囲を列挙

完了条件: typecheck が通る + 単体で buildDependencyGraph をテスト実行できる
```

### 段階2: 残モジュール（2並列）

**セッション 3-B と 3-C を同時起動する**

```
セッション 3-B: src/dependency-gate.ts
担当: サブエージェント（feature-dev:code-architect）
依存: 3-A 完成物
実装:
  loadLatestGraph(): DependencyGraph | null → data/ から最新ファイルをロード
  checkDependencies(graph, targetNodeId): ImpactWarning[] → findImpacted を呼び、結果をフォーマット
  formatImpactWarning(warnings): string → コンソール表示用文字列
完了条件: typecheck が通る
競合リスク: なし

セッション 3-C: src/doc-generator.ts
担当: サブエージェント（feature-dev:code-architect）
依存: 3-A 完成物（DependencyGraph 型が確定していれば実装可能）
実装:
  generateMermaidGraph(graph, filter?): string
    → "graph TD\n  {fromName} --> {toName}\n ..." の文字列生成
    → filter.kind が指定されれば、そのkindのノードを含むエッジのみ出力
  generateAccountDoc(opts): string
    → # Lステップ アカウント構成 ... から始まる Markdown 文字列
    → セクション: サマリー / シナリオ一覧 / タグ一覧 / 友だち情報欄一覧 / Mermaid図 / 注意事項
  saveDoc(markdown, label?): Promise<string> → docs/ に保存
完了条件: typecheck が通る + generateMermaidGraph のユニットテスト（モックグラフで出力確認）
競合リスク: なし
```

**3-B + 3-C 完了後 → index.ts に dep:map / dep:doc コマンド追加（メインで実施）→ 統合テスト**

---

## Phase 4 実行体制（3並列）

**Phase 3 完全完了後に起動する。依存チェックゲートが使えることが前提**

**セッション 4-A, 4-B, 4-C を同時起動する**

```
セッション 4-A: F1-3 シナリオ複製
担当: サブエージェント
対象: src/scenarios.ts に duplicateScenario 追加
依存: dry-run.ts, dependency-gate.ts, scenarios.ts（既存）
実装フロー:
  1. buildDryRunPlan([{kind:'scenario_duplicate', ...}], graph)
  2. confirmPlan() でユーザー確認
  3. backupBeforeWrite() でバックアップ
  4. Lステップの複製ボタンクリック → 新名称入力 → 保存 → 下書き確認
  5. 失敗時: rollback()
完了条件: duplicateScenario が dry-run 確認後に実行される

セッション 4-B: F2-2 タグ一括作成
担当: サブエージェント
対象: src/tags.ts に createTags 追加
依存: dry-run.ts（dependency-gate は不要、タグ作成は追加のみ）
実装フロー:
  1. buildDryRunPlan(タグ作成計画) で一括表示
  2. confirmPlan() でユーザー確認
  3. backupBeforeWrite() でバックアップ（現在のタグ一覧）
  4. タグを1件ずつ作成（+ randomWait）→ 成功/失敗を記録
  5. 失敗時: rollback()
完了条件: createTags(['A','B','C']) で dry-run 確認後に3件作成される

セッション 4-C: F3-2 友だち情報欄の追加・編集
担当: サブエージェント
対象: src/friend-fields.ts に upsertFriendField 追加
依存: dry-run.ts, dependency-gate.ts（情報欄変更は依存関係に影響あり）
実装フロー:
  1. buildDryRunPlan + 依存チェック（情報欄を参照しているシナリオ条件を列挙）
  2. confirmPlan() でユーザー確認
  3. backupBeforeWrite() でバックアップ
  4. 追加: 新規作成フォームで入力 → 保存 / 編集: 既存項目を開いて変更 → 保存
  5. 失敗時: rollback()
完了条件: upsertFriendField が dry-run 確認後に実行される
```

---

## コンテキスト管理ルール

| ルール | 理由 |
|--------|------|
| Phase完了後は必ず `/clear` | 前Phaseのコンテキストが次Phaseの判断を汚染しないため |
| 共有ファイル（index.ts, selectors.json）はメインのみ編集 | サブエージェント競合を防ぐため |
| サブエージェントには「自分が担当するファイルのみ編集」と明示 | ファイル範囲を超えた変更を防ぐ |
| Phase 0 の types.ts は変更凍結（変更が必要なら全員に通知） | 型定義変更が全モジュールに波及するため |
| 各サブエージェントに渡すコンテキスト = 関係するセクションのみ | コンテキスト肥大化防止 |

---

## 品質ゲート（各Phase完了時に確認）

| Phase | ゲート |
|-------|--------|
| Phase 0 | ① selectors.json に "TODO" ゼロ ② `tsc --noEmit` エラーなし |
| Phase 1 | `npm run scan:scenarios` で JSON 出力 + Dry-run プロンプト表示 |
| Phase 2 | `npm run scan:tags` `npm run scan:fields` で JSON 出力 |
| Phase 3 | `npm run dep:map` で dependency_graph_*.json 出力 + `npm run dep:doc` で Markdown/Mermaid出力 |
| Phase 4 | 全書き込み操作が Dry-run 確認後に実行 + 失敗時ロールバック動作確認 |

---

## スキル活用ポイント

| タイミング | 使用スキル | 目的 |
|-----------|-----------|------|
| DOM調査スパイク | `playwright-local` | Chrome デバッグ接続・セレクタ調査の手順ガイド |
| 実装完了後の動作確認 | `playwright-local` | 実際のLステップ画面での動作を確認 |
| コードレビュー | `code-review:code-review` | Phase 3（依存グラフ）の複雑なアルゴリズムをレビュー |
| コミット・PR | `commit-commands:commit` | 各Phase完了時のコミット |
| セキュリティ確認 | `security-auditor` | Phase 4（書き込み系）実装後にチェック |
