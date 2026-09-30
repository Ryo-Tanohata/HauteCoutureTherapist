const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');
const { PERIODS, isStale, readStored, refreshPeriod } = require('./advice');
const { generateSessionAdvice } = require('./session-advice');
const {
    resolveProviderChain, resolvePlannedModels, generateAdvice,
    isProviderPinned, VALID_PROVIDERS
} = require('./ai-provider');

/**
 * 画面で選ばれたAIを取り出す。
 * ヘッダーを本命にし、クエリでも受ける（curl で切り分けできるように）。
 */
function readPreferredProvider(req) {
    return req.headers['x-ai-provider'] || (req.query && req.query.provider) || '';
}

/** 画面で選ばれた Claude のモデル。知らない名前は ai-provider 側で落とす。 */
function readPreferredModel(req) {
    return req.headers['x-ai-model'] || (req.query && req.query.model) || '';
}

const app = express();
/** 既定は3000。PORT=8080 のように指定すればその番号を使う。 */
const PORT = Number(process.env.PORT) || 3000;
/**
 * どこから開けるようにするか（ISSUE-088）。
 *
 * 既定は**このPCの中だけ**。以前は 0.0.0.0 で、同じネットワークに繋がった
 * 機械から誰でも開けた。認証は無く、プロジェクトの中のファイルは
 * そのまま配られる。**書き出した控えをここに置いていれば、それも読めた。**
 *
 * 別の機械から使う必要があるときだけ HOST=0.0.0.0 を付けて立ち上げる。
 */
const HOST = process.env.HOST || '127.0.0.1';

/** アプリ本体（CRM画面）のパス。ルートの index.html はランチパッドなので直接アプリを開く。 */
const APP_PATH = '/management/99_Portal/index.html';

/** `--open` 付きで起動された場合のみブラウザを自動で開く（npm run dev） */
const SHOULD_OPEN = process.argv.includes('--open');

/**
 * 既定のブラウザで URL を開く。
 */
function openBrowser(url) {
    let command;
    let args;
    if (process.platform === 'win32') {
        command = 'cmd';
        args = ['/c', 'start', '', url];
    } else if (process.platform === 'darwin') {
        command = 'open';
        args = [url];
    } else {
        command = 'xdg-open';
        args = [url];
    }

    try {
        const child = spawn(command, args, { stdio: 'ignore', detached: true });
        child.on('error', () => {
            console.warn(`ブラウザを自動で開けませんでした。手動で開いてください: ${url}`);
        });
        child.unref();
    } catch (e) {
        console.warn(`ブラウザを自動で開けませんでした。手動で開いてください: ${url}`);
    }
}

/**
 * よその画面から呼ばせない（ISSUE-088）。
 *
 * 以前は `cors()` を素で入れていたので `Access-Control-Allow-Origin: *` になり、
 * **セラピストが開いた別のサイトから、このPCの中身を読めた。**
 * このPCで開いている間、プロジェクトの中のファイルは配られている。
 * そこに書き出した控え（カルテそのもの）を置いていれば、それも読めた。
 *
 * 通すのは、このPCで開いたときの元だけ。外から使う必要があるときは
 * SALON_ALLOW_ORIGIN に入れて立ち上げ直す。
 */
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const EXTRA_ORIGIN = (process.env.SALON_ALLOW_ORIGIN || '').trim();
app.use(cors({
    origin(origin, cb) {
        // 画面からの呼び出しでないもの（curl や同じ元からの読み込み）は素通し
        if (!origin) return cb(null, true);
        if (LOCAL_ORIGIN.test(origin)) return cb(null, true);
        if (EXTRA_ORIGIN && origin === EXTRA_ORIGIN) return cb(null, true);
        return cb(null, false);
    }
}));
app.use(express.json());

// ログ保存処理関数
const handleSaveLog = (req, res) => {
    const { url, chatLog, messages } = req.body;
    const logData = chatLog || messages;
    if (!url || !logData) {
        return res.status(400).json({ error: 'Missing url or chatLog/messages' });
    }

    try {
        let relativePath = 'unknown';
        try {
            const parsedUrl = new URL(url, `http://localhost:${PORT}`);
            const pathname = parsedUrl.pathname;
            
            if (pathname.includes('01_Requirements')) {
                relativePath = '01_Requirements';
            } else if (pathname.includes('02_Planning')) {
                relativePath = '02_Planning';
            } else if (pathname.includes('03_Implementation')) {
                relativePath = '03_Implementation';
            } else if (pathname.includes('99_Portal')) {
                relativePath = '99_Portal';
            } else if (pathname.includes('product')) {
                relativePath = 'product';
            }
        } catch (e) {
            console.warn('URLのパースに失敗しました:', e);
        }

        const logDir = path.join(__dirname, '../management/03_Implementation/chat_logs', relativePath);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        const logPath = path.join(logDir, 'chat_history.json');
        fs.writeFileSync(logPath, JSON.stringify(logData, null, 2), 'utf8');
        console.log(`ログを保存しました: ${logPath}`);
        return res.json({ status: 'ok', path: logPath });
    } catch (err) {
        console.error('ログの保存中にエラーが発生しました:', err);
        return res.status(500).json({ error: 'Failed to save log' });
    }
};

// ログ保存用エンドポイント
app.post('/api/save_log', handleSaveLog);
app.post('/save_history', handleSaveLog);
app.post('/api/save_history', handleSaveLog);

app.get('/api/daily-advice', async (req, res) => {
    try {
        const period = PERIODS.includes(req.query.period) ? req.query.period : 'today';
        const forceRefresh = req.query.force === 'true';

        // 保存済みが最新ならそれを返す。閲覧のたびにAIを呼ばない。
        if (!forceRefresh && !isStale(period)) {
            const stored = readStored(period);
            if (stored) {
                console.log(`[STORE HIT] ${period}.json を返却`);
                return res.json(stored);
            }
        }

        const clientApiKey = req.headers['x-api-key'] || req.query.apiKey;
        const { payload, file } = await refreshPeriod(period, {
            customApiKey: clientApiKey,
            preferredProvider: readPreferredProvider(req),
            preferredModel: readPreferredModel(req)
        });
        console.log(`[STORE WRITE] ${file}`);
        res.json(payload);
    } catch (err) {
        console.error('Advice generation error:', err);
        res.status(500).json({ error: err.message || 'アドバイス生成中にエラーが発生しました。' });
    }
});

/**
 * セッション提案。星詠みと違い顧客ごと・その場の生成なので、事前保存はしない。
 *
 * 禁忌の判定はブラウザ側（oil-safety.js）で済ませてから呼ぶ約束になっている。
 * ここに届く allowedOils は「使ってよい」と判定済みのものだけ。
 *
 * APIキーは x-api-key ヘッダで受け取る。sk-ant- で始まれば Anthropic、
 * それ以外は Gemini のキーとして扱い、そのプロバイダを優先する。
 * キーが無ければサーバー側の既定（Agent SDK）で動く。
 */
/**
 * いまこのサーバーが何で生成できるかを返す。
 *
 * 「自分のアカウントで動くのか、APIキーが要るのか」は画面から見えないと
 * 分からないので、設定画面に出すために用意している。
 * ログイン済みかどうかまでは踏み込まず、使える口があるかだけを返す。
 */
app.get('/api/ai-status', async (req, res) => {
    let agentSdk = false;
    try {
        await import('@anthropic-ai/claude-agent-sdk');
        agentSdk = true;
    } catch (e) {
        agentSdk = false;
    }

    const chain = resolveProviderChain();
    const primary = chain[0] || null;

    // 画面に「いま何で動くか」を出すため、使うつもりのモデル名も返す。
    // 実際に使われた名前（版まで含む）は、生成の戻り値のほうが正確。
    let models = {};
    try {
        models = await resolvePlannedModels();
    } catch (e) {
        models = {};
    }

    res.json({
        // 既定の並び（AI_PROVIDER が指定されていればそれ1つ）
        chain,
        agentSdk,
        anthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
        geminiKey: Boolean(process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYS),
        // 実際に最初に試されるもの
        primary,
        models,
        plannedModel: primary ? (models[primary] || null) : null,
        // 画面で選べる顔ぶれと、選択を受け付けられるかどうか。
        // AI_PROVIDER で固定されている間は、画面の選択より環境変数が優先される。
        selectable: VALID_PROVIDERS,
        pinned: isProviderPinned()
    });
});

app.post('/api/session-advice', async (req, res) => {
    try {
        const ctx = req.body || {};
        if (!['prep', 'session'].includes(ctx.mode)) {
            return res.status(400).json({ error: 'mode は prep か session を指定してください。' });
        }
        if (!Array.isArray(ctx.allowedOils) || ctx.allowedOils.length === 0) {
            return res.status(400).json({ error: '使用できる精油の候補がありません。体質の設定をご確認ください。' });
        }

        const clientApiKey = req.headers['x-api-key'] || req.query.apiKey;
        const payload = await generateSessionAdvice(ctx, {
            customApiKey: clientApiKey,
            preferredProvider: readPreferredProvider(req),
            preferredModel: readPreferredModel(req)
        });
        console.log(`[SESSION] mode=${ctx.mode} provider=${payload.usedProvider} model=${payload.usedModel}`);
        res.json(payload);
    } catch (err) {
        console.error('Session advice error:', err);
        res.status(500).json({ error: err.message || 'セッション提案の生成中にエラーが発生しました。' });
    }
});

/**
 * 操作ガイド（右下の吹き出し）の返事を作る。
 *
 * 以前ここは「つながるか試すだけ」の空の入口だった。そのため、この画面から
 * 開いていても、チャットだけはAPIキーを使っていた。ヘッダーの札は
 * 「このPCの Claude」と出るのに、実際はキーで答えている——という食い違いが
 * 起きていたので、本物にする。
 */
app.post('/api/chat', async (req, res) => {
    try {
        const { prompt, systemInstruction } = req.body || {};
        if (!prompt || typeof prompt !== 'string') {
            return res.status(400).json({ error: 'prompt が要ります。' });
        }
        const clientApiKey = req.headers['x-api-key'];
        const payload = await generateAdvice({
            prompt,
            systemInstruction: systemInstruction || '',
            customApiKey: clientApiKey,
            preferredProvider: readPreferredProvider(req),
            preferredModel: readPreferredModel(req),
            label: '操作ガイドの返事'
        });
        console.log(`[CHAT] provider=${payload.usedProvider} model=${payload.usedModel}`);
        res.json({
            text: payload.text,
            usedProvider: payload.usedProvider,
            usedModel: payload.usedModel
        });
    } catch (err) {
        console.error('Chat error:', err);
        res.status(500).json({ error: err.message || '返事を作れませんでした。' });
    }
});

/**
 * 置き場（サロンの共有の入れ物）への窓口を、そのまま転送する。
 *
 * 窓口の実体は Cloudflare 側にしかない。だからこのPCで開いている間は
 * 同期が丸ごと止まり、画面には「送れていません」と出る。
 * Claude のアカウントを使うためにこの開き方をしたら、その間に書いた
 * カルテが他の端末へ届かない——というのは、いちばん困る形。
 *
 * 中身は端末で暗号化済みなので、ここを通っても読めない。
 * 合言葉の照合も向こう側でやる。ここは運ぶだけ。
 *
 * 置き場の場所は SALON_ORIGIN で渡す。リポジトリには書かない
 * （入口を探せる場所に置かない、という決めごとのため）。
 */
const SALON_ORIGIN = (process.env.SALON_ORIGIN || '').replace(/\/+$/, '');

app.all('/api/sync', express.raw({ type: '*/*', limit: '20mb' }), async (req, res) => {
    if (!SALON_ORIGIN) {
        return res.status(503).json({
            error: 'このPCからは置き場に繋げません。置き場の場所を SALON_ORIGIN に入れて'
                + '立ち上げ直してください（例: SALON_ORIGIN=https://〇〇.pages.dev npm run dev）。'
        });
    }
    const auth = req.headers['x-salon-auth'];
    if (!auth) return res.status(401).json({ error: '合言葉が渡されていません。' });

    const qs = new URLSearchParams(req.query).toString();
    const hasBody = Buffer.isBuffer(req.body) && req.body.length > 0
        && req.method !== 'GET' && req.method !== 'HEAD';
    try {
        const upstream = await fetch(`${SALON_ORIGIN}/api/sync${qs ? `?${qs}` : ''}`, {
            method: req.method,
            headers: {
                'x-salon-auth': auth,
                ...(hasBody ? { 'content-type': 'application/octet-stream' } : {})
            },
            body: hasBody ? req.body : undefined
        });
        const buf = Buffer.from(await upstream.arrayBuffer());
        const ct = upstream.headers.get('content-type');
        res.status(upstream.status);
        if (ct) res.set('Content-Type', ct);
        res.set('Cache-Control', 'no-store');
        res.send(buf);
    } catch (err) {
        console.error('Sync proxy error:', err);
        res.status(502).json({ error: `置き場へ届きませんでした: ${err.message}` });
    }
});

// 静的ファイルの配信 (プロジェクトルート配下)
const rootDir = process.cwd();
app.use(express.static(rootDir, { index: 'index.html' }));

// フォールバック処理: 静的ファイルに当てはまらない全てのキャッチオールリクエスト
app.use((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        return res.status(405).send('Method Not Allowed');
    }

    // 安全にパスを解決
    const reqPath = path.normalize(req.path).replace(/^(\.\.[\/\\])+/, '');
    const requestedPath = path.join(rootDir, reqPath);

    // ディレクトリトラバーサル防止
    if (!requestedPath.startsWith(rootDir)) {
        return res.status(403).send('Forbidden');
    }

    if (fs.existsSync(requestedPath)) {
        const stat = fs.statSync(requestedPath);
        if (stat.isFile()) {
            return res.sendFile(requestedPath);
        } else if (stat.isDirectory()) {
            const indexPath = path.join(requestedPath, 'index.html');
            if (fs.existsSync(indexPath)) {
                return res.sendFile(indexPath);
            }
        }
    }

    // 特定パスへのリダイレクトやフォールバック
    if (req.path === '/product') return res.redirect('/product/');
    if (req.path === '/management') return res.redirect('/management/99_Portal/');

    // デフォルトのフォールバック
    const defaultIndex = path.join(rootDir, 'index.html');
    if (fs.existsSync(defaultIndex)) {
        res.sendFile(defaultIndex);
    } else {
        res.status(404).send('Not Found');
    }
});

/**
 * 起動。
 *
 * 3000番は他のツール（Google AI Studio など）が使っていることがある。
 * 塞がっていたら終了せず、空いている番号を順に試す。
 * ブラウザからは相対パスで /api を叩くので、番号が変わっても動く。
 *
 *   PORT=8080 npm start   … 番号を指定する
 *   npm start             … 3000 から順に空きを探す
 */
const MAX_PORT_TRIES = 10;

/**
 * その番号で待ち受けられるかを先に試す。
 * 本番の listen で確かめると、失敗するまでの間に起動メッセージが
 * 出てしまい、実際とは違う番号を案内することがあるため。
 */
function isPortFree(port) {
    return new Promise((resolve) => {
        const probe = net.createServer();
        probe.once('error', () => resolve(false));
        probe.once('listening', () => probe.close(() => resolve(true)));
        probe.listen(port, HOST);
    });
}

async function start() {
    let port = PORT;

    if (!(await isPortFree(port))) {
        // PORT を明示指定されたなら、勝手にずらさずに知らせて終わる
        if (process.env.PORT) {
            console.error(`[CRITICAL] 指定されたポート ${port} は既に使用されています。`);
            process.exit(1);
        }
        let found = null;
        for (let i = 1; i <= MAX_PORT_TRIES; i++) {
            console.warn(`ポート ${port + i - 1} は使用中です。${port + i} を試します。`);
            if (await isPortFree(port + i)) { found = port + i; break; }
        }
        if (!found) {
            console.error(`[CRITICAL] ${PORT}〜${PORT + MAX_PORT_TRIES} に空きがありません。`
                + ' PORT=8080 のように番号を指定して起動してください。');
            process.exit(1);
        }
        port = found;
    }

    const server = app.listen(port, HOST, () => {
        const actual = server.address().port;
        const appUrl = `http://localhost:${actual}${APP_PATH}`;
        console.log(`Bridge server running on http://${HOST}:${actual}`);
        if (HOST !== '127.0.0.1') {
            console.log('⚠ このPCの外（同じネットワークの機械）からも開けます。'
                + 'プロジェクトの中のファイルも配られるので、'
                + '書き出した控えをこのフォルダに置かないでください。');
        }
        if (actual !== PORT) {
            console.log(`（${PORT} は使用中だったため ${actual} で起動しました）`);
        }
        console.log(`アプリ: ${appUrl}`);
        if (SHOULD_OPEN) {
            openBrowser(appUrl);
        }
    });

    server.on('error', (error) => {
        console.error('サーバー起動時にエラーが発生しました:', error);
        process.exit(1);
    });
}

/**
 * 失敗したときに、置き場所や中の作りを外へ出さない（ISSUE-088）。
 *
 * 既定のままだと、無いファイルを求められただけで
 * `/home/…/node_modules/express/…` のような**絶対パスと呼び出しの経路**が
 * そのまま画面に出る。何が動いているかの手がかりになる。
 */
function installErrorHandler() {
    app.use((err, req, res, next) => {   // eslint-disable-line no-unused-vars
        console.error('リクエストの処理で問題が起きました:', err && err.message);
        if (res.headersSent) return;
        res.status(err && err.status === 404 ? 404 : 500)
            .type('text/plain')
            .send(err && err.status === 404 ? 'Not Found' : 'Server Error');
    });
}

installErrorHandler();
start();
