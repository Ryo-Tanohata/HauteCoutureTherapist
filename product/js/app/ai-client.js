/**
 * ブラウザから直接AIを呼ぶための入り口。
 *
 * 通常は同じPC上のサーバー（server/bridge.js）が生成を担当する。
 * ここはそれが無い場所（静的配信・共有リンク・出先の端末）で、
 * セラピスト自身のAPIキーを使って動かすための経路。
 *
 * 対応：
 *   Anthropic（Claude Messages API）… キーが sk-ant- で始まる
 *   Google Gemini                  … それ以外
 * どちらを使うかはキーの形で判定する。サーバー側（ai-provider.js の
 * classifyApiKey）と同じ判定なので、同じキーがどちらの経路でも通る。
 *
 * キーは複数登録できる。上から順に試し、失敗したら次へ進む
 * （残量切れや期限切れのときに、もう一方で通るようにするため）。
 *
 * ── 鍵の扱い ──
 * キーはこのブラウザの localStorage にだけ置く。どこへも送らない
 * （送り先は選ばれたAI提供元そのものだけ）。共用端末では使わないこと。
 */

import {
    MODEL_PREFERENCE, defaultModel, chooseModel, extractModelIds, normalizeClaudeModel
} from './model-registry.js';

const STORAGE_KEY = 'therapist_ai_api_key';    // 旧：単数。読み込み時に配列へ移す
const STORAGE_LIST = 'therapist_ai_api_keys';  // 現行：配列
const STORAGE_MODELS = 'therapist_ai_models';  // 調べたモデル（提供元ごと）

/**
 * 生成させる長さの上限。
 * 本文は400字以内だが、見出し・箇条書きと日本語のトークン数を考えると
 * 1200では足りず、実際に途中で切れていた。サーバー側（8192）と揃える。
 */
const MAX_OUTPUT_TOKENS = 8192;

/**
 * キーの形からどちらの提供元かを見分ける。
 * サーバー側と同じ規則にしてある。
 */
export function classifyApiKey(key) {
    if (!key) return null;
    return String(key).trim().startsWith('sk-ant-') ? 'anthropic' : 'gemini';
}

export function getProviderLabel(provider) {
    if (provider === 'anthropic') return 'Anthropic（Claude）';
    if (provider === 'gemini') return 'Google（Gemini）';
    return '';
}

// ---------------------------------------------------------------------------
// どのAIで生成するかの選択
//
// このPCのClaudeログイン（Agent SDK）は、サーバーが動いている時だけ使える。
// ブラウザからは呼べないので、この選択はサーバー経由の生成にだけ効く。
// ---------------------------------------------------------------------------

const PROVIDER_PREF_KEY = 'therapist_ai_provider_pref';

/** 画面で選べるAI。'auto' は「おまかせ」で、サーバーの既定に任せる。 */
export const PROVIDER_CHOICES = ['auto', 'claude', 'anthropic', 'gemini'];

export function getProviderChoiceLabel(choice) {
    switch (choice) {
        case 'claude': return 'このPCのClaudeログイン（APIキー不要）';
        case 'anthropic': return 'Anthropic APIキー（Claude）';
        case 'gemini': return 'Gemini APIキー';
        default: return 'おまかせ（自動で選ぶ）';
    }
}

/** 選ばれているAI。未設定・不正な値は 'auto' に倒す。 */
export function getPreferredProvider() {
    try {
        const raw = localStorage.getItem(PROVIDER_PREF_KEY);
        return PROVIDER_CHOICES.includes(raw) ? raw : 'auto';
    } catch (e) {
        return 'auto';
    }
}

export function setPreferredProvider(choice) {
    const next = PROVIDER_CHOICES.includes(choice) ? choice : 'auto';
    try { localStorage.setItem(PROVIDER_PREF_KEY, next); } catch (e) { /* noop */ }
    return next;
}

const CLAUDE_MODEL_PREF_KEY = 'therapist_claude_model_pref';

/**
 * 選ばれている Claude のモデル。空文字は「おまかせ」。
 * 知らない名前が保存されていた場合も、おまかせに倒す。
 */
export function getPreferredClaudeModel() {
    try {
        return normalizeClaudeModel(localStorage.getItem(CLAUDE_MODEL_PREF_KEY)) || '';
    } catch (e) {
        return '';
    }
}

export function setPreferredClaudeModel(model) {
    const next = normalizeClaudeModel(model) || '';
    try {
        if (next) localStorage.setItem(CLAUDE_MODEL_PREF_KEY, next);
        else localStorage.removeItem(CLAUDE_MODEL_PREF_KEY);
    } catch (e) { /* noop */ }
    return next;
}

/**
 * サーバーへ送るヘッダー。'auto'・おまかせの時は何も足さない
 * （送らなければサーバーは今までどおりの既定で動く）。
 *
 * モデルの指定は Claude 系にしか意味がないので、Gemini を選んでいる時は送らない。
 */
export function providerHeader() {
    const choice = getPreferredProvider();
    const headers = {};
    if (choice !== 'auto') headers['x-ai-provider'] = choice;

    if (choice !== 'gemini') {
        const model = getPreferredClaudeModel();
        if (model) headers['x-ai-model'] = model;
    }
    return headers;
}

// ---------------------------------------------------------------------------
// CSP（このページの接続制限）の記録
//
// 外部への接続がページの設定で止められた場合、fetch は素の TypeError に
// なるだけで理由が分からない。ブラウザは別途 securitypolicyviolation を
// 出すので、それを拾っておき、失敗の説明に使う。
// ---------------------------------------------------------------------------

let lastCspBlock = null;

if (typeof document !== 'undefined') {
    document.addEventListener('securitypolicyviolation', (e) => {
        const directive = e.effectiveDirective || e.violatedDirective || '';
        if (directive.indexOf('connect-src') === 0 || directive.indexOf('default-src') === 0) {
            lastCspBlock = { uri: e.blockedURI || '', at: Date.now() };
        }
    });
}

/** 直近◯秒以内に接続が止められていたか */
function recentCspBlock(withinMs = 5000) {
    if (!lastCspBlock) return null;
    return (Date.now() - lastCspBlock.at) <= withinMs ? lastCspBlock : null;
}

// ---------------------------------------------------------------------------
// キーの保存
// ---------------------------------------------------------------------------

function readList() {
    try {
        const raw = localStorage.getItem(STORAGE_LIST);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : null;
    } catch (e) {
        return null;
    }
}

function writeList(list) {
    try {
        localStorage.setItem(STORAGE_LIST, JSON.stringify(list));
    } catch (e) { /* 保存できない環境では何もしない */ }
}

/**
 * 登録済みのキーを、試す順に返す。
 * 以前の単数保存や、浮遊チャットのGeminiキーもここへ引き継ぐ。
 */
export function getStoredApiKeys() {
    const list = readList();
    if (list) return list;

    // 初回だけ、古い保存先から拾って配列に移す
    const migrated = [];
    try {
        const single = localStorage.getItem(STORAGE_KEY);
        if (single) migrated.push(single);

        const legacyLists = ['gemini_api_keys', 'chat_api_keys', 'floating_chat_api_keys', 'aurora_api_keys'];
        for (const k of legacyLists) {
            const item = localStorage.getItem(k);
            if (!item) continue;
            const parsed = JSON.parse(item);
            if (Array.isArray(parsed)) parsed.filter(Boolean).forEach((v) => migrated.push(String(v)));
        }
        ['gemini_api_key', 'chat_api_key'].forEach((k) => {
            const v = localStorage.getItem(k);
            if (v) migrated.push(v);
        });
    } catch (e) { /* 読めないものは無視する */ }

    const unique = [...new Set(migrated.map((v) => v.trim()).filter(Boolean))];
    if (unique.length > 0) writeList(unique);
    return unique;
}

/** 先頭のキー。サーバーへ x-api-key で渡すのはこれ。 */
export function getStoredApiKey() {
    return getStoredApiKeys()[0] || null;
}

/**
 * キーを追加する。
 * @returns {{provider: string, added: boolean}} 既に同じものがあれば added=false
 */
export function addApiKey(key) {
    const trimmed = String(key || '').trim();
    if (!trimmed) return { provider: null, added: false };
    const list = getStoredApiKeys();
    if (list.includes(trimmed)) return { provider: classifyApiKey(trimmed), added: false };
    list.push(trimmed);
    writeList(list);
    return { provider: classifyApiKey(trimmed), added: true };
}

export function removeApiKeyAt(index) {
    const list = getStoredApiKeys();
    if (index < 0 || index >= list.length) return;
    list.splice(index, 1);
    writeList(list);
}

/** 優先順を1つ上げる（残量切れのキーを後ろへ回すため） */
export function moveApiKeyUp(index) {
    const list = getStoredApiKeys();
    if (index <= 0 || index >= list.length) return;
    [list[index - 1], list[index]] = [list[index], list[index - 1]];
    writeList(list);
}

export function clearApiKeys() {
    try {
        localStorage.removeItem(STORAGE_LIST);
        localStorage.removeItem(STORAGE_KEY);
    } catch (e) { /* 何もしない */ }
}

/** 画面に出すための伏せ字。末尾4文字だけ見せる。 */
export function maskApiKey(key) {
    const s = String(key || '');
    return s.length <= 4 ? '…' : `…${s.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// 使うモデルの決定
//
// キーを登録したときに1回だけ「そのキーで使えるモデル」を問い合わせ、
// 速さ優先の並び（model-registry.js）から1つ選んで覚えておく。
// 生成のたびに問い合わせると毎回1往復ぶん遅くなるため、ここでは調べない。
// 一覧が取れなければ既定（並びの先頭）に戻る。
// ---------------------------------------------------------------------------

function readModelStore() {
    try {
        const raw = localStorage.getItem(STORAGE_MODELS);
        const parsed = raw ? JSON.parse(raw) : null;
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
        return {};
    }
}

function writeModelStore(store) {
    try {
        localStorage.setItem(STORAGE_MODELS, JSON.stringify(store));
    } catch (e) { /* 保存できない環境では何もしない */ }
}

/** いまその提供元で使うモデル。調べていなければ既定。 */
export function getChosenModel(provider) {
    const entry = readModelStore()[provider];
    return (entry && entry.model) || defaultModel(provider);
}

/** 画面表示用。調べた結果か既定かも返す。 */
export function getModelInfo(provider) {
    const entry = readModelStore()[provider] || null;
    return {
        provider,
        model: (entry && entry.model) || defaultModel(provider),
        checked: Boolean(entry && entry.model),
        checkedAt: (entry && entry.checkedAt) || null,
        available: (entry && entry.available) || [],
        error: (entry && entry.error) || null
    };
}

/** そのキーで使えるモデルIDの一覧を取る */
async function listModelIds(provider, apiKey) {
    if (provider === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/models?limit=100', {
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            }
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
            throw new Error((json && json.error && json.error.message) || `HTTP ${res.status}`);
        }
        return extractModelIds('anthropic', json);
    }

    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
        headers: { 'x-goog-api-key': apiKey }
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
        throw new Error((json && json.error && json.error.message) || `HTTP ${res.status}`);
    }
    return extractModelIds('gemini', json);
}

/**
 * その提供元のキーで使えるモデルを調べ直し、1つ選んで覚える。
 * 失敗しても投げない（既定のまま動かしたいため）。結果は戻り値で分かる。
 */
export async function refreshModelChoice(provider, apiKey, options = {}) {
    const exclude = options.exclude || [];
    const key = apiKey || getStoredApiKeys().find((k) => classifyApiKey(k) === provider);
    const store = readModelStore();
    if (!key) {
        delete store[provider];
        writeModelStore(store);
        return getModelInfo(provider);
    }

    try {
        const available = await listModelIds(provider, key);
        // 直前に「無い」と言われたモデルは、一覧にまだ載っていても選ばない。
        // 一覧が実際の可用性より遅れていることがあるため。
        const usable = available.filter((id) => !exclude.includes(id));
        const model = chooseModel(provider, usable);
        store[provider] = { model, available, checkedAt: new Date().toISOString(), error: null };
        writeModelStore(store);
    } catch (err) {
        // 調べられなくても使えるようにしておく。理由だけ残す。
        store[provider] = {
            model: defaultModel(provider),
            available: [],
            checkedAt: new Date().toISOString(),
            error: err instanceof TypeError ? '接続できませんでした' : err.message
        };
        writeModelStore(store);
    }
    return getModelInfo(provider);
}

/** そのモデルが使えなかったときに、覚えている選択を捨てる */
function forgetModelChoice(provider) {
    const store = readModelStore();
    delete store[provider];
    writeModelStore(store);
}

/**
 * 「そのモデルは使えない」という類のエラーか。
 *
 * 消えたモデルだけでなく、割り当てが 0 の場合もここに含める。
 * Google は提供をやめたモデルに対して 429 と `limit: 0` を返すことがあり、
 * 文面は「上限超過」だが実質は「そのキーでは使えない」なので、
 * 別のモデルで取り直したほうが通る。
 */
function looksLikeMissingModel(message) {
    const m = String(message || '').toLowerCase();
    if (m.includes('not_found') || m.includes('not found')
        || m.includes('does not exist') || m.includes('unsupported model')
        || m.includes('is not supported')) {
        return true;
    }
    // 「limit: 0」＝そもそも割り当てが無い。残量切れとは別物。
    return /limit:\s*0\b/.test(m) || m.includes('quota_limit_value: 0');
}

// ---------------------------------------------------------------------------
// 使用量の記録
//
// 無料枠が足りているのかを、感覚ではなく数で確かめられるようにする。
// 提供元に問い合わせる術は無いので、こちらから呼んだ回数を数える。
// （枠はキーではなくプロジェクト単位なので、キーを増やしても増えない）
// ---------------------------------------------------------------------------

const STORAGE_USAGE = 'therapist_ai_usage';
const USAGE_KEEP_DAYS = 14;

function todayKey() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function readUsage() {
    try {
        const raw = localStorage.getItem(STORAGE_USAGE);
        const parsed = raw ? JSON.parse(raw) : null;
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
        return {};
    }
}

/** 1回の呼び出しを数える。失敗も数える（無駄打ちも枠を使うため） */
function recordUsage(provider, model, ok) {
    try {
        const store = readUsage();
        const day = todayKey();
        const entry = store[day] || { total: 0, ok: 0, ng: 0, byProvider: {} };
        entry.total += 1;
        entry[ok ? 'ok' : 'ng'] += 1;
        entry.byProvider[provider] = (entry.byProvider[provider] || 0) + 1;
        if (ok && model) entry.lastModel = model;
        store[day] = entry;

        // 古い日は捨てる
        Object.keys(store).sort().slice(0, -USAGE_KEEP_DAYS).forEach((k) => delete store[k]);
        localStorage.setItem(STORAGE_USAGE, JSON.stringify(store));
    } catch (e) { /* 記録できなくても生成は続ける */ }
}

/** 画面表示用。今日と、直近の日ごとの件数を返す。 */
export function getUsageSummary(days = 7) {
    const store = readUsage();
    const today = store[todayKey()] || { total: 0, ok: 0, ng: 0, byProvider: {} };
    const recent = Object.keys(store).sort().slice(-days).reverse()
        .map((day) => ({ day, ...store[day] }));
    return { today, recent };
}

export function clearUsage() {
    try { localStorage.removeItem(STORAGE_USAGE); } catch (e) { /* 何もしない */ }
}

/**
 * 「そのキーは今この時間は使えない」＝残量切れ・回数制限か。
 *
 * `limit: 0` は残量切れではなく「そのモデルの割り当てが無い」なので
 * ここには含めない（そちらは looksLikeMissingModel が拾う）。
 */
function looksRateLimited(message) {
    const m = String(message || '').toLowerCase();
    if (/limit:\s*0\b/.test(m)) return false;
    return m.includes('quota') || m.includes('rate limit')
        || m.includes('rate_limit') || m.includes('resource_exhausted')
        || m.includes('too many requests') || m.includes('429');
}

/**
 * そのキーを一覧の末尾へ回す。
 * 制限に当たったキーを先頭に置いたままだと、次に使うときも必ず1回
 * 無駄打ちすることになるため。
 */
export function demoteApiKey(key) {
    const list = getStoredApiKeys();
    const at = list.indexOf(key);
    if (at < 0 || at === list.length - 1) return false;
    list.splice(at, 1);
    list.push(key);
    writeList(list);
    return true;
}

/**
 * 提供元のエラー文は長く、URLや計測名が続くことがある。
 * 画面に出すのは要点だけにする（全文は開発者コンソールに残る）。
 */
function shortenProviderError(message) {
    let text = String(message || '').trim();
    // 案内URL以降は落とす
    text = text.split(/\s*(?:For more information|To monitor|head to:|Please retry)/i)[0];
    text = text.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
    text = text.replace(/[*・]\s*$/, '').trim();
    return text.length > 160 ? `${text.slice(0, 160)}…` : text;
}

// ---------------------------------------------------------------------------
// 生成
// ---------------------------------------------------------------------------

/** Anthropic Messages API をブラウザから直接呼ぶ */
async function callAnthropic({ prompt, systemInstruction, apiKey, model }) {
    const useModel = model || getChosenModel('anthropic');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            // ブラウザから直接呼ぶことを明示的に許可するヘッダ。
            // これが無いと Anthropic 側が CORS で弾く。
            'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
            model: useModel,
            // 400字の本文でも、見出し4つ＋日本語（1字が複数トークン）で
            // 1200では足りず途中で切れることがあった。余裕を持たせる。
            max_tokens: MAX_OUTPUT_TOKENS,
            system: systemInstruction,
            messages: [{ role: 'user', content: prompt }]
        })
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) {
        const detail = (json && json.error && json.error.message) || `HTTP ${res.status}`;
        throw new Error(detail);
    }
    const text = (json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (!text) throw new Error('本文が空でした');
    return {
        text,
        usedModel: json.model || useModel,
        usedProvider: 'anthropic',
        truncated: json.stop_reason === 'max_tokens'
    };
}

/** Gemini をブラウザから直接呼ぶ */
async function callGemini({ prompt, systemInstruction, apiKey, model }) {
    const useModel = model || getChosenModel('gemini');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${useModel}:generateContent`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                maxOutputTokens: MAX_OUTPUT_TOKENS,
                temperature: 0.7,
                // 2.5系は既定で「考えて」から書く。その思考も出力の枠を
                // 使うため、枠が本文に届かず途中で切れる。ここは400字の
                // 業務メモなので思考は要らない。切って全部を本文に回す。
                thinkingConfig: { thinkingBudget: 0 }
            }
        })
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) {
        const detail = (json && json.error && json.error.message) || `HTTP ${res.status}`;
        throw new Error(detail);
    }
    const cand = (json.candidates || [])[0];
    const text = ((cand && cand.content && cand.content.parts) || [])
        .map((p) => p.text || '').join('\n').trim();
    if (!text) throw new Error('本文が空でした');
    return {
        text,
        usedModel: useModel,
        usedProvider: 'gemini',
        truncated: (cand && cand.finishReason) === 'MAX_TOKENS'
    };
}

/**
 * 登録されたキーを上から順に試して生成する。
 *
 * 失敗の理由はキーごとに残し、全部だめだったときにまとめて返す。
 * 「キーは入っているのに動かない」ときに、どこで止まったのかが
 * 画面から分かるようにするため。
 *
 * @returns {Promise<{text, usedModel, usedProvider, keyIndex}>}
 */
export async function generateWithOwnKey({ prompt, systemInstruction, apiKey, model }) {
    const keys = apiKey ? [apiKey] : getStoredApiKeys();
    if (keys.length === 0) {
        const err = new Error('APIキーが設定されていません。');
        err.reason = 'no-key';
        throw err;
    }

    const failures = [];
    const rateLimitedKeys = [];
    let blockedByPage = false;

    // 明示的に1本だけ渡された場合は並べ替えない（呼び出し側の指定を尊重）
    const mayReorder = !apiKey;
    const applyDemotions = () => {
        if (!mayReorder) return;
        rateLimitedKeys.forEach((k) => demoteApiKey(k));
    };

    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const provider = classifyApiKey(key);
        const args = { prompt, systemInstruction, apiKey: key, model };
        try {
            const result = provider === 'anthropic' ? await callAnthropic(args) : await callGemini(args);
            applyDemotions();
            recordUsage(provider, result.usedModel, true);
            return { ...result, keyIndex: i, demoted: rateLimitedKeys.length };
        } catch (err) {
            // 覚えていたモデルが無くなっていた場合。提供元がモデルを
            // 入れ替えることがあるので、その場で調べ直して1度だけやり直す。
            if (!model && looksLikeMissingModel(err.message)) {
                // 捨てる前に、いま失敗したモデルを控えておく
                const failed = getChosenModel(provider);
                forgetModelChoice(provider);
                try {
                    await refreshModelChoice(provider, key, { exclude: [failed] });
                    const retry = provider === 'anthropic' ? await callAnthropic(args) : await callGemini(args);
                    applyDemotions();
                    recordUsage(provider, retry.usedModel, true);
                    return { ...retry, keyIndex: i, remodeled: true, demoted: rateLimitedKeys.length };
                } catch (again) {
                    err = again;
                }
            }
            // TypeError は「送信すらできなかった」＝接続が止められたか通信断
            const isNetwork = err instanceof TypeError;
            if (isNetwork) blockedByPage = true;
            if (!isNetwork) console.warn('[AI] 生成に失敗:', err.message);
            if (!isNetwork && looksRateLimited(err.message)) rateLimitedKeys.push(key);
            recordUsage(provider, null, false);
            failures.push({
                index: i,
                provider,
                masked: maskApiKey(key),
                message: isNetwork ? '接続できませんでした' : shortenProviderError(err.message)
            });
        }
    }

    applyDemotions();

    // securitypolicyviolation は fetch の失敗より少し後に届く。
    // 先に判定すると取りこぼすので、接続できなかったときだけ一拍待つ。
    if (blockedByPage) {
        await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const csp = recentCspBlock();
    if (csp) {
        const host = csp.uri ? csp.uri.replace(/^(https?:\/\/[^/]+).*$/, '$1') : '外部のAI';
        const e = new Error(`この画面の接続制限（CSP）が ${host} への接続を止めました。`
            + 'claude.ai の共有画面では外部への通信ができません。'
            + 'サロンのPCでアプリを起動するか、ご自分で配信している画面からお試しください。');
        e.reason = 'csp';
        e.failures = failures;
        throw e;
    }

    if (blockedByPage && failures.every((f) => f.message === '接続できませんでした')) {
        const e = new Error('外部のAIへ接続できませんでした（ネットワークかページの制限）。'
            + '通信環境をご確認のうえ、サロンのPCでアプリを起動する方法もお試しください。');
        e.reason = 'network';
        e.failures = failures;
        throw e;
    }

    const detail = failures
        .map((f) => `${getProviderLabel(f.provider)} ${f.masked}：${f.message}`)
        .join(' ／ ');
    const e = new Error(`登録された${keys.length}件のキーすべてで生成できませんでした。${detail}`);
    e.reason = 'all-failed';
    e.failures = failures;
    throw e;
}
