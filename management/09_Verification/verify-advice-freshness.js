// 星詠みが「いま最新かどうか」を、画面が正しく言うか。
//
// 直したいのは ISSUE-059。「毎日午前0時に更新」と出ているのに 11日前のものが
// 出ていた。**古いときに古いと言うか**、**新しいときに新しいと言うか**の両方を見る。
// 片方だけ見ても意味がない（いつも「最新です」と出す実装でも通ってしまう）。
const { chromium } = require('playwright');
const APP = 'http://127.0.0.1:8900/product/index.html';
const ok = (c) => (c ? '✅' : '❌');
let ng = 0;
const check = (l, c, e = '') => { if (!c) ng += 1; console.log(`  ${l}:`, ok(c), e); };

// 星詠みのファイルを差し替えて開く。中身は本物のまま、期限だけ動かす。
async function openAdvice(browser, { nextUpdateAtISO, drop = false } = {}) {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
    page.on('pageerror', (e) => { console.log('   ERR', e.message.slice(0, 130)); ng += 1; });

    if (nextUpdateAtISO !== undefined || drop) {
        await page.route('**/data/advice/today.json', async (route) => {
            const res = await route.fetch();
            const json = await res.json();
            if (drop) delete json.nextUpdateAtISO;
            else json.nextUpdateAtISO = nextUpdateAtISO;
            await route.fulfill({ response: res, body: JSON.stringify(json) });
        });
    }

    await page.goto(APP);
    await page.waitForTimeout(3000);
    await page.locator('#btn-view-advice').click();
    await page.waitForTimeout(2500);
    return page;
}

const read = (page) => page.evaluate(() => {
    const el = document.getElementById('advice-freshness');
    const next = document.getElementById('advice-next-update');
    return {
        // 畳まれていても文字は取れるよう textContent で見る
        fresh: el ? el.textContent.trim() : null,
        shown: el ? getComputedStyle(el).display !== 'none' : null,
        cycle: next ? next.textContent.trim() : null
    };
});

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

    console.log('=== 1. 期限内なら「最新です」と出るか');
    // 100日先まで有効ということにする
    let p = await openAdvice(b, { nextUpdateAtISO: new Date(Date.now() + 100 * 86400000).toISOString() });
    let r = await read(p);
    console.log('   ', JSON.stringify(r));
    check('印が出ている', r.shown === true);
    check('「最新です」と言う', /最新です/.test(r.fresh || ''));
    check('古いとは言わない', !/過ぎています/.test(r.fresh || ''));
    check('サイクルが「目安」ではなく「サイクル」と書いてある',
        /更新サイクル/.test(r.cycle || ''), r.cycle);
    await p.context().close();

    console.log('\n=== 2. 期限を過ぎたら、過ぎたと言うか（ISSUE-059 の状態を再現）');
    // 11日前に期限が切れた状態＝サロンが見た画面
    p = await openAdvice(b, { nextUpdateAtISO: new Date(Date.now() - 11 * 86400000).toISOString() });
    r = await read(p);
    console.log('   ', JSON.stringify(r));
    check('印が出ている', r.shown === true);
    check('「過ぎています」と言う', /過ぎています/.test(r.fresh || ''));
    check('何日ぶん遅れているかが出る', /11日/.test(r.fresh || ''), r.fresh);
    check('最新だとは言わない', !/最新です/.test(r.fresh || ''));
    check('作り直しかたが書いてある', /advice:refresh/.test(r.fresh || ''));
    await p.context().close();

    console.log('\n=== 3. 期限の項目が無い古いファイルでは、黙るか');
    // 分からないのに「最新です」と言うほうが害が大きい
    p = await openAdvice(b, { drop: true });
    r = await read(p);
    console.log('   ', JSON.stringify(r));
    check('何も出さない', r.shown === false, `display=${r.shown}`);
    check('最新だとも古いとも言わない', !/最新です|過ぎています/.test(r.fresh || ''));
    await p.context().close();

    console.log('\n=== 4. 配ってあるファイルが、実際に期限を持っているか');
    // 画面側だけ直しても、ファイルに項目が無ければ 3 の「黙る」に落ちる
    const res = await fetch('http://127.0.0.1:8900/product/data/advice/today.json');
    const json = await res.json();
    check('nextUpdateAtISO がある', typeof json.nextUpdateAtISO === 'string', json.nextUpdateAtISO);
    const next = new Date(json.nextUpdateAtISO);
    check('読める日時になっている', !Number.isNaN(next.getTime()));
    check('生成日時より後になっている', next > new Date(json.generatedAtISO),
        `${json.generatedAtISO} → ${json.nextUpdateAtISO}`);

    console.log('\n=== 5. 素のまま開いたとき、いま何と出るか（参考）');
    p = await openAdvice(b);
    r = await read(p);
    console.log('   ', JSON.stringify(r));
    check('どちらかをはっきり言っている', /最新です|過ぎています/.test(r.fresh || ''));
    await p.context().close();

    console.log(ng === 0 ? '\n  ぜんぶ通りました' : `\n  ❌ ${ng} 件だめでした`);
    await b.close();
    process.exit(ng === 0 ? 0 : 1);
})();
