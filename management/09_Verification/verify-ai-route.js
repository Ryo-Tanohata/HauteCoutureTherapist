// 「いま使っているAI」が、設定の見出しとチャットのヘッダーに出るか。
// そして、開き方（PCのサーバーが居る／居ない）で表示が変わるか。
const { chromium } = require('playwright');
const APP = 'http://127.0.0.1:8900/product/index.html';
const ok = (c) => (c ? '✅' : '❌');
let ng = 0;
const check = (label, cond, extra = '') => { if (!cond) ng += 1; console.log(`  ${label}:`, ok(cond), extra); };

/** PCのサーバーが居る状態を、そっくり作る */
const fakeLocalServer = (payload) => (p) => p.addInitScript((payload) => {
    const real = window.fetch.bind(window);
    window.fetch = async (url, opts) => {
        if (String(url).indexOf('/api/ai-status') !== -1) {
            return new Response(JSON.stringify(payload), {
                status: 200, headers: { 'Content-Type': 'application/json' }
            });
        }
        return real(url, opts);
    };
}, payload);

const openSettings = async (p) => {
    await p.locator('#btn-view-color-settings').click();
    await p.waitForTimeout(1500);
};
const badge = async (p) => {
    const el = p.locator('#ai-route-badge');
    if (!(await el.count())) return null;
    return { text: (await el.textContent()).trim(), tone: await el.getAttribute('data-tone') };
};
const headerRoute = async (p) => {
    await p.locator('[id$="-fab"]').first().click();
    await p.waitForTimeout(1200);
    const el = p.locator('[id$="-route"]').first();
    if (!(await el.count())) return null;
    return { text: (await el.textContent()).trim(), tone: await el.getAttribute('data-tone') };
};

const newPage = async (b, before) => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => { console.log('  ERR', e.message.slice(0, 140)); ng += 1; });
    // **AIを使う設定にしてから見る。**
    // 💬 は ISSUE-071、下ごしらえは ISSUE-083 で、どちらも既定は「使わない」。
    // そのままだと繋ぎ先の札も 💬 も画面に無く、ここは 30秒待って落ちる。
    // （ISSUE-071 のあと、この検証はずっとそうなっていた）
    await p.addInitScript(() => {
        localStorage.setItem('therapist_chat_enabled', 'on');
        localStorage.setItem('therapist_prep_enabled', 'on');
    });
    if (before) await before(p);
    return p;
};

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

    console.log('=== 1. PCのサーバーが居て、Claude のアカウントで動くとき');
    const a = await newPage(b, fakeLocalServer({
        chain: ['claude', 'gemini'], agentSdk: true, primary: 'claude',
        models: { claude: 'claude-opus-5', gemini: 'gemini-2.5-flash' },
        plannedModel: 'claude-opus-5'
    }));
    await a.goto(APP); await a.waitForTimeout(3000);
    await openSettings(a);
    const ab = await badge(a);
    console.log('   設定の札:', JSON.stringify(ab));
    check('札が出ている', !!ab);
    check('アカウントで動くと分かる', ab && ab.text.includes('アカウント'), ab && ab.text);
    check('モデル名が出ている', ab && ab.text.includes('claude-opus-5'), ab && ab.text);
    check('良い色になっている', ab && ab.tone === 'good', ab && ab.tone);
    const ah = await headerRoute(a);
    console.log('   チャットの札:', JSON.stringify(ah));
    check('チャットにも出ている', !!ah && ah.text.includes('アカウント'));
    check('チャットにもモデル名', !!ah && ah.text.includes('claude-opus-5'), ah && ah.text);
    check('チャットも同じ色', ah && ah.tone === 'good');

    console.log('\n=== 2. サーバーが居ない（いつものURL）＋キーがあるとき');
    const c = await newPage(b);
    await c.goto(APP); await c.waitForTimeout(2500);
    await c.evaluate(() => localStorage.setItem('therapist_ai_api_keys',
        JSON.stringify(['sk-ant-FAKE_one'])));
    await c.reload(); await c.waitForTimeout(3000);
    await openSettings(c);
    const cb = await badge(c);
    console.log('   設定の札:', JSON.stringify(cb));
    check('キーで動くと分かる', cb && cb.text.includes('APIキー'), cb && cb.text);
    check('アカウントとは書かれていない', cb && !cb.text.includes('アカウント'), cb && cb.text);
    check('中くらいの色', cb && cb.tone === 'ok', cb && cb.tone);
    const ch = await headerRoute(c);
    console.log('   チャットの札:', JSON.stringify(ch));
    check('チャットにも出ている', ch && ch.text.includes('APIキー'));

    console.log('\n=== 3. サーバーも居ない・キーも無いとき');
    const d = await newPage(b);
    await d.goto(APP); await d.waitForTimeout(2500);
    await d.evaluate(() => {
        localStorage.removeItem('therapist_ai_api_keys');
        localStorage.removeItem('therapist_ai_api_key');
    });
    await d.reload(); await d.waitForTimeout(3000);
    await openSettings(d);
    const db = await badge(d);
    console.log('   設定の札:', JSON.stringify(db));
    check('繋がっていないと分かる', db && db.text.includes('繋がっていません'), db && db.text);
    check('注意の色', db && db.tone === 'off', db && db.tone);

    console.log('\n=== 4. たたんだままでも見えるか');
    const closed = await d.evaluate(() => {
        const el = document.getElementById('ai-route-badge');
        if (!el) return null;
        const details = el.closest('details');
        if (details) details.open = false;
        const r = el.getBoundingClientRect();
        return { open: details ? details.open : null, w: Math.round(r.width), h: Math.round(r.height) };
    });
    console.log('   たたんだとき:', JSON.stringify(closed));
    check('たたんでも札が見えている', closed && closed.w > 0 && closed.h > 0);

    console.log('\n=== 5. 待たされないか（サーバーが居ないとき）');
    // アプリ自体の起動時間まで数えると、調べに行く速さが見えない。
    // 「設定を押してから札が出るまで」を測る。
    const e = await newPage(b);
    await e.goto(APP); await e.waitForTimeout(3000);
    const t0 = Date.now();
    await e.locator('#btn-view-color-settings').click();
    await e.locator('#ai-route-badge').waitFor({ state: 'attached', timeout: 15000 });
    await e.waitForFunction(() => {
        const el = document.getElementById('ai-route-badge');
        return el && el.textContent.indexOf('調べています') === -1;
    }, null, { timeout: 15000 });
    const ms = Date.now() - t0;
    console.log(`   出るまで ${ms}ms`);
    check('待たされない（4秒以内）', ms < 4000, `${ms}ms`);

    console.log('\n=== 6. スマホ幅で、はみ出さないか');
    const sp = await (await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
    await sp.goto(APP); await sp.waitForTimeout(3000);
    await sp.locator('#btn-view-color-settings').click(); await sp.waitForTimeout(1500);
    const over = await sp.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('横にはみ出していない', over <= 1, `はみ出し ${over}px`);

    console.log(ng === 0 ? '\n  ぜんぶ通りました' : `\n  ❌ ${ng} 件だめでした`);
    await b.close();
    process.exit(ng === 0 ? 0 : 1);
})();
