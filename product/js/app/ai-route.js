// いま、どのAIに繋がっているのかを調べる。
//
// 同じアプリでも、開き方によって繋がる先が変わる。
//
//   サロンのPCで立ち上げて開いた  → PCのサーバー経由。Claude のアカウントを使う（キー不要）
//   いつものURL・スマホから開いた → ブラウザから直接。登録したAPIキーを使う
//
// 見た目が同じなので、どちらで動いているのか分からない。
// 「キーを入れたのに使われない」「キーが無いのに動く」の原因になる。
// 隠さずに出しておく。
import {
    getStoredApiKeys, classifyApiKey, getProviderLabel, getChosenModel,
    getPreferredProvider, getPreferredClaudeModel
} from './ai-client.js';

const STATUS_PATH = '/api/ai-status';
const PROBE_TIMEOUT_MS = 2500;

/** 調べ直しは高くつくので取っておく。開いている間は変わらない */
let cached = null;

/**
 * PCのサーバーが居るかを訊く。
 *
 * Cloudflare には この入口が無いので、404 か、そもそも返事が来ない。
 * 待ちすぎると画面が固まって見えるため、短く切り上げる。
 */
async function probeLocalServer() {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    try {
        const res = await fetch(STATUS_PATH, { signal: ctrl.signal, cache: 'no-store' });
        if (!res.ok) return null;
        const json = await res.json();
        return (json && typeof json === 'object') ? json : null;
    } catch (e) {
        return null;            // 居ない、というだけ。異常ではない
    } finally {
        clearTimeout(timer);
    }
}

/** 登録されているキーから、何が使えるかを見る */
function keySummary() {
    const keys = getStoredApiKeys();
    if (!keys.length) return null;
    const kinds = [];
    keys.forEach((k) => {
        const p = classifyApiKey(k);
        const label = getProviderLabel(p);
        if (label && !kinds.includes(label)) kinds.push(label);
    });
    // 1本目のキーで、どのモデルが選ばれているかを見る
    const first = classifyApiKey(keys[0]);
    let model = '';
    try { model = getChosenModel(first) || ''; } catch (e) { model = ''; }
    return { count: keys.length, kinds, model };
}

/**
 * いまの繋ぎ先を返す。
 *
 * @returns {Promise<{mode:string, label:string, detail:string, tone:string}>}
 *   mode  … 'local' | 'key' | 'none'
 *   tone  … 'good'（アカウントで動く）| 'ok'（キーで動く）| 'off'（動かない）
 */
export async function detectAiRoute({ force = false } = {}) {
    if (cached && !force) return cached;

    const local = await probeLocalServer();
    if (local) {
        // 設定で選ばれたものが、実際に最初に試されるもの。
        // ここでサーバーの既定だけを見ていると、Gemini を選んでいるのに
        // 札は「アカウント」と出る——という食い違いが起きる。
        // AI_PROVIDER で固定されている間は、選択より環境変数が勝つ。
        const chosen = local.pinned ? 'auto' : getPreferredProvider();
        const primary = (chosen !== 'auto' && chosen)
            || local.primary || (local.chain || [])[0] || null;
        // モデルも選ばれていればそれを出す。Gemini には効かない指定なので除く。
        const pickedModel = primary === 'gemini' ? '' : getPreferredClaudeModel();
        const model = pickedModel || (local.models || {})[primary] || local.plannedModel || '';

        if (primary === 'claude' && local.agentSdk) {
            cached = {
                mode: 'local',
                pay: 'account',
                model,
                label: model ? `アカウント · ${model}` : 'アカウント（このPCの Claude）',
                detail: `このPCの Claude ログインで動いています。${model ? `モデルは ${model}。` : ''}`
                    + 'APIキーは使っていません（従量の課金は発生しません）',
                tone: 'good'
            };
            return cached;
        }
        cached = {
            mode: 'local',
            pay: 'key',
            model,
            label: model ? `APIキー · ${model}` : `APIキー（${getProviderLabel(primary) || '不明'}）`,
            detail: local.agentSdk
                ? 'このPCのサーバー経由ですが、Claude 以外が先に使われる設定です'
                : 'このPCのサーバー経由ですが、Claude Agent SDK が読み込めていません',
            tone: 'ok'
        };
        return cached;
    }

    const keys = keySummary();
    if (keys) {
        cached = {
            mode: 'key',
            pay: 'key',
            model: keys.model || '',
            label: keys.model ? `APIキー · ${keys.model}` : `APIキー（${keys.kinds.join('・')}）`,
            detail: `この端末から直接 ${keys.kinds.join('・')} へ聞きに行きます`
                + `（キー${keys.count}本／使った分だけ課金されます）`,
            tone: 'ok'
        };
        return cached;
    }

    cached = {
        mode: 'none',
        pay: 'none',
        model: '',
        label: 'まだ繋がっていません',
        detail: '「🤖 AI の設定」でAPIキーを登録するか、サロンのPCでアプリを起動してください',
        tone: 'off'
    };
    return cached;
}

/**
 * 実際に返事を作ったあとに、そのとき使われたものへ更新する。
 *
 * 見込み（何で動くつもりか）と、実際（何で動いたか）は食い違うことがある。
 * 1本目のキーが上限に当たって2本目に移った、など。動いた結果のほうが正しい。
 */
export function noteActualRoute({ usedProvider, usedModel }) {
    if (!usedProvider && !usedModel) return cached;
    const viaAccount = String(usedProvider || '').indexOf('Agent SDK') !== -1;
    cached = {
        mode: viaAccount ? 'local' : (cached ? cached.mode : 'key'),
        pay: viaAccount ? 'account' : 'key',
        model: usedModel || '',
        label: `${viaAccount ? 'アカウント' : 'APIキー'}${usedModel ? ` · ${usedModel}` : ''}`,
        detail: `直前の返事は ${usedProvider || '不明'} が作りました`
            + `${usedModel ? `（${usedModel}）` : ''}`,
        tone: viaAccount ? 'good' : 'ok'
    };
    return cached;
}

/** キーを足したり消したりしたら、調べ直す */
export function forgetAiRoute() {
    cached = null;
}
