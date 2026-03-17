# lstep-automation

LSTEPの依存関係を把握し、ユーザーが新機能追加・設定変更を指示した際に、依存関係の影響を踏まえてミスなく実行できる半自動化ツール。

## ドキュメント

- [要件定義書](docs/requirements.md)

## セットアップ

```bash
# Chromeをデバッグポート付きで起動
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222

# Lステップに手動ログイン後、スクリプトを実行
```
