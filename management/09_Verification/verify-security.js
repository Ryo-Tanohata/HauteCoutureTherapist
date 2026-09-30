// セキュリティの見張り（ISSUE-088）。
//
// 「直したつもり」で終わらせないために、**実際に攻める形をそのまま置いておく**。
// どれも一度は通ってしまったもの。
//
//   ① 取り込んだファイルの色の値から、HTML を書き込めないか
//   ② 生成AIの文に HTML があったとき、そのまま出ないか
//   ③ 本番の守り（CSP・各ヘッダー）が付いているか
//   ④ このPCのサーバーが、外から開けないか／よそのサイトから読めないか
//
// ④は node のサーバーを別に立てて見るので、少し時間がかかる。
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const APP = 'http://127.0.0.1:8900/product/index.html';
const ROOT = path.resolve(__dirname, '..', '..');
const ok = (c) => (c ? '✅' : '❌');
let ng = 0;
const check = (l, c, e = '') => { if (!c) ng += 1; console.log(`  ${l}:`, ok(c), e); };

/** 色の値に仕込む形。**空白を入れない**のが要。
 *  空白があると classList.add が例外を投げて、たまたま止まる */
const EVIL_COLOR = '#ff0000"onmouseover="window.__XSS=1"';

const evilBackup = () => JSON.stringify({
    app: 'therapist-crm', version: 1, exportedAtISO: '2026-08-21T00:00:00.000Z',
    customers: [{
        id: 'verify-evil', customerNo: 'C-9999', name: '検証用', kana: 'ケンショウヨウ',
        soulColors: [EVIL_COLOR], soulColor: EVIL_COLOR, isArchived: false,
        updatedAtISO: '2099-01-01T00:00:00.000Z', records: [],
    }],
    deletions: { customers: {}, records: {} },
    colorMasters: [], freeTextMerges: {}, photos: [],
});

/** サーバーが上がるまで待つ。決め打ちの待ち時間だと、遅い日に落ちる */
async function waitUp(url, ms = 15000) {
    const until = Date.now() + ms;
    while (Date.now() < until) {
        try {
            const r = await fetch(url);
            if (r.status) return true;
        } catch (e) { /* まだ */ }
        await new Promise((r) => setTimeout(r, 300));
    }
    return false;
}

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-sec-'));
    const evilPath = path.join(tmp, 'evil.json');
    fs.writeFileSync(evilPath, evilBackup(), 'utf8');

    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

    console.log('\n=== 1. 取り込んだ色の値から、HTML を書き込めないか');
    // 色は style="..." の中へ直に入る。引用符が通ると、その場で属性を閉じて
    // 好きな属性を足せる。取り込みも同期も、中身を検証していない
    {
        const p = await b.newPage();
        const refused = [];
        p.on('dialog', (d) => d.accept());
        p.on('console', (m) => { if (/Refused|Content Security/i.test(m.text())) refused.push(m.text()); });
        await p.goto(APP);
        await p.waitForTimeout(3000);
        await p.locator('#btn-view-color-settings').click();
        await p.waitForTimeout(1000);
        await p.locator('#input-import-data').setInputFiles(evilPath);
        await p.waitForTimeout(1200);
        await p.locator('#confirm-modal-content button').filter({ hasText: '読み込む' }).first().click();
        await p.waitForTimeout(2200);
        await p.reload();
        await p.waitForTimeout(3000);

        // **取り込めたことを先に確かめる。** 入っていなければ、何も試していない
        const imported = await p.evaluate(() => JSON.parse(
            localStorage.getItem('therapist_customers') || '[]').some((c) => c.id === 'verify-evil'));
        check('仕掛けたファイルが取り込まれた（＝試せている）', imported);

        await p.locator('#search-input').fill('検証用');
        await p.waitForTimeout(1200);
        const shown = await p.locator('.customer-card-grid-item').count();
        check('カードは描かれる（例外で消えていない）', shown > 0, `${shown}枚`);

        const attrs = await p.locator('[onmouseover]').count();
        check('仕込んだ属性が入っていない', attrs === 0, `${attrs}個`);
        if (attrs > 0) await p.locator('[onmouseover]').first().hover().catch(() => {});
        await p.waitForTimeout(500);
        check('動いていない', !(await p.evaluate(() => window.__XSS === 1)));

        // 色は捨てずに、無難な見た目へ落としているか
        const dot = await p.evaluate(() => {
            const c = [...document.querySelectorAll('.customer-card-grid-item')][0];
            const d = c && c.querySelector('.soul-dot');
            return d ? d.getAttribute('style') : null;
        });
        console.log('   出た色:', JSON.stringify(dot));
        check('引用符が残っていない', !String(dot || '').includes('"'), String(dot));
        await p.close();
    }

    console.log('\n=== 2. 生成AIの文に HTML があったとき、そのまま出ないか');
    // marked v12 に sanitize は無い。星詠みの本文は生成AIが書いたもの
    {
        const p = await b.newPage();
        await p.goto(APP);
        await p.waitForTimeout(2500);
        const r = await p.evaluate(() => {
            if (!window.marked) return null;
            const raw = '## 見出し\n- 箇条書き\n<img src=x onerror="window.__X=1">文';
            const noTags = String(raw).replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const out = window.marked.parse(noTags);
            return {
                直に渡すと出る: window.marked.parse(raw).includes('<img'),
                潰すと出ない: !out.includes('<img'),
                見出しは残る: out.includes('<h2'),
                箇条書きは残る: out.includes('<li'),
            };
        });
        console.log('   ', JSON.stringify(r));
        check('marked は生の HTML を通す（＝潰す必要がある）', r && r.直に渡すと出る);
        check('山括弧を潰せば出ない', r && r.潰すと出ない);
        check('見出しと箇条書きは残る', r && r.見出しは残る && r.箇条書きは残る);
        // 実物の側でも、その処理を通していること
        const src = fs.readFileSync(path.join(ROOT, 'product/js/app/ui.js'), 'utf8');
        check('星詠みを marked に直に渡していない',
            !/marked\.parse\(rawText\)/.test(src));
        await p.close();
    }

    console.log('\n=== 3. 本番の守りが付いているか');
    {
        const res = await fetch('http://127.0.0.1:8900/product/index.html');
        const h = (k) => res.headers.get(k) || '';
        const csp = h('content-security-policy');
        check('CSP がある', Boolean(csp));
        check("script-src に 'unsafe-inline' が無い",
            !/script-src[^;]*'unsafe-inline'/.test(csp), csp.slice(0, 60));
        check("object-src が 'none'", /object-src 'none'/.test(csp));
        check("frame-ancestors が 'none'", /frame-ancestors 'none'/.test(csp));
        check("base-uri が 'none'", /base-uri 'none'/.test(csp));
        check('X-Content-Type-Options', h('x-content-type-options') === 'nosniff');
        check('X-Frame-Options', h('x-frame-options') === 'DENY');
        check('Referrer-Policy', h('referrer-policy') === 'no-referrer');
        check('HSTS', h('strict-transport-security').includes('max-age'));
        check('検索に載せない', h('x-robots-tag').includes('noindex'));
    }

    console.log('\n=== 4. このPCのサーバーが、外から開けないか');
    // 以前は 0.0.0.0 で、同じネットワークの機械から誰でも開けた。
    // 認証は無く、フォルダの中のファイルはそのまま配られる
    {
        const port = 8934;
        const srv = spawn('node', [path.join(ROOT, 'server/bridge.js')], {
            cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: 'ignore',
        });
        try {
            const up = await waitUp(`http://127.0.0.1:${port}/package.json`);
            check('サーバーが上がった（＝試せている）', up);
            if (up) {
                const local = await fetch(`http://127.0.0.1:${port}/package.json`,
                    { headers: { Origin: `http://localhost:${port}` } });
                check('このPCからは通る', local.status === 200, String(local.status));
                check('このPCの元は許されている',
                    (local.headers.get('access-control-allow-origin') || '').includes('localhost'),
                    String(local.headers.get('access-control-allow-origin')));

                const evil = await fetch(`http://127.0.0.1:${port}/package.json`,
                    { headers: { Origin: 'https://evil.example' } });
                check('よそのサイトには許可を返さない',
                    !evil.headers.get('access-control-allow-origin'),
                    String(evil.headers.get('access-control-allow-origin')));

                // このPCの外から開けないこと
                const ips = Object.values(os.networkInterfaces()).flat()
                    .filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => n.address);
                console.log('   このPCの外向きの住所:', JSON.stringify(ips));
                let reachable = false;
                for (const ip of ips) {
                    try {
                        const c = new AbortController();
                        const t = setTimeout(() => c.abort(), 2500);
                        const r = await fetch(`http://${ip}:${port}/package.json`, { signal: c.signal });
                        clearTimeout(t);
                        if (r.status === 200) reachable = true;
                    } catch (e) { /* つながらない＝よい */ }
                }
                check('外の住所からは開けない', !reachable);
                check('住所を1つ以上試せた（＝試せている）', ips.length > 0, JSON.stringify(ips));

                // 失敗したときに、置き場所や中の作りを出さないこと
                fs.writeFileSync(path.join(ROOT, '.verify-sec-tmp'), 'x', 'utf8');
                const err = await (await fetch(`http://127.0.0.1:${port}/.verify-sec-tmp`)).text();
                fs.unlinkSync(path.join(ROOT, '.verify-sec-tmp'));
                check('絶対パスを出していない', !err.includes('/home/') && !err.includes('node_modules'),
                    err.slice(0, 60));
            }
        } finally {
            srv.kill();
            await new Promise((r) => setTimeout(r, 500));
        }
    }

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(ng === 0 ? '\n  ぜんぶ通りました' : `\n  ❌ ${ng} 件だめでした`);
    await b.close();
    process.exit(ng === 0 ? 0 : 1);
})();
