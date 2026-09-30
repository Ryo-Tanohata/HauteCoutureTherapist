/**
 * Anthropic Claude Provider for Floating Chat
 * Communicates with the server-side bridge.
 */
export function createClaudeProvider({ model, getApiKeys, i18n }) {
    return async function generateReply({ userText, contextItems }) {
        const keys = getApiKeys();
        // Even if local keys are empty, we can try the server-side key if configured
        
        let systemContext = '';
        (contextItems || []).forEach((c) => {
            if (c.content) {
                systemContext += `\n---\n# ${c.name}\n${c.content}\n`;
            }
        });

        const systemInstruction = 
            `あなたは「セラピストCRM AIアシスタント（Claude版）」です。セラピスト向け顧客管理Webアプリの使い方や機能、具体的な操作手順を案内したり、顧客カルテの内容に基づいたアドバイスを提供します。\n\n` +
            `【アプリの基本機能】\n` +
            `1. 👥 顧客登録: 名前、Soul Color、生年月日、紹介者、初診メモ等を管理。\n` +
            `2. 🎨 Soul Color: セラピーで使用するカラーを1〜5色設定可能。\n` +
            `3. 📅 カレンダー: 日毎の施術記録（メニュー、金額、訴え、処方）を管理。\n` +
            `4. 📋 顧客カルテ: 過去の履歴や統計を確認可能。\n\n` +
            `【回答ルール】\n` +
            `- 日本語で丁寧に回答してください。\n` +
            `- Markdown形式を活用してください。\n` +
            `- 専門的かつ温かみのあるトーンで回答してください。`;

        // We use the first key if available, otherwise rely on server-side env var
        const apiKey = keys.length > 0 ? keys[0] : null;

        try {
            const response = await fetch('/api/ai/claude', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(apiKey ? { 'X-API-Key': apiKey } : {})
                },
                body: JSON.stringify({
                    model: model || 'claude-3-5-sonnet-20240620',
                    system: systemInstruction + (systemContext ? `\n\n【参照用ナレッジ】\n${systemContext}` : ''),
                    messages: [
                        { role: 'user', content: userText }
                    ]
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.details || errData.error || 'API Request failed');
            }

            const data = await response.json();
            
            // Claude API response structure check
            const textContent = data.content?.[0]?.text;
            return { text: textContent || i18n.emptyReply };

        } catch (e) {
            console.error('Claude Provider Error:', e);
            if (e.message.includes('API key is not configured')) {
                return { text: 'Anthropic APIキーが設定されていません。チャット設定からAPIキーを入力するか、サーバー環境変数を確認してください。' };
            }
            return { text: `AI通信エラー: ${e.message}` };
        }
    };
}
