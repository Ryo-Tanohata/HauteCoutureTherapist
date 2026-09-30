/** @typedef {import('./core/FloatingChat.js').FloatingChatConfig} FloatingChatConfig */

/** @returns {FloatingChatConfig} */
export function getDefaultConfig() {
    return {
        idPrefix: 'fc',
        title: 'Floating Chat',
        welcomeMessage: 'Hello! How can I help you today?',
        theme: 'aurora',
        llm: {
            // 部品は外から読まない。窓口を直に叩く（adapters/llm-gemini.js）
            model: 'gemini-3.1-flash-lite',
        },
        storageKeys: {
            chatStatePrefix: 'floating_chat_',
            apiKeys: 'floating_chat_gemini_api_keys',
            legacyApiKey: null,
        },
        bridge: {
            enabled: false,
            url: '/save_history',
        },
        context: {
            enabled: true,
            showDocPicker: true,
        },
        globalApiName: 'floatingChat',
        legacyGlobalApiName: null,
        i18n: {
            tabChat: 'Chat',
            tabSettings: 'Settings',
            knowledgeLabel: 'Knowledge Context',
            addPage: '+ Add Page',
            knowledgeSummary: '参照中のナレッジを表示',
            inputPlaceholder: 'メッセージを入力 (Enterで送信, Shift+Enterで改行)...',
            shiftEnterHint: 'Shift+Enterで改行',
            thinking: 'Thinking...',
            apiKeysLabel: 'API Keys',
            addKey: '+ Add',
            saveSettings: '設定を保存して適用',
            savedSettings: '保存されました',
            apiKeyPlaceholder: 'AIzaSy...',
            noApiKey: 'APIキーが設定されていません。Settings タブからキーを追加してください。',
            invalidApiKey: 'APIキーが無効、またはアクセス権限がありません。',
            emptyReply: 'AIからの応答を取得できませんでした。',
            keysStorageNote: 'キーはブラウザのLocalStorageに保存されます。コードには含まれません。',
            docPickerLoading: 'Loading...',
            docPickerEmpty: 'No pages found',
            docPickerError: 'Error loading pages',
            documentsHeader: 'DOCUMENTS',
            issuesHeader: 'ISSUES',
        },
        settingsHelpHtml: `
            <p style="margin: 0 0 8px 0;">このチャットは <strong style="color: #00f2fe;">Google Gemini API</strong> を使用してAI応答を生成します。</p>
            <p style="margin: 0 0 8px 0;">APIキーは <strong>無料</strong> で取得でき、以下の手順で設定できます：</p>
            <ol style="margin: 0 0 8px 0; padding-left: 18px;">
                <li>下のリンクから Google AI Studio にアクセス</li>
                <li>「Get API key」→「Create API key」をクリック</li>
                <li>生成されたキーをコピーして下の入力欄に貼り付け</li>
            </ol>
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 6px; color: #00f2fe; text-decoration: none; font-weight: 600; padding: 6px 12px; background: rgba(0, 242, 254, 0.1); border: 1px solid rgba(0, 242, 254, 0.3); border-radius: 6px;">
                🔑 Google AI Studio でキーを取得 <span style="font-size: 0.75rem;">↗</span>
            </a>
        `,
    };
}

/**
 * @param {Partial<FloatingChatConfig>} overrides
 * @returns {FloatingChatConfig}
 */
export function mergeConfig(overrides = {}) {
    const base = getDefaultConfig();
    return {
        ...base,
        ...overrides,
        llm: { ...base.llm, ...overrides.llm },
        storageKeys: { ...base.storageKeys, ...overrides.storageKeys },
        bridge: { ...base.bridge, ...overrides.bridge },
        context: { ...base.context, ...overrides.context },
        i18n: { ...base.i18n, ...overrides.i18n },
    };
}
