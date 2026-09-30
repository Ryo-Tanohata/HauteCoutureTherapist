/**
 * @param {object} options
 * @param {string} options.model
 * @param {() => string[]} options.getApiKeys
 * @param {object} options.i18n
 */
export function createGeminiProvider({ model, getApiKeys, i18n }) {
    return async function generateReply({ userText, contextItems }) {
        const keys = getApiKeys();
        if (keys.length === 0) {
            return { text: i18n.noApiKey };
        }

        let lastError = null;
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            try {
                let systemContext = '';
                (contextItems || []).forEach((c) => {
                    if (c.content) {
                        systemContext += `\n---\n# ${c.name}\n${c.content}\n`;
                    }
                });

                // 答えのもとは、取扱説明書（docs/manual.md）ひとつ。
                //
                // 以前はここにアプリの仕様を直に書いていたが、アプリが変わっても
                // ここは変わらないので、古い説明のまま答えるようになっていた。
                // 説明書は画面に出しているものと同じファイルなので、
                // 説明書を直せば、答えも一緒に変わる。
                const systemInstruction =
                    `【役割】\n`
                    + `あなたは「セラピストCRM 操作ガイド」です。サロンのカルテアプリ\n`
                    + `「Terre Mer KARTE」の使い方を案内します。\n\n`
                    + `【答え方の決まり】\n`
                    + `- 日本語で答えてください。\n`
                    + `- **【参照用ナレッジ】の取扱説明書に書かれていることだけ**を根拠にしてください。\n`
                    + `- 書かれていないことは、推測で答えないでください。\n`
                    + `  「説明書には書かれていません」と正直に伝え、近い項目を案内してください。\n`
                    + `- 施術中に読むことが多いので、**短く・手順で**答えてください。\n`
                    + `- ボタンの名前は、説明書に出てくるとおりに書いてください（例:「📤 書き出す」）。\n`
                    + `- 消える・戻せないことに関わる質問には、**先に注意を伝えて**から手順を書いてください。\n`;

                let prompt = userText;
                if (systemContext) {
                    prompt = `${systemInstruction}\n【参照用ナレッジ】\n${systemContext}\n---\n`
                        + `上記だけを根拠に、300字程度で答えてください。\n\n質問: ${userText}`;
                } else {
                    prompt = `${systemInstruction}\n（取扱説明書がまだ読み込めていません。`
                        + `その旨を伝え、画面の「📖 取扱説明書」を見るよう案内してください）\n\n質問: ${userText}`;
                }

                // 部品を外から読み込まず、Gemini の窓口を直に叩く。
                //
                // 以前は esm.run から SDK を読んでいた。読み込んだものは
                // このページの中で動くので、配る側が差し替われば、カルテも
                // 合言葉も持っていける。使っているのは「文を投げて返事を
                // 受け取る」だけなので、自前で足りる。
                const res = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
                    {
                        method: 'POST',
                        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
                        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
                    });
                const json = await res.json().catch(() => null);
                if (!res.ok) {
                    throw new Error((json && json.error && json.error.message) || `HTTP ${res.status}`);
                }
                const cand = (json.candidates || [])[0];
                const text = ((cand && cand.content && cand.content.parts) || [])
                    .map((part) => part.text || '').join('\n').trim();

                return { text: text || i18n.emptyReply };
            } catch (e) {
                console.warn(`[Key Rotation] API key slot ${i + 1} failed, trying next key. Error:`, e);
                lastError = e;
                continue;
            }
        }

        console.error('[Key Rotation] All API key slots failed.');
        if (lastError?.message?.includes('403')) {
            return { text: i18n.invalidApiKey };
        }
        return { text: `AI通信エラー (全スロット失敗): ${lastError?.message || 'Unknown Error'}` };
    };
}
