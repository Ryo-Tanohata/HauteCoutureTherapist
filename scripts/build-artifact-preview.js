/**
 * product/index.html + css + js を 1ファイルに束ねて、Artifact で開ける
 * 静的プレビューを作る。**アプリのコードは書き換えず、そのまま埋め込む。**
 *
 * Artifact は外のホストへ一切通信できないので、
 *   - 画像は data URI に
 *   - サーバー（bridge.js）が要る /api/* はブラウザ内の代役に
 * 置き換える。**黙って成功扱いにはしない**（同期は 503 を返す）。
 * 「同期できた」と出たまま何も渡らないのが、いちばん困る嘘のため。
 *
 *   node scripts/build-artifact-preview.js [出力先ディレクトリ]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = process.argv[2] || path.join(ROOT, 'build');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// 連結する順番。**後ろのものが前のものを使う**ので、並びを変えないこと。
const MODULES = [
    'data.js',
    'kanji-strokes.js',
    'soul-color.js',
    'correspondence.js',
    'oil-safety.js',
    'session-prompt.js',
    'model-registry.js',
    'ai-client.js',
    'ai-route.js',
    'chat-visibility.js',
    'prep-visibility.js',
    'free-text-review.js',
    'photo-store.js',
    'astro-aroma.js',
    'salon-store.js',
    'ui.js',
];

const html = read('product/index.html');
const css = read('product/css/index.css');
const marked = read('product/js/vendor/marked/marked.min.js');

// サーバーが実際に生成した6期間ぶんを、そのまま埋め込む
const PERIODS = ['today', '1week', '1month', '3months', '6months', '1year'];
const bakedPayloads = {};
PERIODS.forEach((key) => {
    bakedPayloads[key] = JSON.parse(read(`product/data/advice/${key}.json`));
});
const ingressTable = JSON.parse(read('product/data/advice/ingress.json'));
let demoSessionAdvice = { entries: {} };
try { demoSessionAdvice = JSON.parse(read('product/data/demo/session-advice.json')); } catch (e) { /* 無くてよい */ }

// --- head / body を取り出す（Artifact 側が doctype/html/head/body を付ける） ---
const headInner = html.match(/<head>([\s\S]*?)<\/head>/)[1];
let bodyInner = html.match(/<body[^>]*>([\s\S]*?)<\/body>/)[1];
const title = (headInner.match(/<title>([\s\S]*?)<\/title>/) || [, 'セラピスト向け顧客管理'])[1];

// head の <style>（ツアーの覆いなど）も必ず持ち込む。
// 落としても画面は出るので、**中身を見て確かめる**
const headStyles = (headInner.match(/<style>([\s\S]*?)<\/style>/g) || [])
    .map((s) => s.replace(/<\/?style>/g, ''))
    .join('\n');
if (!/\.tour-overlay/.test(headStyles)) {
    throw new Error('head の <style> を取り込めていません');
}

// --- 画像を data URI に ---
const imageDataUris = {};
try {
    fs.readdirSync(path.join(ROOT, 'product/images')).forEach((name) => {
        const ext = path.extname(name).slice(1).toLowerCase();
        const mime = ext === 'webp' ? 'image/webp' : ext === 'png' ? 'image/png' : 'image/jpeg';
        const buf = fs.readFileSync(path.join(ROOT, 'product/images', name));
        imageDataUris['/images/' + name] = `data:${mime};base64,${buf.toString('base64')}`;
    });
} catch (e) { /* 画像が無ければ何もしない */ }
const inlineImages = (text) => Object.keys(imageDataUris).reduce(
    (acc, key) => acc.split(key).join(imageDataUris[key]), text);

// --- 外部・相対の読み込みを外す ---
// src は相対（js/app/ui.js）で書かれている。先頭の / を前提にすると剥がし損ねて、
// プレビューで毎回404を取りに行く。
bodyInner = bodyInner
    .replace(/<script[^>]*src="[^"]*js\/app\/[^"]*"[^>]*><\/script>\s*/g, '')
    .replace(/<script[^>]*src="[^"]*js\/vendor\/[^"]*"[^>]*><\/script>\s*/g, '');

if (/js\/app\/|js\/vendor\/|cdn\.|fonts\.googleapis/.test(bodyInner)) {
    throw new Error('body に外部参照が残っています');
}

// --- モジュールを1本のふつうのスクリプトへ ---
// import / export を落として、同じ入れ物の中で順に連結する。
const flat = {};
MODULES.forEach((name) => {
    const src = read(`product/js/app/${name}`);
    flat[name] = src
        // import { … } from './x.js';  … 複数行にまたがるものも含めて落とす
        .replace(/^import\s+[\s\S]*?from\s*'[^']+';\s*$/gm, (m) => `// [preview] ${m.split('\n').pop().trim()} は上に連結済み`)
        .replace(/^export\s+/gm, '');
    if (/^\s*(import|export)\s/m.test(flat[name])) {
        throw new Error(`${name} に import/export が残っています`);
    }
});

// トップレベル名が衝突すると SyntaxError になるので、先に見つける
{
    const seen = new Map();
    for (const name of MODULES) {
        const names = [...flat[name].matchAll(/^(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
        for (const n of names) {
            if (seen.has(n)) throw new Error(`トップレベル名の衝突: ${n}（${seen.get(n)} と ${name}）`);
            seen.set(n, name);
        }
    }
    console.log('トップレベル名', seen.size, '件 / 衝突なし');
}

// --- サーバーの代役 ---
const shim = `
(function () {
  // Artifact は外のホストへ通信できないため、サーバーの応答を差し替える。
  // 星詠みの文章はすべて Claude が実際に生成し、リポジトリに入っているもの。
  const BAKED = ${JSON.stringify(bakedPayloads)};
  const INGRESS = ${JSON.stringify(ingressTable)};
  const DEMO_SESSION = ${JSON.stringify(demoSessionAdvice)};

  const origFetch = window.fetch.bind(window);
  const json = (body, status) => Promise.resolve(new Response(JSON.stringify(body), {
    status: status || 200, headers: { 'Content-Type': 'application/json' },
  }));

  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf('data/demo/session-advice.json') > -1) return json(DEMO_SESSION);
    if (url.indexOf('data/advice/ingress.json') > -1) return json(INGRESS);

    const marker = 'data/advice/';
    const at = url.indexOf(marker);
    if (at > -1) {
      const key = url.slice(at + marker.length).replace('.json', '').split(/[?#]/)[0];
      return json(BAKED[key] || BAKED.today);
    }
    if (url.indexOf('/api/daily-advice') > -1) {
      const period = (url.match(/period=([^&]+)/) || [, 'today'])[1];
      return json(BAKED[period] || BAKED.today);
    }

    // 生成AIはプレビューでは呼べない。失敗させて、見本のほうへ落とす
    if (url.indexOf('/api/session-advice') > -1) {
      return json({ error: 'preview: 生成サーバーはありません' }, 503);
    }
    // 置き場の窓口を、黙って成功扱いにしてはいけない。
    // 「同期できた」と出たまま何も渡らないのが、いちばん困る嘘のため
    if (url.indexOf('/api/sync') > -1) {
      if (window.__salonFake) return origFetch(input, init);
      return json({ error: 'このプレビューには置き場のサーバーがありません。本番の画面でお試しください。' }, 503);
    }
    if (url.indexOf('/api/') > -1 || url.indexOf('/save_history') > -1) {
      return json({ status: 'ok', preview: true });
    }
    return origFetch(input, init);
  };
})();
`;

const banner = `
    <div id="preview-banner" role="note">
      <strong>プレビュー</strong>
      <span>実アプリの HTML / CSS / JS をそのまま1ファイルにしたものです。書いた内容はこのブラウザの中（localStorage）だけに残り、サロンの置き場へは渡りません。星詠みの6期間は、リポジトリに入っている生成済みの文章です。</span>
    </div>
`;

const bannerCss = `
    #preview-banner {
      display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px;
      margin: 0; padding: 10px 16px;
      font-size: 0.78rem; line-height: 1.6;
      color: #cfe9f5;
      background: rgba(0, 242, 254, 0.07);
      border-bottom: 1px solid rgba(0, 242, 254, 0.22);
    }
    #preview-banner strong {
      color: #00f2fe; font-weight: 700; letter-spacing: 0.08em;
      text-transform: uppercase; font-size: 0.72rem;
      white-space: nowrap;
    }
    #preview-banner span { flex: 1 1 20ch; min-width: 0; opacity: 0.9; }
`;

const content = `<title>${title}</title>
<style>
${inlineImages(css)}
${headStyles}
${bannerCss}
</style>
${banner}
${inlineImages(bodyInner)}
<script>
${marked}
</script>
<script>
${shim}
</script>
<script>
${MODULES.map((name) => `/* ===== product/js/app/${name} ===== */\n${flat[name]}`).join('\n')}
</script>
`;

fs.mkdirSync(OUT_DIR, { recursive: true });
const outFile = path.join(OUT_DIR, 'therapist-crm-preview.html');
fs.writeFileSync(outFile, content);
// 手元で開いて確かめる用（Artifact 側が付ける殻を、自分で付けたもの）
fs.writeFileSync(
    path.join(OUT_DIR, 'local-test.html'),
    `<!doctype html><html lang="ja"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width, initial-scale=1">\n${content}\n</body></html>`
);
console.log('built:', outFile, (content.length / 1024).toFixed(0) + 'KB');
