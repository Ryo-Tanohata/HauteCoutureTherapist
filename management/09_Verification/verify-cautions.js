// ⚠️ の枠に、注意事項でないものが入っていないか。
//
// ISSUE-060。資格（臨床工学技士 学術修士）が「⚠️ この方の注意事項」に出ていた。
// 赤い枠に関係ないものが混ざると、**本当のアレルギーがその中に埋もれる**。
//
// 見るのは2つ。**入るべきものが入っているか**と、**入るべきでないものが入っていないか**。
// 前者だけでは、いままでの「全部入れる」実装でも通ってしまう。
const { chromium } = require('playwright');
const APP = 'http://127.0.0.1:8900/product/index.html';
const ok = (c) => (c ? '✅' : '❌');
let ng = 0;
const check = (l, c, e = '') => { if (!c) ng += 1; console.log(`  ${l}:`, ok(c), e); };

// 見たい顧客を id で選ぶ。見本の客が混ざるので [0] では当たらない（ISSUE-034）
async function openCustomer(page, name) {
    const hit = await page.evaluate((n) => {
        const card = [...document.querySelectorAll('.customer-card-grid-item')]
            .find((el) => el.textContent.includes(n));
        if (card) card.click();
        return Boolean(card);
    }, name);
    if (!hit) { console.log(`  ${name} のカードが見つからない:`, '\u274c'); ng += 1; }
    await page.waitForTimeout(1600);
}

const readPanel = (page) => page.evaluate(() => {
    const all = [...document.querySelectorAll('#tab-content-area div')];
    const box = (head) => {
        const el = all.find((d) => d.textContent.trim().startsWith(head));
        return el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
    };
    return {
        caution: box('⚠️ この方の注意事項'),
        memo: box('📝 カルテのメモ')
    };
});

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    const p = await (await b.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
    p.on('pageerror', (e) => { console.log('  ERR', e.message.slice(0, 130)); ng += 1; });

    await p.goto(APP);
    await p.waitForTimeout(3200);

    // ------------------------------------------------------------------
    // 1. サロンが見た状態を作る。資格をメモ欄に入れて、⚠️ に出ないことを見る。
    // ------------------------------------------------------------------
    console.log('=== 1. 資格をメモに書いたとき（ISSUE-060 の再現）');
    await p.evaluate(() => {
        const list = JSON.parse(localStorage.getItem('therapist_customers') || '[]');
        const c = list.find((x) => x.id === '1');
        c.memo = '臨床工学技士 学術修士';
        c.initialConsultation = '';
        c.intake = { personal: '', reasonGoal: '', family: '', history: '', medication: '' };
        localStorage.setItem('therapist_customers', JSON.stringify(list));
    });
    await p.reload();
    await p.waitForTimeout(3200);
    await openCustomer(p, '山田 花子');
    await p.locator('.detail-subtab-btn').last().click();   // ✨ 星とアロマ
    await p.waitForTimeout(1500);

    let r = await readPanel(p);
    console.log('   ⚠️:', JSON.stringify(r.caution));
    console.log('   📝:', JSON.stringify(r.memo));
    check('⚠️ の枠が出ていない', r.caution === null, r.caution || '');
    check('資格が ⚠️ に入っていない', !/臨床工学技士/.test(r.caution || ''));
    check('資格は消えずに 📝 に出ている', /臨床工学技士/.test(r.memo || ''));
    check('どこに書けば ⚠️ になるかが書いてある',
        /病歴/.test(r.memo || '') && /薬/.test(r.memo || ''));

    // ------------------------------------------------------------------
    // 2. 本物の注意事項を「病歴」に入れたら、⚠️ に出るか。
    //    こちらを見ないと「何も出さない」実装でも通ってしまう。
    // ------------------------------------------------------------------
    console.log('\n=== 2. 病歴・薬に書いたとき');
    await p.evaluate(() => {
        const list = JSON.parse(localStorage.getItem('therapist_customers') || '[]');
        const c = list.find((x) => x.id === '1');
        c.intake = {
            personal: '', reasonGoal: '', family: '',
            history: 'アトピー肌。柑橘系の光毒性に留意。',
            medication: '降圧剤を服用中。'
        };
        localStorage.setItem('therapist_customers', JSON.stringify(list));
    });
    await p.reload();
    await p.waitForTimeout(3200);
    await openCustomer(p, '山田 花子');
    await p.locator('.detail-subtab-btn').last().click();
    await p.waitForTimeout(1500);

    r = await readPanel(p);
    console.log('   ⚠️:', JSON.stringify(r.caution));
    console.log('   📝:', JSON.stringify(r.memo));
    check('⚠️ の枠が出ている', r.caution !== null);
    check('病歴が ⚠️ に入っている', /アトピー肌/.test(r.caution || ''));
    check('薬が ⚠️ に入っている', /降圧剤/.test(r.caution || ''));
    check('どの欄から来たかが分かる',
        /病歴/.test(r.caution || '') && /薬/.test(r.caution || ''));
    check('資格は ⚠️ に混ざっていない', !/臨床工学技士/.test(r.caution || ''));
    check('資格は 📝 に残っている', /臨床工学技士/.test(r.memo || ''));

    // ------------------------------------------------------------------
    // 3. 見本データが、正しい欄に入っているか。
    //    画面だけ直しても、見本が古い形のままでは ⚠️ が空の見本になる。
    // ------------------------------------------------------------------
    console.log('\n=== 3. 見本データの持ちかた');
    await p.evaluate(() => localStorage.removeItem('therapist_customers'));
    await p.reload();
    await p.waitForTimeout(3400);
    const demo = await p.evaluate(() => {
        const list = JSON.parse(localStorage.getItem('therapist_customers') || '[]');
        return list.filter((c) => ['1','2','3','4','5'].includes(String(c.id))).map((c) => ({
            id: c.id,
            history: ((c.intake || {}).history || '').slice(0, 24),
            medication: ((c.intake || {}).medication || '').slice(0, 20),
            memo: (c.memo || '').slice(0, 20)
        }));
    });
    demo.forEach((d) => console.log('   ', JSON.stringify(d)));
    check('見本すべてが病歴を持っている', demo.length >= 5 && demo.every((d) => d.history),
        `${demo.filter((d) => d.history).length}/${demo.length}`);
    check('見本のメモは注意事項でない文になっている',
        demo.every((d) => !/アレルギー|服薬|既往|妊娠/.test(d.memo)));

    console.log(ng === 0 ? '\n  ぜんぶ通りました' : `\n  ❌ ${ng} 件だめでした`);
    await b.close();
    process.exit(ng === 0 ? 0 : 1);
})();
