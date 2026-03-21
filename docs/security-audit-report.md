# セキュリティ監査レポート

**実施日**: 2026-03-21
**対象**: lstep-automation (Node.js/TypeScript CLI scraping tool)
**監査者**: Claude Opus 4.6 (automated)
**プロジェクト種別**: ローカル実行のCLIツール（Webサーバー/API/フロントエンドなし）

---

## Executive Summary

全体としてセキュリティリスクは低い。CLIツールとしてローカルで動作し、外部リクエストを受け付けないため、攻撃面（attack surface）は限定的。1件の依存パッケージ脆弱性と、スクレイピングデータの管理に関する改善提案がある。

---

## Findings

### [MEDIUM] 依存パッケージの脆弱性 — flatted <=3.4.1

- **種別**: Prototype Pollution (CVE via `parse()`)
- **重要度**: High（npm audit基準）/ Medium（本プロジェクトでの実質影響）
- **詳細**: `flatted` パッケージに Prototype Pollution 脆弱性あり。`npm audit` で検出。
- **実質的な影響**: 本ツールはローカル実行のみで外部入力を処理しないため、直接的な悪用リスクは低い。ただし、依存チェーン経由で意図しない動作が発生する可能性はゼロではない。
- **対応**: `npm audit fix` で修正可能。

### [LOW] data/spike_detail_page.html にCSRFトークン・ユーザーIDが含まれる

- **種別**: 機密データのローカル保存
- **重要度**: Low
- **詳細**: `data/spike_detail_page.html` にLステップのCSRFトークン (`_token`) とユーザーID (`_lm_user_id=86855`) が含まれている。現時点ではgit未追跡（`.gitignore` の `data/backups/` のみが除外対象で、`data/spike_detail_page.html` 自体は除外されているがgitに追加されていない状態）。
- **リスク**: 今後誤ってコミットされる可能性。CSRFトークンは短命だが、ユーザーIDは永続的。
- **対応提案**: `.gitignore` に `data/*.html` を追加する。

### [INFO] saveJson のパス検証なし

- **種別**: Path Traversal（理論的リスク）
- **重要度**: Info（実質的にリスクなし）
- **詳細**: `utils.ts` の `saveJson(filePath, data)` は引数のパスをそのまま使用しており、パストラバーサル検証がない。ただし、全呼び出し箇所がハードコードされたパス（`data/scenarios_${ts}.json` 等）を使用しているため、外部入力由来のパスが渡されることはない。
- **対応**: 現時点で対応不要。将来的にユーザー入力からパスを受け取る機能を追加する場合は、パス検証を追加すること。

---

## Items Checked and Found Safe

| チェック項目 | 結果 | 備考 |
|---|---|---|
| ハードコードされた認証情報 | PASS | ソースコード内にパスワード・トークン・APIキーなし |
| .env の .gitignore 設定 | PASS | `.env` は `.gitignore` に含まれている |
| .env.example の安全性 | PASS | プレースホルダのみ（実際の値なし） |
| コマンドインジェクション | PASS | `exec` / `spawn` / `child_process` の使用なし |
| page.evaluate() の使用 | PASS | Playwright API経由でローカル制御下のブラウザ内実行のみ。外部入力を直接渡していない |
| コミット済みデータの機密性 | PASS | `data/*.json` にパスワード・トークン・メールアドレスなし |
| `data/spike_detail_page.html` のgit追跡状態 | PASS | 現時点では未追跡 |
| selectors.json の安全性 | PASS | CSSセレクタとURLパスのみ（認証情報なし） |
| RegExインジェクション | PASS | `escapeRegex()` で適切にエスケープ済み |
| 依存パッケージ数 | PASS | 最小限（playwright + dev-deps のみ） |

---

## Improvement Roadmap

### 短期（すぐに対応可能）

1. **`npm audit fix` を実行** — flatted の脆弱性を修正
2. **`.gitignore` に `data/*.html` を追加** — スクレイピングで取得したHTML（トークン含む可能性）がコミットされないようにする

### 中期（機能追加時に検討）

3. **書き込み操作（dry-run から execute）実装時にバックアップ検証を強化** — `rollback()` が実装されたら、バックアップファイルの完全性チェック（チェックサム等）を追加
4. **CDP接続先の検証** — `CDP_URL` が `127.0.0.1` / `localhost` 以外の場合に警告を出す（リモートCDP接続のリスク軽減）

### 注意事項

- このツールは**ローカル実行専用**のため、Webアプリケーション向けのセキュリティ項目（CSRF、XSS、セキュリティヘッダー、セッション管理、CORS等）は対象外とした
- Lステップのログイン状態は既存のChromeセッションに依存しており、本ツール自体が認証情報を保持・管理していないため、認証周りのリスクは低い
