import { mergeConfig } from '../config.defaults.js';
import { initFloatingChat } from '../core/FloatingChat.js';
import { setupAuroraContext } from './aurora-context.js';
import { createClaudeProvider } from '../adapters/llm-claude.js';

/** Claude AI preset for management portal / viewer / CRM Demo Agent. */
export function initClaudeChat() {
    const config = mergeConfig({
        title: 'Claude AI アシスタント',
        welcomeMessage: 
            'こんにちは！**Claude AI アシスタント** です。🕊️\n' +
            'AnthropicのClaude 3.5 Sonnetを使用して、アプリの操作や顧客管理のアドバイスを行います。\n\n' +
            '**このAIができること:**\n' +
            '- 📖 **操作の案内**: アプリの使い方を詳しく説明します。\n' +
            '- 💡 **セラピーのアドバイス**: 顧客のカルテ情報を踏まえた提案をします。\n' +
            '- ✍️ **文章作成の補助**: お礼メールの案などを一緒に考えます。\n\n' +
            'ご自身のAnthropic APIキーをお持ちの場合は、設定から登録してプランの範囲内でご利用いただけます。',
        storageKeys: {
            chatStatePrefix: 'claude_chat_',
            apiKeys: 'claude_api_keys',
        },
        bridge: {
            enabled: true,
            url: '/save_history',
        },
        context: {
            enabled: true,
            showDocPicker: true,
        },
        globalApiName: 'claudeChat',
        settingsHelpHtml: `
            <p style="margin: 0 0 8px 0;">このチャットは <strong style="color: #d97706;">Anthropic Claude API</strong> を使用します。</p>
            <p style="margin: 0 0 8px 0;">ご自身のAPIキーを設定することで、プランの制限内で自由にご利用いただけます：</p>
            <ol style="margin: 0 0 8px 0; padding-left: 18px;">
                <li>Anthropic Console にログイン</li>
                <li>API Keys セクションで新しいキーを作成</li>
                <li>下の入力欄にキーを貼り付けて保存</li>
            </ol>
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 6px; color: #d97706; text-decoration: none; font-weight: 600; padding: 6px 12px; background: rgba(217, 119, 6, 0.1); border: 1px solid rgba(217, 119, 6, 0.3); border-radius: 6px;">
                🔑 Anthropic Console でキーを取得 <span style="font-size: 0.75rem;">↗</span>
            </a>
        `,
        generateReply: createClaudeProvider({
            model: 'claude-3-5-sonnet-20240620',
            getApiKeys: () => {
                const stored = localStorage.getItem('claude_api_keys');
                try {
                    return stored ? JSON.parse(stored) : [];
                } catch (e) {
                    return [];
                }
            },
            i18n: {
                emptyReply: 'AIからの返答が空でした。',
                thinking: '考え中...',
            }
        }),
        onReady: setupAuroraContext,
    });

    return initFloatingChat(config);
}
