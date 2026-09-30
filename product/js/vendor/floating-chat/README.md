# Floating Chat Template

Aurora Framework 準拠のフローティングチャット（FAB + パネル + Gemini）の再利用テンプレートです。

## ディレクトリ構成

```
floating-chat/
├── README.md
├── config.defaults.js      # デフォルト設定・mergeConfig()
├── entry.default.js          # 汎用エントリ（ポータル連携なし）
├── core/
│   └── FloatingChat.js       # UI・状態・イベント
├── adapters/
│   ├── llm-gemini.js
│   └── persist-session-bridge.js
├── themes/
│   └── aurora.css.js
└── integrations/
    ├── entry-aurora.js       # Aurora Dialogue プリセット
    └── aurora-context.js     # ナレッジ自動追加・Add Page ピッカー
```

## 使い方

### 1. Aurora ポータル（本プロジェクト）

`management/99_Portal/*.html` に以下を追加：

```html
<script type="module" src="aurora-chat.entry.js"></script>
```

`aurora-chat.entry.js` はテンプレートを import して起動します（正本は `.agent/templates/floating-chat/`）。

### 2. 新規プロジェクト（汎用）

1. `.agent/templates/floating-chat/` を `assets/floating-chat/` などにコピー
2. HTML に module スクリプトを追加：

```html
<script type="module">
  import { initDefaultFloatingChat } from './assets/floating-chat/entry.default.js';
  initDefaultFloatingChat({ title: 'Support', welcomeMessage: 'Hi!' });
</script>
```

### 3. カスタム

```javascript
import { mergeConfig } from './config.defaults.js';
import { initFloatingChat } from './core/FloatingChat.js';
import { createGeminiProvider } from './adapters/llm-gemini.js';

initFloatingChat(mergeConfig({
  title: 'My Bot',
  globalApiName: 'myChat',
  onReady(api) { /* ホスト連携 */ },
}));
```

## 公開 API（`window[globalApiName]`）

| メソッド | 説明 |
|----------|------|
| `addDocumentToContext(name, url, content?)` | ナレッジ追加 |
| `insertIntoPrompt(text)` | 入力欄に引用挿入・パネル展開 |
| `open()` / `close()` | パネル開閉 |
| `getState()` | `{ context, messages }` |

## 設定の主な項目

- `storageKeys.apiKeys` … LocalStorage の API キー配列
- `storageKeys.chatStatePrefix` … URL 単位の sessionStorage プレフィックス
- `bridge.enabled` … 開発用履歴 Bridge（`localhost:3002`）
- `llm.model` … 既定 `gemini-3.1-flash-lite`

## メンテナンス

テンプレ修正後、コピー運用のプロジェクトでは `assets/floating-chat/` へ再同期してください。本リポジトリは `.agent/templates` を直接 import するため同期不要です。
