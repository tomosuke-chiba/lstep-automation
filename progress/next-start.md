# 次回スタートプロンプト

```
start Lステップ自動化ツール Phase 0-B

## 前回の状態
- S01セッション完了：要件定義・実装設計・実行戦略・人間作業チェックリストまで完成
- GitHub: https://github.com/tomosuke-chiba/lstep-automation
- DOM調査スパイク（Phase 0-A）はユーザー作業待ち

## 今回やること（ブラウザ不要・今すぐ着手可）
1. package.json + tsconfig.json 作成 → npm install 実行
2. src/types.ts 全型定義を作成（tsc --noEmit で確認）
3. src/utils.ts 作成（randomWait/retry/log/saveJson/loadJson）
4. src/dry-run.ts 作成（buildDryRunPlan/confirmPlan/backupBeforeWrite/rollback）
5. src/dependency-gate.ts / src/dependencies.ts のグラフアルゴリズム部分作成
6. .gitignore / .env.example / data/backups/ ディレクトリ整備

## ブロッカー
- src/scenarios.ts / src/tags.ts / src/friend-fields.ts のブラウザ操作部分は DOM調査完了後
- selectors.json の実値は DOM調査完了後

## 参照ファイル
- docs/implementation-plan.md（型定義・関数シグネチャの仕様）
- docs/requirements.md（要件定義書）
```
