/**
 * 使うモデルの決め方。
 *
 * サーバー（server/ai-provider.js）とブラウザ（ai-client.js）の両方が
 * ここを読む。片方だけ古いモデルを指していると、同じ依頼でも経路によって
 * 別のモデルが答えることになるため、並びは1か所に置く。
 *
 * ── 並びの方針：速さ・安さ優先 ──
 * この用途は「400字以内の日本語の業務メモ」で、画像も長文入力も無い。
 * 施術の直前に開いて数秒で読むものなので、賢さより待ち時間が効く。
 * 禁忌の除外は oil-safety.js が先に済ませていて、モデルの賢さが
 * 安全性に直結する作りにはしていない。
 */

/** 上から順に、使えるものが見つかった時点で採用する */
export const MODEL_PREFERENCE = {
    anthropic: ['claude-haiku-4-5', 'claude-sonnet-5', 'claude-opus-5'],
    gemini: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']
};

/** 一覧が取れなかったときに使う既定 */
export function defaultModel(provider) {
    return (MODEL_PREFERENCE[provider] || [])[0] || null;
}

/** Agent SDK（このPCのClaudeログイン）で使うモデル */
export const AGENT_SDK_MODEL = MODEL_PREFERENCE.anthropic[0];

/**
 * 画面から選べる Claude のモデル。
 *
 * 既定は速さ優先で Haiku。ただし「今日の星詠みだけは丁寧に書かせたい」
 * のように、その場で重いモデルへ切り替えたいことがあるので選べるようにする。
 * 並びは MODEL_PREFERENCE.anthropic と同じ（軽い順）。
 */
export const CLAUDE_MODEL_CHOICES = [
    { id: '', label: 'おまかせ（速さ優先）' },
    { id: 'claude-haiku-4-5', label: 'Haiku 4.5 — 速い・軽い' },
    { id: 'claude-sonnet-5', label: 'Sonnet 5 — ふつう' },
    { id: 'claude-opus-5', label: 'Opus 5 — 賢い・遅い' }
];

/**
 * 画面から渡ってきたモデル名を検証する。
 * 知らない名前は受け付けない（そのままAgent SDKへ渡さない）。
 */
export function normalizeClaudeModel(value) {
    const id = String(value || '').trim();
    if (!id) return null;
    return MODEL_PREFERENCE.anthropic.includes(id) ? id : null;
}

/** 軽いモデルかどうかの目印。希望の並びに無いモデルしか無かったときに使う。 */
const LIGHT_HINTS = {
    anthropic: ['haiku', 'sonnet'],
    gemini: ['flash', 'flash-lite']
};

/**
 * 使えるモデルの一覧から1つ選ぶ。
 *
 * 1. 希望の並びに完全一致するもの
 * 2. 希望の並びに前方一致するもの（日付付きIDなど）
 * 3. 軽いと分かる名前のもの
 * 4. どれも無ければ一覧の先頭
 * 一覧そのものが無ければ既定に戻す。
 *
 * @param {string} provider 'anthropic' | 'gemini'
 * @param {string[]} available そのキーで使えるモデルID
 */
export function chooseModel(provider, available) {
    const prefs = MODEL_PREFERENCE[provider] || [];
    if (!Array.isArray(available) || available.length === 0) return defaultModel(provider);

    for (const id of prefs) {
        if (available.includes(id)) return id;
    }
    for (const id of prefs) {
        const hit = available.find((a) => typeof a === 'string' && a.startsWith(id));
        if (hit) return hit;
    }
    for (const hint of (LIGHT_HINTS[provider] || [])) {
        const hit = available.find((a) => typeof a === 'string' && a.includes(hint));
        if (hit) return hit;
    }
    return available[0] || defaultModel(provider);
}

/**
 * 一覧APIの応答から、文章生成に使えるモデルIDだけを取り出す。
 *
 * 形が想定と違っても落とさず空配列を返す。呼び出し側は空なら既定に戻る。
 */
export function extractModelIds(provider, json) {
    try {
        if (provider === 'anthropic') {
            // { data: [{ id, display_name, ... }], has_more, ... }
            const rows = (json && json.data) || [];
            return rows.map((m) => m && m.id).filter((id) => typeof id === 'string');
        }

        if (provider === 'gemini') {
            // { models: [{ name: "models/gemini-2.5-flash", supportedGenerationMethods: [...] }] }
            const rows = (json && json.models) || [];
            return rows
                .filter((m) => {
                    const methods = (m && m.supportedGenerationMethods) || [];
                    // 文章生成に使えないもの（埋め込みなど）を落とす
                    return methods.includes('generateContent');
                })
                .map((m) => String(m.name || '').replace(/^models\//, ''))
                .filter((id) => id && !id.includes('embedding'));
        }
    } catch (e) {
        return [];
    }
    return [];
}
