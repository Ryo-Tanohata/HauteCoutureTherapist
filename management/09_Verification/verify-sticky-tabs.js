// 画面を送っても、切り替えのタブが残るか。
// 場所を取りすぎていないか。ヘッダーと重なったり隙間が空いたりしないか。
const { chromium } = require('playwright');
const APP = 'http://127.0.0.1:8900/product/index.html';
const ok = (c) => (c ? '✅' : '❌');
let ng = 0;
const check = (l, c, e = '') => { if (!c) ng += 1; console.log(`  ${l}:`, ok(c), e); };

const geom = (p) => p.evaluate(() => {
    const head = document.querySelector('.app-header') || document.querySelector('header');
    const bar = document.querySelector('.top-control-bar');
    const sw = document.querySelector('.view-switcher');
    const r = (el) => { const b = el.getBoundingClientRect(); return {
        top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) }; };
    return {
        head: r(head), bar: r(bar), sw: r(sw),
        headVar: getComputedStyle(document.documentElement).getPropertyValue('--app-header-h').trim(),
        sticky: getComputedStyle(bar).position,
        scrollY: Math.round(window.scrollY)
    };
});

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

    for (const [w, h, label] of [[390, 844, 'スマホ'], [1280, 900, 'パソコン']]) {
        console.log(`\n=== ${label}（${w}px）`);
        const p = await (await b.newContext({ viewport: { width: w, height: h },
            hasTouch: w < 800, isMobile: w < 800 })).newPage();
        p.on('pageerror', (e) => { console.log('  ERR', e.message.slice(0, 130)); ng += 1; });
        await p.goto(APP); await p.waitForTimeout(3200);

        const before = await geom(p);
        console.log('   送る前:', JSON.stringify(before));
        check('貼り付ける設定になっている', before.sticky === 'sticky', before.sticky);
        check('ヘッダーの高さを測れている', /\d+px/.test(before.headVar), before.headVar);
        check('ヘッダーとタブが重なっていない', before.bar.top >= before.head.bottom - 1,
            `head下 ${before.head.bottom} / tab上 ${before.bar.top}`);

        // 中身の長い画面（設定）を開き、たたみを全部あけてから下まで送る。
        // お客様のカルテは中身が短いことがあり、送り幅が足りずに判定できない。
        await p.locator('#btn-view-color-settings').click(); await p.waitForTimeout(1600);
        await p.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
        await p.waitForTimeout(600);
        const room = await p.evaluate(() => {
            window.scrollTo(0, document.documentElement.scrollHeight);
            return Math.round(document.documentElement.scrollHeight - window.innerHeight);
        });
        await p.waitForTimeout(900);
        const after = await geom(p);
        console.log(`   送ったあと（送れる余地 ${room}px）:`, JSON.stringify(after));
        check('しっかり下まで送れた', room > 300 && after.scrollY >= room - 3,
            `${after.scrollY}/${room}px`);
        check('タブが画面に残っている', after.bar.bottom > 0 && after.bar.top < h,
            `上 ${after.bar.top} / 下 ${after.bar.bottom}`);
        check('ヘッダーのすぐ下に貼り付いている',
            Math.abs(after.bar.top - after.head.bottom) <= 2,
            `head下 ${after.head.bottom} / tab上 ${after.bar.top}`);
        check('押せる状態にある', await p.locator('#btn-view-calendar').isVisible());

        // 送った状態のまま、押して切り替わるか
        await p.locator('#btn-view-calendar').click(); await p.waitForTimeout(1500);
        check('送ったまま画面を移れる', await p.locator('#btn-view-calendar')
            .evaluate((el) => el.classList.contains('active')));

        console.log(`   タブの高さ: ${after.sw.h}px（ヘッダー ${after.head.h}px）`);
        if (w === 390) {
            check('場所を取りすぎていない（56px以下）', after.sw.h <= 56, `${after.sw.h}px`);
            check('押しやすさは残っている（36px以上）', after.sw.h >= 36, `${after.sw.h}px`);
            const seen = after.head.h + after.bar.h;
            check('上に占める合計が画面の1/4以下', seen <= h / 4, `${seen}px / ${h}px`);
        }

        const over = await p.evaluate(() =>
            document.documentElement.scrollWidth - document.documentElement.clientWidth);
        check('横にはみ出していない', over <= 1, `${over}px`);

        // カルテの中のタブ（🕐📅📋💴👤✨）が、上の切り替えタブと同じ寸法か。
        // 並べて置くものなので、片方だけ大きいと不揃いに見える。
        await p.locator('#btn-view-list').click(); await p.waitForTimeout(1000);
        await p.locator('.customer-card-grid-item').first().click(); await p.waitForTimeout(1600);
        const pair = await p.evaluate(() => {
            const h = (sel) => {
                const el = document.querySelector(sel);
                return el ? Math.round(el.getBoundingClientRect().height) : null;
            };
            return {
                上群: h('.view-switcher'), 下群: h('.detail-subtab-bar'),
                上ボタン: h('.nav-tab-btn'), 下ボタン: h('.detail-subtab-btn')
            };
        });
        console.log('   上下のタブの寸法:', JSON.stringify(pair));
        check('タブ群の高さが揃っている', pair.上群 !== null && pair.下群 !== null
            && Math.abs(pair.上群 - pair.下群) <= 2, `上${pair.上群} / 下${pair.下群}`);
        check('ボタンの高さも揃っている', Math.abs(pair.上ボタン - pair.下ボタン) <= 2,
            `上${pair.上ボタン} / 下${pair.下ボタン}`);
        if (w === 390) {
            check('下のタブも押しやすさを保っている（36px以上）', pair.下ボタン >= 36,
                `${pair.下ボタン}px`);
        }

        await p.context().close();
    }

    // ------------------------------------------------------------------
    // カルテの中のタブ（🕐📅📋💴👤✨）が、送っても上の帯の裏へ潜らないか。
    //
    // ISSUE-064。**画面の高さが足りているうちは、そもそも送りが起きない。**
    // 844px の窓では43pxしか動かず、判定にならなかった。実機はブラウザの枠が
    // 場所を取るぶん本文が短いので、**短い窓で測る**。
    // ------------------------------------------------------------------
    console.log('\n=== カルテのタブが、送っても残るか（短い窓 390x520）');
    {
        const p = await (await b.newContext({ viewport: { width: 390, height: 520 },
            hasTouch: true, isMobile: true })).newPage();
        p.on('pageerror', (e) => { console.log('  ERR', e.message.slice(0, 130)); ng += 1; });
        await p.goto(APP); await p.waitForTimeout(3200);
        await p.locator('#btn-view-list').click(); await p.waitForTimeout(900);
        await p.locator('.customer-card-grid-item').first().click(); await p.waitForTimeout(1600);
        await p.locator('.detail-subtab-btn[data-tab="visit-calendar"]').click();
        await p.waitForTimeout(1600);

        const room = await p.evaluate(() => {
            window.scrollTo(0, document.documentElement.scrollHeight);
            return Math.round(document.documentElement.scrollHeight - window.innerHeight);
        });
        await p.waitForTimeout(800);
        const g = await p.evaluate(() => {
            const bar = document.querySelector('.top-control-bar');
            const sub = document.querySelector('.detail-subtab-bar');
            return {
                pos: getComputedStyle(sub).position,
                barBottom: Math.round(bar.getBoundingClientRect().bottom),
                subTop: Math.round(sub.getBoundingClientRect().top),
                subBottom: Math.round(sub.getBoundingClientRect().bottom),
                scrollY: Math.round(window.scrollY)
            };
        });
        console.log(`   送ったあと（余地 ${room}px）:`, JSON.stringify(g));
        check('送りが実際に起きている', room > 60, `${room}px`);
        check('貼り付ける設定になっている', g.pos === 'sticky', g.pos);
        check('画面に残っている', g.subBottom > 0 && g.subTop < 520,
            `上 ${g.subTop} / 下 ${g.subBottom}`);
        check('上の帯の裏へ潜っていない', g.subTop >= g.barBottom - 2,
            `帯下 ${g.barBottom} / タブ上 ${g.subTop}`);
        check('押せる状態にある',
            await p.locator('.detail-subtab-btn[data-tab="visit-type"]').isVisible());
        // 送ったまま押して、別のタブへ移れるか
        await p.locator('.detail-subtab-btn[data-tab="visit-type"]').click();
        await p.waitForTimeout(1200);
        check('送ったまま中のタブを移れる',
            await p.locator('.detail-subtab-btn[data-tab="visit-type"]')
                .evaluate((el) => el.classList.contains('active')));
        await p.context().close();
    }

    // ------------------------------------------------------------------
    // トップ📅の「予約・施術記録を追加」が、送っても残るか（ISSUE-064）。
    // カレンダーは縦に長い。下のほうの日を見ているときに上まで戻らされると、
    // その場で予約が取れない。
    // ------------------------------------------------------------------
    console.log('\n=== 予約ボタンが、送っても残るか（短い窓 390x520）');
    {
        const p = await (await b.newContext({ viewport: { width: 390, height: 520 },
            hasTouch: true, isMobile: true })).newPage();
        p.on('pageerror', (e) => { console.log('  ERR', e.message.slice(0, 130)); ng += 1; });
        await p.goto(APP); await p.waitForTimeout(3200);
        await p.locator('#btn-view-calendar').click(); await p.waitForTimeout(1600);

        const room = await p.evaluate(() => {
            window.scrollTo(0, document.documentElement.scrollHeight);
            return Math.round(document.documentElement.scrollHeight - window.innerHeight);
        });
        await p.waitForTimeout(800);
        const g = await p.evaluate(() => {
            const bar = document.querySelector('.top-control-bar');
            const row = document.querySelector('.booking-open-row');
            return {
                pos: getComputedStyle(row).position,
                barBottom: Math.round(bar.getBoundingClientRect().bottom),
                rowTop: Math.round(row.getBoundingClientRect().top),
                rowBottom: Math.round(row.getBoundingClientRect().bottom)
            };
        });
        console.log(`   送ったあと（余地 ${room}px）:`, JSON.stringify(g));
        check('送りが実際に起きている', room > 60, `${room}px`);
        check('貼り付ける設定になっている', g.pos === 'sticky', g.pos);
        check('画面に残っている', g.rowBottom > 0 && g.rowTop < 520,
            `上 ${g.rowTop} / 下 ${g.rowBottom}`);
        check('上の帯の裏へ潜っていない', g.rowTop >= g.barBottom - 2,
            `帯下 ${g.barBottom} / ボタン上 ${g.rowTop}`);
        check('押せる状態にある', await p.locator('#btn-open-booking').isVisible());

        // 下まで送ったまま、実際に押して予約の画面が開くか。
        // 「見えている」だけでは足りない。貼り付いた帯が押下を横取りすることがある。
        await p.locator('#btn-open-booking').click();
        await p.waitForTimeout(1500);
        // このボタンが開くのは専用の #booking-modal（カルテの #record-modal ではない）
        check('送ったまま押して、予約の画面が開く',
            (await p.locator('#booking-modal.active').count()) > 0);

        const over = await p.evaluate(() =>
            document.documentElement.scrollWidth - document.documentElement.clientWidth);
        check('横にはみ出していない', over <= 1, `${over}px`);
        await p.context().close();
    }

    console.log(ng === 0 ? '\n  ぜんぶ通りました' : `\n  ❌ ${ng} 件だめでした`);
    await b.close();
    process.exit(ng === 0 ? 0 : 1);
})();
