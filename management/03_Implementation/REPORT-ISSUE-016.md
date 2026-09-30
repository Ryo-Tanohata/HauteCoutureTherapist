# 03_実装報告書: ISSUE-016 Vercel デプロイ構成のアプリ単体化レポート

## 概要
Vercel へのデプロイ対象を「セラピスト向け顧客管理アプリ（`product/`）」のみに限定し、顧客一覧画面がトップページ（`/`）に来るよう構成を変更しました。分類は **CHORE**（デプロイ設定変更）のため、アプリのバージョンは **v1.5.9 据え置き**です。

---

## ご要望

> vercelにデプロイするときはアプリだけで良くて生成アプリ用の管理ポータルは不要で、（顧客一覧の）ページがトップに来るようにしたいです

---

## 現状分析

### なぜトップがアプリではなかったか

Vercel のルーティングは以下の順で評価されます。

```
redirects  →  ファイルシステム（実ファイル）  →  rewrites
```

`vercel.json` には `/(.*)` → `/product/$1` の rewrite がありましたが、**rewrite はファイルシステムより後**に評価されます。リポジトリ直下に開発用ランチパッド `index.html`（Launchpad Gateway）が存在したため、`/` へのアクセスはこの実ファイルにヒットして終了し、rewrite が発火していませんでした。

同じ理由で `/management/99_Portal/index.html` などの管理ポータルも rewrite を経ずそのまま配信され、社内向けドキュメントが公開状態になっていました。

### アプリが `product/` 外に依存していた問題

`product/index.html` の末尾がフローティングチャットを外部から import していました。

```html
<script type="module">
    import { initAuroraChat } from '../.agent/templates/floating-chat/integrations/entry-aurora.js';
    initAuroraChat();
</script>
```

`.agent/` は `.gitignore` の対象であり Vercel には一切アップロードされないため、**本番ではこの import が 404 となりチャットが起動していませんでした**（ローカルには実体があるため動作しており、差異に気付きにくい状態でした）。

`product/` だけをデプロイする構成にすれば、この依存は確実に破綻します。したがって本対応の必須要件として解消しています。

---

## 対応内容

### 1. `.vercelignore` の新規作成

配信対象から社内資産と開発専用ファイルを除外しました。

```
# 管理ポータル・ドキュメント一式（社内向け。公開不要）
management/

# 開発用ランチパッド（トップは product/index.html にするため除外）
/index.html

# ローカル開発専用のブリッジサーバと browser-sync 設定
server/
bs-config.cjs

# 依存関係・リポジトリ説明
node_modules/
/README.md
```

`/index.html` のように先頭にスラッシュを付けることで、`product/index.html` を巻き込まずリポジトリ直下のランチパッドのみを除外しています（`.gitignore` と同じ記法）。

### 2. `vercel.json` に `outputDirectory` を追加

```diff
 {
   "cleanUrls": true,
+  "outputDirectory": "product",
   "rewrites": [
     { "source": "/(.*)", "destination": "/product/$1" }
   ]
 }
```

`outputDirectory` により `product/` が配信ルートになり、`/` = 顧客一覧画面となります。

既存の rewrite は**あえて残置**しました。これは二重の安全策で、どちらの機構が効いても結果が正しくなるよう設計しています。

| 状況 | 挙動 |
|---|---|
| `outputDirectory` が効く場合 | `product/` がルート。`/` は実ファイルにヒットするため rewrite は発火せず無害 |
| `outputDirectory` が効かない場合 | 直下 `index.html` は `.vercelignore` で除外済みのため `/` が実ファイルに当たらず、rewrite が発火して `/product/` を配信 |

いずれの経路でもトップに顧客一覧画面が表示されます。

### 3. フローティングチャットの同梱（`product/` の自己完結化）

`.agent/templates/floating-chat/`（9ファイル・65KB）を `product/js/vendor/floating-chat/` へコピーし、import パスを変更しました。

```diff
-        import { initAuroraChat } from '../.agent/templates/floating-chat/integrations/entry-aurora.js';
+        import { initAuroraChat } from './js/vendor/floating-chat/integrations/entry-aurora.js';
```

テンプレート内の import はすべてフォルダ内で完結していることを事前に確認済みで、コピーによる参照切れはありません。

対応後、`product/` 配下に親ディレクトリを参照する `src` / `href` および `.agent` への参照が残っていないことをグローバル検索で確認しました（0件）。

---

## 検証結果

`product/` をドキュメントルートとしてローカル配信し、Vercel と同じ条件で全アセットの取得を確認しました。

| パス | HTTPステータス |
|---|---|
| `/` | **200** |
| `/css/index.css` | **200** |
| `/js/app/ui.js` | **200** |
| `/js/vendor/floating-chat/integrations/entry-aurora.js` | **200** |
| `/js/vendor/floating-chat/core/FloatingChat.js` | **200** |

`/` のレスポンスHTMLに `floating-chat` の参照が含まれることも確認済みです。

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `.vercelignore` | **新規** — 管理ポータル・ランチパッド・開発用サーバを配信対象外に |
| `vercel.json` | `outputDirectory: "product"` を追加 |
| `product/index.html` | チャットの import パスを同梱版へ変更 |
| `product/js/vendor/floating-chat/`（9ファイル） | **新規** — チャットテンプレートを同梱 |
| `management/08_Incidents/ISSUE-016.md` | インシデント報告書 [D-1] |
| `management/03_Implementation/REPORT-ISSUE-016.md` | 本レポート [D-2] |
| `management/99_Portal/index.html` | changelog に CHORE エントリを追加（バージョン据え置き） |

---

## 補足・残課題

1. **管理ポータルの閲覧方法**: 本対応後、管理ポータルは公開URLからアクセスできなくなります。ローカルでは従来どおり `management/99_Portal/index.html` を開いてご利用ください。
2. **チャットの履歴保存**: `entry-aurora.js` の bridge 設定がローカルの `http://localhost:3002/save_history` を向いているため、本番では履歴保存のみ機能しません。AI応答自体はブラウザから Gemini API を直接呼ぶ方式のため動作します。必要であれば別課題として対応します。
3. **テンプレートの二重管理**: `.agent/templates/floating-chat/` が正本、`product/js/vendor/floating-chat/` が配信用コピーとなります。テンプレート更新時は再同期が必要です。
