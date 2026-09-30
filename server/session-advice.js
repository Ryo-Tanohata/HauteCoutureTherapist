/**
 * セッション提案の生成。
 *
 * 星詠み（advice.js）が「全員共通・事前生成」なのに対し、こちらは
 * 「この顧客・この日・この訴え」に対する提案なので、その場で生成する。
 *
 * ── 安全の考え方 ──
 * 禁忌の判定はAIにさせない。呼び出し側（ブラウザ）が oil-safety.js で
 * 除外を済ませ、ここには「使ってよい候補」だけが渡ってくる。
 * AIの役割は、残った候補と訴えを見て言葉を組むことに限定する。
 * プロンプトでも「候補リスト以外の精油を出さないこと」を明示している。
 *
 * ── 顧客情報の扱い ──
 * 生成のために顧客の訴えや体質を外部モデルへ送る。氏名は送らない
 * （提案の質に寄与せず、送る必要がないため）。
 */
const { generateAdvice } = require('./ai-provider');
const path = require('path');
const { pathToFileURL } = require('url');

/**
 * プロンプトの組み立てはブラウザと共有している。
 * ブラウザ側は ESM なので、CJS のここからは動的 import で読む。
 */
const PROMPT_MODULE = pathToFileURL(
    path.join(__dirname, '..', 'product', 'js', 'app', 'session-prompt.js')
).href;

let promptModulePromise = null;
function loadPromptModule() {
    if (!promptModulePromise) promptModulePromise = import(PROMPT_MODULE);
    return promptModulePromise;
}

/** セッション提案を生成する */
async function generateSessionAdvice(ctx, options = {}) {
    if (!ctx || !Array.isArray(ctx.allowedOils) || ctx.allowedOils.length === 0) {
        throw new Error('使用できる精油の候補がありません。体質の設定をご確認ください。');
    }

    const { buildSessionPrompt } = await loadPromptModule();
    const { prompt, systemInstruction } = buildSessionPrompt(ctx);
    const result = await generateAdvice({
        prompt, systemInstruction,
        customApiKey: options.customApiKey,
        preferredProvider: options.preferredProvider,
        preferredModel: options.preferredModel,
        label: 'セッション提案'
    });

    return {
        advice: result.text,
        mode: ctx.mode,
        usedModel: result.usedModel,
        usedProvider: result.usedProvider,
        fallbackFrom: result.fallbackFrom || [],
        generatedAtISO: new Date().toISOString()
    };
}

/** テスト・デモ生成用。ブラウザ側と同じ組み立てを返す。 */
async function buildSessionPromptAsync(ctx) {
    const { buildSessionPrompt } = await loadPromptModule();
    return buildSessionPrompt(ctx);
}

module.exports = { buildSessionPromptAsync, generateSessionAdvice };
