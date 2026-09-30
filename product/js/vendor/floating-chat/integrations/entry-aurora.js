import { mergeConfig } from '../config.defaults.js';
import { initFloatingChat } from '../core/FloatingChat.js';
import { setupAuroraContext } from './aurora-context.js';
import {
    generateWithOwnKey, getStoredApiKeys, addApiKey, getStoredApiKey, providerHeader
} from '../../../app/ai-client.js';
import { detectAiRoute, noteActualRoute } from '../../../app/ai-route.js';

const LEGACY_CHAT_KEYS = 'aurora_gemini_api_keys';
const LEGACY_CHAT_KEY = 'aurora_gemini_api_key';

/**
 * 前はチャットが自分でキーを持っていた。入れ物が2つあると、片方に入れても
 * もう片方は「キーがありません」と言う。アプリの設定側へ寄せる。
 *
 * すでに入っているものは、黙って消さずに移す。入れ直しをお願いしないため。
 */
function moveOldChatKeys() {
    let moved = 0;
    try {
        const found = [];
        const list = JSON.parse(localStorage.getItem(LEGACY_CHAT_KEYS) || '[]');
        if (Array.isArray(list)) list.forEach((k) => { if (k) found.push(String(k)); });
        const single = localStorage.getItem(LEGACY_CHAT_KEY);
        if (single) found.push(String(single));
        if (!found.length) return 0;

        const already = getStoredApiKeys();
        found.forEach((k) => { if (!already.includes(k)) { addApiKey(k); moved += 1; } });

        // 移し終えてから消す。途中で失敗しても、元が残っているようにする
        localStorage.removeItem(LEGACY_CHAT_KEYS);
        localStorage.removeItem(LEGACY_CHAT_KEY);
    } catch (e) {
        console.warn('[aurora] 古いキーの移し替えに失敗しました', e);
    }
    return moved;
}

/** Aurora Dialogue preset for management portal / viewer / CRM Demo Agent. */
export function initAuroraChat() {
    // 返事を作ったあと、実際に使われたものを札へ反映するための受け口。
    // チャットの部品が組み上がる前に generateReply が定義されるので、
    // 直に参照せず、あとから差し込む。
    let onRoute = null;

    const config = mergeConfig({
        title: 'Therapist CRM 操作ガイド Agent',
        welcomeMessage: 
            'こんにちは！**セラピストCRM 操作ガイド Agent** です。🌸\n' +
            'アプリの基本的な使い方や具体的な操作手順をご案内します。\n\n' +
            '**よく使われる操作の例:**\n' +
            '- 👥 **「新規顧客の登録手順は？」**\n' +
            '- 📅 **「カレンダーで施術記録を追加するには？」**\n' +
            '- 🎨 **「Soul Color（ソウルカラー）の決め方は？」**\n' +
            '- 📋 **「顧客カルテ・過去の履歴を見るには？」**\n\n' +
            '気になる操作やご質問があれば、いつでもメッセージでお尋ねください！',
        storageKeys: {
            chatStatePrefix: 'aurora_chat_',
            apiKeys: 'aurora_gemini_api_keys',
            legacyApiKey: 'aurora_gemini_api_key',
        },
        bridge: {
            enabled: true,
            url: '/save_history',
        },
        context: {
            enabled: true,
            showDocPicker: true,
        },
        globalApiName: 'auroraChat',
        // 返事の中の「#見出し」は、説明書の画面の中の場所を指している
        manualUrl: 'manual.html',
        settingsHelpHtml: `
            <p style="margin: 0 0 8px 0;">操作ガイドは、<strong style="color: #00f2fe;">星詠み・下ごしらえと同じAPIキー</strong>を使います。</p>
            <p style="margin: 0 0 8px 0;">キーの登録は <strong>1か所だけ</strong>です。入れる場所を探して迷わないよう、まとめてあります。</p>
        `,
        onReady: setupAuroraContext,

        // キーは「⚙️ 設定 → 🤖 AI の設定」の1か所だけ。ここでは案内に差し替える
        externalKeysHtml: `
            <label>APIキー</label>
            <p style="font-size:0.8rem;color:#94a3b8;line-height:1.7;margin:6px 0 0 0;">
                キーは <strong style="color:#00f2fe;">⚙️ 設定 →「🤖 AI の設定」</strong> で登録します。<br>
                ここで登録していたものは、そちらへ移してあります。<br>
                <span style="color:#64748b;font-size:0.75rem;">
                    星詠み・下ごしらえと同じキーを使います。Anthropic のキーでも動きます。
                </span>
            </p>`,

        // 返事の作り方も、アプリ側の仕組みに寄せる。
        // キーを順に試す・上限に当たったキーを後回しにする・使えないモデルを避ける、
        // といった手当てが、そちらには入っている。チャットは何も持っていなかった。
        generateReply: async ({ userText, contextItems }) => {
            let knowledge = '';
            (contextItems || []).forEach((c) => {
                if (c.content) knowledge += `\n---\n# ${c.name}\n${c.content}\n`;
            });

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

            const prompt = knowledge
                ? `【参照用ナレッジ】${knowledge}\n---\n上記だけを根拠に、300字程度で答えてください。\n\n質問: ${userText}`
                : `（取扱説明書がまだ読み込めていません。その旨を伝え、`
                    + `画面の「📖 取扱説明書」を見るよう案内してください）\n\n質問: ${userText}`;

            // まずPCのサーバーに頼む。居ればアカウントで作れる（キー不要）。
            // 星詠みが既にやっている形と同じ。ここだけキーを使うと、
            // ヘッダーの札と中身が食い違う。
            try {
                // 「⚙️ 設定 →🤖 AI の設定」で選ばれたAIを伝える。
                // 送らなければサーバーは今までどおりの既定（Claude優先）で動く。
                const chosen = providerHeader();
                const headers = { 'Content-Type': 'application/json', ...chosen };

                // キーを渡すのは、キーで動くものが選ばれている時だけ。
                // 常に渡すと、サーバーはキーの種類からプロバイダを推定するので、
                // 「おまかせ」のつもりがキー課金に化ける。札は「アカウント」の
                // まま中身だけキー——という食い違いが起きる（ISSUE-053）。
                const pick = chosen['x-ai-provider'];
                if (pick === 'anthropic' || pick === 'gemini') {
                    const ownKey = getStoredApiKey();
                    if (ownKey) headers['x-api-key'] = ownKey;
                }

                const res = await fetch('/api/chat', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ prompt, systemInstruction })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.text) {
                        const r = noteActualRoute(data);
                        if (onRoute) onRoute(r);
                        return { text: data.text };
                    }
                }
            } catch (e) {
                // サーバーが居ない（いつものURL・スマホ）。下のキーへ回る
            }

            try {
                const res = await generateWithOwnKey({ prompt, systemInstruction });
                const r = noteActualRoute(res);
                if (onRoute) onRoute(r);
                return { text: res.text || '（答えが空でした）' };
            } catch (e) {
                if (e && e.reason === 'no-key') {
                    return { text: 'APIキーがまだ登録されていません。'
                        + '「⚙️ 設定 →🤖 AI の設定」でキーを登録してください。' };
                }
                return { text: `AIに繋がりませんでした: ${(e && e.message) || '原因不明'}` };
            }
        },
    });

    moveOldChatKeys();
    const chat = initFloatingChat(config);

    // ヘッダーに「いま使っているAI」を出す。
    // 同じ画面でも、開き方で繋ぎ先が変わる。分からないまま使うほうが困る。
    onRoute = (route) => chat.setRoute(route.label, route.tone, route.detail);

    detectAiRoute()
        .then((route) => onRoute(route))
        .catch(() => chat.setRoute('繋ぎ先が分かりません', 'off'));

    return chat;
}

