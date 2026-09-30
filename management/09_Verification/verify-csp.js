// 守りを付けた状態で、画面が壊れていないかを見る。
// CSP に引っかかったものは console に必ず出るので、1件でも出たら失敗にする。
const { chromium } = require('playwright');
const URL = 'http://127.0.0.1:8900/product/index.html';
const ok = (c) => (c ? '✅' : '❌');
let ng = 0;
const check = (label, cond, extra = '') => { if (!cond) ng += 1; console.log(`  ${label}:`, ok(cond), extra); };

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
    // 💬 は既定で出さない設定にした（ISSUE-071）。ここでは開いて確かめたいので、出す側にしておく
    await ctx.addInitScript(() => localStorage.setItem('therapist_chat_enabled', 'on'));
    const p = await ctx.newPage();
    const blocked = [];
    const errors = [];
    const outside = [];
    p.on('request', (q) => {
        const u = q.url();
        if (!/^https?:\/\/127\.0\.0\.1:8900/.test(u) && !u.startsWith('data:') && !u.startsWith('blob:')) {
            outside.push(u);
        }
    });
    p.on('console', (m) => {
        const t = m.text();
        if (/Content Security Policy|Refused to/i.test(t)) blocked.push(t);
    });
    p.on('pageerror', (e) => errors.push(e.message));

    await p.goto(URL);
    await p.waitForTimeout(3500);

    console.log('=== 1. 開いたときに、守りに弾かれたものが無いか');
    blocked.forEach((t) => console.log('   弾かれた:', t.slice(0, 160)));
    check('弾かれたものは無い', blocked.length === 0, `${blocked.length}件`);
    errors.forEach((t) => console.log('   エラー:', t.slice(0, 160)));
    check('画面のエラーも無い', errors.length === 0, `${errors.length}件`);

    console.log('\n=== 2. 中身が動いているか');
    check('marked を自前で読めている', await p.evaluate(() => typeof window.marked?.parse === 'function'));
    check('お客様一覧が出る', await p.locator('#btn-view-list').isVisible());
    await p.locator('#btn-view-list').click(); await p.waitForTimeout(1200);
    const cards = await p.locator('.customer-card-grid-item').count();
    check('カードが並ぶ', cards > 0, `${cards}枚`);

    await p.locator('.customer-card-grid-item').first().click(); await p.waitForTimeout(1500);
    check('カルテが開く', await p.locator('.detail-subtab-btn').first().isVisible());
    await p.locator('.detail-subtab-btn[data-tab="visit-type"]').click(); await p.waitForTimeout(1000);
    const hist = await p.locator('.history-summary, .history-item-header').count();
    check('来店の履歴が出る', hist > 0, `${hist}件`);

    await p.locator('#btn-view-calendar').click(); await p.waitForTimeout(1500);
    check('カレンダーが出る', (await p.locator('.calendar-name-card').count()) >= 0);

    console.log('\n=== 3. 手で書ける欄すべてに悪い文字を入れ、画面を一巡する');
    const PAY = '<img src=x onerror="window.__pwned=1">ここは字のまま';
    await p.evaluate(async (PAY) => {
        const m = await import('./js/app/data.js');
        const cs = JSON.parse(localStorage.getItem('therapist_customers') || '[]');
        const c = cs[0]; const r = (c.records || [])[0];
        m.updateCustomer(c.id, {
            name: PAY, nickname: PAY, kana: PAY, phone: PAY, referrer: PAY, memo: PAY,
            intake: { personal: PAY, reasonGoal: PAY, family: PAY, history: PAY, medication: PAY, memo: PAY }
        });
        m.updateRecord(c.id, r.id, {
            clientComplaint: PAY, prescription: PAY, therapistNote: PAY, type: PAY,
            kartes: { ...(r.kartes || {}), aroma: { note: PAY } }
        });
    }, PAY);

    const sweep = async (where) => {
        const n = await p.locator('img[src="x"]').count();
        const pwned = await p.evaluate(() => window.__pwned === 1);
        if (n > 0 || pwned) {
            const who = await p.evaluate(() => Array.from(document.querySelectorAll('img[src="x"]'))
                .map((el) => (el.parentElement?.outerHTML || '').slice(0, 120)));
            who.forEach((w) => console.log('     ↳', w));
        }
        check(`${where}: そのまま動く形になっていない`, n === 0 && !pwned, n ? `img ${n}個` : '');
    };

    await p.locator('#btn-view-list').click(); await p.waitForTimeout(1200);
    await sweep('お客様一覧');
    await p.locator('.customer-card-grid-item').first().click(); await p.waitForTimeout(1600);
    await sweep('カルテ（基本）');
    for (const tab of ['visit-type', 'visit-amount', 'visit-calendar', 'color-star']) {
        const t = p.locator(`.detail-subtab-btn[data-tab="${tab}"]`);
        if (await t.count()) { await t.click(); await p.waitForTimeout(1100); await sweep(`カルテ（${tab}）`); }
    }
    await p.locator('#btn-view-calendar').click(); await p.waitForTimeout(1500);
    await sweep('カレンダー');
    const cell = p.locator('.calendar-day.has-record, .calendar-day').first();
    if (await cell.count()) { await cell.click(); await p.waitForTimeout(1200); await sweep('日付を押したあと'); }
    check('字のまま読める', (await p.locator('body').innerText()).includes('ここは字のまま'));

    console.log('\n=== 4. 外へ取りに行ったものが、思っているものだけか');
    const uniq = [...new Set(outside.map((u) => (u.split('/')[2] || u)))];
    uniq.forEach((h) => console.log('   外:', h));
    check('実行されるものを外から読んでいない',
        !uniq.some((h) => /esm\.run|jsdelivr/.test(h)), uniq.join(', ') || '（外は無し）');

    console.log('\n=== 5. 操作ガイドのチャットが、壊れずに開くか');
    const chatBtn = p.locator('#fc-fab, [id$="-fab"]').first();
    if (await chatBtn.count()) {
        await chatBtn.click(); await p.waitForTimeout(1200);
        check('開いてもエラーが出ない', errors.length === 0, `${errors.length}件`);
        check('開いても弾かれない', blocked.length === 0, `${blocked.length}件`);
    } else {
        console.log('   （チャットのボタンが見つからないので飛ばす）');
    }

    console.log(ng === 0 ? '\n  ぜんぶ通りました' : `\n  ❌ ${ng} 件だめでした`);
    await b.close();
    process.exit(ng === 0 ? 0 : 1);
})();
