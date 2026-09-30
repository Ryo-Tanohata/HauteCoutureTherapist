# ISSUE-016: Vercel デプロイ対象をアプリのみに限定し、トップページをアプリにする

## 概要
- **発生日**: 2026-07-20
- **分類**: CHORE（デプロイ設定変更 / バージョン据え置き v1.5.9）
- **報告者**: ユーザー様

## ご要望
> vercelにデプロイするときはアプリだけで良くて生成アプリ用の管理ポータルは不要で、（顧客一覧の）ページがトップに来るようにしたいです

## 現状の問題

### 1. トップページがアプリではなかった
リポジトリ直下に開発用ランチパッド `index.html`（Launchpad Gateway）が存在する。Vercel のルーティングは **redirects → ファイルシステム → rewrites** の順で評価されるため、`/` へのアクセスは `vercel.json` の rewrite が発火する前に直下の `index.html` にヒットし、ランチパッドが表示されていた。

### 2. 管理ポータルが公開されていた
同じくファイルシステム優先のため、`/management/99_Portal/index.html` 等が rewrite を経ずそのまま配信され、社内向けの管理ポータル・各種報告書が公開状態になっていた。

### 3. アプリが `product/` の外部に依存していた（潜在不具合）
`product/index.html` がフローティングチャットを `../.agent/templates/floating-chat/...` から import していた。`.agent/` は `.gitignore` 対象のため Vercel には存在せず、**本番ではチャットが 404 で起動していなかった**。アプリ単体をデプロイする構成にすると、この依存は確実に破綻する。

## 対応内容

1. **`.vercelignore` を新規作成** — `management/`、直下の `index.html`、`server/`、`bs-config.cjs` 等を配信対象から除外。
2. **`vercel.json` に `outputDirectory: "product"` を追加** — `product/` を配信ルートに指定し、アプリがトップに来るようにした。既存の rewrite は保険として残置（両方式のいずれが効いても正しい結果になる構成）。
3. **フローティングチャットを `product/js/vendor/floating-chat/` へ同梱** — import パスを `./js/vendor/...` に変更し、`product/` を自己完結させた。

## 検証
`product/` をドキュメントルートとしてローカル配信し、以下がすべて 200 で取得できることを確認済み。

| パス | 結果 |
|---|---|
| `/` | 200 |
| `/css/index.css` | 200 |
| `/js/app/ui.js` | 200 |
| `/js/vendor/floating-chat/integrations/entry-aurora.js` | 200 |
| `/js/vendor/floating-chat/core/FloatingChat.js` | 200 |

## 変更ファイル
- `.vercelignore`（新規）
- `vercel.json`
- `product/index.html`（import パス変更）
- `product/js/vendor/floating-chat/`（新規・9ファイル）

## 残課題
チャットの履歴保存はローカルの `server/bridge.js`（`http://localhost:3002`）を参照しているため、本番では履歴保存のみ機能しない（AI応答自体はブラウザから Gemini API を直接呼ぶため動作する）。必要に応じて別途対応。
