/**
 * 星詠みメッセージの本文生成を担当するAIプロバイダ。
 *
 * 既定では Claude を優先し、失敗したら Gemini へ自動フォールバックする（併用構成）。
 * どちらが実際に使われたかは戻り値の usedProvider で分かる。
 *
 * 対応プロバイダ:
 *   claude    : Claude Agent SDK 経由。このマシンの Claude ログイン（＝自分のアカウント）を使う。
 *               認証情報はローカルにしか無いため、ローカル実行専用。API課金は発生しない。
 *   gemini    : 既存の Gemini（GEMINI_API_KEY / GEMINI_API_KEYS）。Claude が使えない時の受け皿。
 *   anthropic : Claude Messages API 経由（ANTHROPIC_API_KEY）。自動では選ばれない。
 *               サーバーにデプロイしてチームで共有する場合に AI_PROVIDER=anthropic で明示指定する。
 *
 * AI_PROVIDER を指定すると、そのプロバイダだけを使いフォールバックしない（切り分け用）。
 */

const path = require('path');
const { pathToFileURL } = require('url');

/**
 * 使うモデルの並びはブラウザと共有している（product/js/app/model-registry.js）。
 * 片方だけ古いモデルを指していると、同じ依頼でも経路によって別のモデルが
 * 答えることになるため。ブラウザ側は ESM なので動的 import で読む。
 */
const REGISTRY_MODULE = pathToFileURL(
    path.join(__dirname, '..', 'product', 'js', 'app', 'model-registry.js')
).href;

let registryPromise = null;
function loadRegistry() {
    if (!registryPromise) registryPromise = import(REGISTRY_MODULE);
    return registryPromise;
}

/** Agent SDK のサブプロセスが応答しない場合に諦めるまでの時間 */
const AGENT_SDK_TIMEOUT_MS = Number(process.env.CLAUDE_TIMEOUT_MS || 180000);

// ---------------------------------------------------------------------------
// プロバイダの判定
// ---------------------------------------------------------------------------

const VALID_PROVIDERS = ['claude', 'anthropic', 'gemini'];

/**
 * 試行するプロバイダの並びを返す。先頭から順に試し、成功した時点で打ち切る。
 * AI_PROVIDER が指定されていればそれ1つだけを返す（フォールバックしない）。
 */
function resolveProviderChain() {
    const explicit = (process.env.AI_PROVIDER || '').trim().toLowerCase();
    if (explicit) {
        if (!VALID_PROVIDERS.includes(explicit)) {
            throw new Error(`AI_PROVIDER の値が不正です: "${explicit}"（${VALID_PROVIDERS.join(' / ')} のいずれか）`);
        }
        return [explicit];
    }
    // 既定はClaude優先・Gemini受け皿
    return ['claude', 'gemini'];
}

/**
 * AI_PROVIDER で1つに固定されているか。
 *
 * 固定は「切り分け・デバッグ用」の強い指定なので、画面からの選択より優先する。
 * 画面側は、この値が true なら選択を無効にして理由を出す。
 */
function isProviderPinned() {
    return Boolean((process.env.AI_PROVIDER || '').trim());
}

/**
 * 画面から選ばれたプロバイダ名を正規化する。
 * 'auto'・空・知らない名前は「おまかせ」として null を返す。
 */
function normalizePreferredProvider(value) {
    const name = String(value || '').trim().toLowerCase();
    if (!name || name === 'auto') return null;
    return VALID_PROVIDERS.includes(name) ? name : null;
}

// ---------------------------------------------------------------------------
// claude: Claude Agent SDK（ローカルのClaudeログインを使う）
// ---------------------------------------------------------------------------

/**
 * Agent SDK でテキストを1往復だけ生成する。
 * ツールは全て無効化し、プロジェクトの設定ファイル（CLAUDE.md 等）も読み込ませない。
 * 文章生成のためだけに使うので、ファイル操作やコマンド実行が混ざる余地を残さない。
 */
async function generateWithAgentSdk({ prompt, systemInstruction, model }) {
    let query;
    try {
        // Agent SDK は ESM のみのため CommonJS からは動的 import で読み込む
        ({ query } = await import('@anthropic-ai/claude-agent-sdk'));
    } catch (err) {
        throw new Error(
            '@anthropic-ai/claude-agent-sdk を読み込めませんでした。`npm install` を実行してください。' +
            `（詳細: ${err.message}）`
        );
    }

    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), AGENT_SDK_TIMEOUT_MS);

    let text = '';
    let usedModel = model;
    let costUsd = null;

    try {
        const stream = query({
            prompt,
            options: {
                model,
                systemPrompt: systemInstruction,
                tools: [],           // 組み込みツールを全て無効化（文章生成のみ）
                settingSources: [],  // ~/.claude や .claude/ の設定・CLAUDE.md を読み込まない
                maxTurns: 1,
                abortController,
            },
        });

        for await (const message of stream) {
            if (message.type === 'assistant') {
                usedModel = message.message?.model || usedModel;
                if (message.error) {
                    throw new Error(describeAgentSdkError(message.error));
                }
            }
            if (message.type === 'result') {
                if (message.subtype !== 'success') {
                    throw new Error(
                        `Claude Agent SDK が応答を返せませんでした（subtype: ${message.subtype}）。` +
                        'ターミナルで `claude` にログインできているか確認してください。'
                    );
                }
                text = message.result || '';
                if (typeof message.total_cost_usd === 'number') costUsd = message.total_cost_usd;
            }
        }
    } catch (err) {
        if (abortController.signal.aborted) {
            throw new Error(`Claude Agent SDK が ${AGENT_SDK_TIMEOUT_MS / 1000} 秒以内に応答しませんでした。`);
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }

    if (!text.trim()) {
        throw new Error('Claude Agent SDK から空の応答が返りました。');
    }

    return { text, usedModel, usedProvider: 'claude (Agent SDK)', costUsd };
}

/** Agent SDK のエラー種別を日本語の対処メッセージに変換する */
function describeAgentSdkError(error) {
    switch (error) {
        case 'authentication_failed':
            return 'Claude の認証に失敗しました。ターミナルで `claude` を起動してログインし直してください。';
        case 'billing_error':
            return 'Claude アカウントの課金状態を確認してください。';
        case 'rate_limit':
            return 'Claude の利用上限に達しました。しばらく待って再試行してください。';
        case 'overloaded':
            return 'Claude が混み合っています。しばらく待って再試行してください。';
        case 'model_not_found':
            return `指定したモデルが利用できません（CLAUDE_MODEL を確認してください）。`;
        default:
            return `Claude Agent SDK でエラーが発生しました: ${error}`;
    }
}

// ---------------------------------------------------------------------------
// anthropic: Claude Messages API（APIキー認証・デプロイ向け）
// ---------------------------------------------------------------------------

async function generateWithMessagesApi({ prompt, systemInstruction, model, apiKey }) {
    let Anthropic;
    try {
        ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
    } catch (err) {
        throw new Error(
            '@anthropic-ai/sdk を読み込めませんでした。`npm install` を実行してください。' +
            `（詳細: ${err.message}）`
        );
    }

    // キーを渡さなければ、引数なしのコンストラクタが ANTHROPIC_API_KEY を読む。
    // セラピスト側が自分のキーで動かす場合は、そのキーをここに通す。
    const client = apiKey ? new Anthropic({ apiKey }) : new Anthropic();

    const response = await client.messages.create({
        model,
        // thinking + 本文の合計上限。Claude Opus 5 は思考が既定で有効なため余裕を持たせる
        max_tokens: 16000,
        system: systemInstruction,
        messages: [{ role: 'user', content: prompt }],
    });

    if (response.stop_reason === 'refusal') {
        throw new Error('Claude が生成を辞退しました。プロンプトの内容を確認してください。');
    }

    const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('');

    if (!text.trim()) {
        const reason = response.stop_reason === 'max_tokens'
            ? '（max_tokens に達しました）'
            : '';
        throw new Error(`Claude から空の応答が返りました${reason}。`);
    }

    return {
        text,
        usedModel: response.model,
        usedProvider: 'anthropic (Messages API)',
        costUsd: null,
    };
}

// ---------------------------------------------------------------------------
// gemini: 既存実装（キーのローテーションとモデルのフォールバック付き）
// ---------------------------------------------------------------------------

let globalKeyIndex = 0;

function getAllGeminiApiKeys(customApiKey) {
    const rawKeys = [];
    if (customApiKey) rawKeys.push(customApiKey);
    if (process.env.GEMINI_API_KEYS) rawKeys.push(process.env.GEMINI_API_KEYS);
    if (process.env.GEMINI_API_KEY) rawKeys.push(process.env.GEMINI_API_KEY);

    const keys = [];
    rawKeys.forEach((str) => {
        if (!str) return;
        str.split(/[,;\n]+/).forEach((k) => {
            const trimmed = k.trim();
            if (trimmed && !keys.includes(trimmed)) {
                keys.push(trimmed);
            }
        });
    });

    return keys;
}

async function generateWithGemini({ customApiKey, prompt, systemInstruction }) {
    const { GoogleGenAI } = require('@google/genai');

    const keys = getAllGeminiApiKeys(customApiKey);
    if (keys.length === 0) {
        throw new Error('Gemini APIキーが設定されていません。チャットの「Settings」または環境変数にAPIキーを設定してください。');
    }

    // 利用可能なモデル候補（429時のモデルフォールバック用）。
    // 並びはブラウザと共有（速さ優先）。
    const { MODEL_PREFERENCE } = await loadRegistry();
    const models = MODEL_PREFERENCE.gemini;
    let lastError = null;

    // キーの開始位置をローテーション（ラウンドロビン）
    const startIndex = globalKeyIndex % keys.length;
    globalKeyIndex++;

    for (let i = 0; i < keys.length; i++) {
        const keyIndex = (startIndex + i) % keys.length;
        const currentKey = keys[keyIndex];
        const maskedKey = currentKey.length > 8
            ? `${currentKey.substring(0, 4)}...${currentKey.substring(currentKey.length - 4)}`
            : '****';

        const ai = new GoogleGenAI({
            apiKey: currentKey,
            httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });

        for (const modelName of models) {
            try {
                console.log(`[API CALL] Attempting with Key #${keyIndex + 1} (${maskedKey}) using model: ${modelName}`);
                const response = await ai.models.generateContent({
                    model: modelName,
                    contents: prompt,
                    config: {
                        systemInstruction,
                        maxOutputTokens: 8192,
                        // 2.5系は既定で考えてから書き、その思考も出力の枠を使う。
                        // ここは400字の業務メモなので思考は要らない。
                        thinkingConfig: { thinkingBudget: 0 },
                    },
                });

                if (response && response.text) {
                    console.log(`[API SUCCESS] Request succeeded with Key #${keyIndex + 1} (${maskedKey})`);
                    return {
                        text: response.text,
                        usedModel: modelName,
                        usedProvider: 'gemini',
                        costUsd: null,
                    };
                }
            } catch (err) {
                lastError = err;
                const errCode = err.status || err.code || '';
                const errMessage = err.message || '';
                console.warn(`[API WARN] Key #${keyIndex + 1} (${maskedKey}) with ${modelName} failed. Error: ${errCode} - ${errMessage.substring(0, 100)}`);

                // 429やQuotaエラーの場合は別キーへ切り替えるため、モデルループを抜ける
                if (errMessage.includes('429') || errMessage.includes('RESOURCE_EXHAUSTED') || errMessage.includes('quota') || errCode === 429) {
                    console.warn(`[API ROTATION] Quota limit reached for Key #${keyIndex + 1}. Rotated to next key.`);
                    break;
                }
            }
        }
    }

    throw lastError || new Error('登録されているすべてのAPIキーで呼び出しに失敗しました。');
}

// ---------------------------------------------------------------------------
// 公開API
// ---------------------------------------------------------------------------

/**
 * 星詠みメッセージの本文を生成する。
 * Claude を優先し、失敗したら Gemini へフォールバックする。
 *
 * @param {object} args
 * @param {string} args.prompt            ユーザープロンプト（天体データを含む）
 * @param {string} args.systemInstruction  文体・出力フォーマットの指示
 * @param {string} [args.customApiKey]     クライアントから渡されたAPIキー。
 *   sk-ant- で始まれば Anthropic、それ以外は Gemini のキーとして扱う。
 *   キーが渡された場合は、そのプロバイダを chain の先頭に持ってくる
 *   （自分のキーで動かしたい意図なので、既定より優先する）。
 * @returns {Promise<{text, usedModel, usedProvider, costUsd, fallbackFrom}>}
 */
function classifyApiKey(key) {
    if (!key) return null;
    return String(key).trim().startsWith('sk-ant-') ? 'anthropic' : 'gemini';
}

async function generateAdvice({
    prompt, systemInstruction, customApiKey, preferredProvider, preferredModel, label = '本文'
}) {
    let chain = resolveProviderChain();

    // 画面から選ばれたものを先頭に置く。
    // AI_PROVIDER で固定されている場合は、そちらが強い指定なので触らない。
    const chosen = isProviderPinned() ? null : normalizePreferredProvider(preferredProvider);
    if (chosen) {
        chain = [chosen, ...chain.filter((p) => p !== chosen)];
        console.log(`[AI] user choice → provider=${chosen} を優先します`);
    }

    // キーの種類からの推定は、画面で明示的に選ばれていない時だけ効かせる。
    // 「キーは登録してあるが、いまはこのPCのClaudeで動かしたい」を通すため。
    const keyProvider = classifyApiKey(customApiKey);
    if (keyProvider && !chosen) {
        chain = [keyProvider, ...chain.filter((p) => p !== keyProvider)];
        console.log(`[AI] client key detected → provider=${keyProvider} を優先します`);
    }
    const { AGENT_SDK_MODEL, MODEL_PREFERENCE, normalizeClaudeModel } = await loadRegistry();

    // 画面で選ばれたモデル。知らない名前はここで落とす
    // （Agent SDK にそのまま渡さない）。
    const pickedModel = normalizeClaudeModel(preferredModel);
    if (preferredModel && !pickedModel) {
        console.warn(`[AI] 知らないモデル名を無視しました: ${preferredModel}`);
    }

    // Agent SDK（このPCのClaudeログイン）と、Anthropic APIキー経由の既定。
    // 優先順は 画面の選択 → CLAUDE_MODEL → 並びの先頭。
    // CLAUDE_MODEL は「既定の上書き」であって固定ではないので、
    // その場で選ばれたもののほうを優先する（AI_PROVIDER とは扱いが違う）。
    const claudeModel = pickedModel || process.env.CLAUDE_MODEL || AGENT_SDK_MODEL;
    const anthropicModel = pickedModel || process.env.CLAUDE_MODEL || MODEL_PREFERENCE.anthropic[0];
    const failures = [];

    for (const provider of chain) {
        console.log(`[AI] trying provider=${provider}${provider === 'gemini' ? '' : ` model=${claudeModel}`}`);
        try {
            let result;
            if (provider === 'claude') {
                result = await generateWithAgentSdk({ prompt, systemInstruction, model: claudeModel });
            } else if (provider === 'anthropic') {
                result = await generateWithMessagesApi({
                    prompt, systemInstruction, model: anthropicModel,
                    apiKey: keyProvider === 'anthropic' ? customApiKey : undefined
                });
            } else {
                result = await generateWithGemini({ prompt, systemInstruction, customApiKey });
            }
            console.log(`[AI] succeeded with provider=${provider} model=${result.usedModel}`);
            // どのプロバイダで失敗してここに来たかを呼び出し側へ伝える
            return { ...result, fallbackFrom: failures.map((f) => f.provider) };
        } catch (err) {
            const message = err.message || String(err);
            failures.push({ provider, message });
            console.warn(`[AI] provider=${provider} failed: ${message}`);
        }
    }

    const detail = failures.map((f) => `${f.provider}: ${f.message}`).join(' / ');
    throw new Error(`${label}を生成できませんでした（${detail}）`);
}

/**
 * これから使うつもりのモデル名を返す（まだ呼んでいない段階の見込み）。
 *
 * 画面に「いま何で動くか」を出すために要る。実際に使われたモデルは
 * generateAdvice の戻り値 usedModel に入る（版まで含んだ正確な名前）。
 */
async function resolvePlannedModels() {
    const { AGENT_SDK_MODEL, MODEL_PREFERENCE } = await loadRegistry();
    return {
        claude: process.env.CLAUDE_MODEL || AGENT_SDK_MODEL,
        anthropic: process.env.CLAUDE_MODEL || MODEL_PREFERENCE.anthropic[0],
        gemini: MODEL_PREFERENCE.gemini[0]
    };
}

module.exports = {
    generateAdvice,
    resolveProviderChain,
    classifyApiKey,
    resolvePlannedModels,
    isProviderPinned,
    normalizePreferredProvider,
    VALID_PROVIDERS
};
