// 📋 カルテのたたみ方と、🕐 を寄せた結果（ISSUE-070, 072, 073）。
//
// 訴えの長い方だと1件で画面が埋まり、何回目・何日ぶりが追えなくなっていた。
//
// 「たためるか」だけを見ると、**いつも閉じている実装でも通る。**
// 押して開くところ、もう一度押して閉じるところ、
// そしてカレンダーから飛んできた日は**最初から開いている**ところまで見る。
//
// 🕐「施術日・回数」は 📋 へ寄せた。**寄せたものが本当に出ているか**
// （通算回数・ペース・第N回・N日ぶり）まで見ないと、
// **ただ消しただけの実装でも通ってしまう。**
const { chromium } = require('playwright');
const APP = 'http://127.0.0.1:8900/product/index.html';
const ok = (c) => (c ? '✅' : '❌');
let ng = 0;
const check = (l, c, e = '') => { if (!c) ng += 1; console.log(`  ${l}:`, ok(c), e); };

const CUST = '山田 花子';

async function openCustomer(page, name) {
    const hit = await page.evaluate((n) => {
        const card = [...document.querySelectorAll('.customer-card-grid-item')]
            .find((el) => el.textContent.includes(n));
        if (card) card.click();
        return Boolean(card);
    }, name);
    if (!hit) { console.log(`  ${name} のカードが見つからない: ❌`); ng += 1; }
    await page.waitForTimeout(1500);
}

async function openTab(page, tab) {
    await page.locator(`.detail-subtab-btn[data-tab="${tab}"]`).click();
    await page.waitForTimeout(1200);
}

// 見えているか。display:none は高さ0で返るので、それで判定する。
const shown = (loc) => loc.evaluate((el) => el.getBoundingClientRect().height > 0);

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
    p.on('pageerror', (e) => { console.log('  ERR', e.message.slice(0, 130)); ng += 1; });

    await p.goto(APP);
    await p.waitForTimeout(3200);

    await openCustomer(p, CUST);
    await openTab(p, 'visit-type');

    console.log('=== 1. 施術日回数が、最初はたたまれているか');
    const items = p.locator('.history-item');
    const n = await items.count();
    check('回数のカードが出ている', n > 0, `${n}件`);

    const first = items.first();
    check('最初は中身が閉じている', !(await shown(first.locator('.history-item-body'))));
    check('たたんでいても、施術内容が読める',
        (await first.locator('.history-summary-type').textContent()).trim().length > 0);
    check('たたんでいても、訴えの頭が読める',
        (await first.locator('.history-summary-line').textContent()).trim().length > 2);
    check('第N回の帯は、たたんでいても出ている',
        await shown(first.locator('.history-item-header')));

    console.log('\n=== 2. 押すと開き、もう一度押すと閉じるか');
    await first.locator('.history-summary').click();
    await p.waitForTimeout(400);
    check('押すと中身が出る', await shown(first.locator('.history-item-body')));
    check('開いたことが読み上げにも伝わる',
        (await first.locator('.history-summary').getAttribute('aria-expanded')) === 'true');
    await first.locator('.history-summary').click();
    await p.waitForTimeout(400);
    check('もう一度押すと閉じる', !(await shown(first.locator('.history-item-body'))));

    console.log('\n=== 3. 長い訴えが、たたんだ側で切られているか');
    // 切っていないと、たたんだ意味が無くなる。
    // 見本の訴えは短いので、**わざと長いものを入れて**から見る。
    const LONG = 'ここ数週間、肩から首すじにかけての張りが取れず、朝起きたときに頭が重い。'
        + 'パソコンの仕事が続いており、夕方になると目の奥も痛む。就寝前に軽く伸ばしているが戻ってしまう。';
    await p.evaluate((text) => {
        const list = JSON.parse(localStorage.getItem('therapist_customers') || '[]');
        const c = list.find((x) => (x.name || '').includes('山田'));
        if (c && c.records && c.records.length) c.records[0].clientComplaint = text;
        localStorage.setItem('therapist_customers', JSON.stringify(list));
    }, LONG);
    await p.reload();
    await p.waitForTimeout(3200);
    await openCustomer(p, CUST);
    await openTab(p, 'visit-type');

    const cut = await p.evaluate(() => {
        const els = [...document.querySelectorAll('.history-item')];
        const long = els.find((el) => (el.querySelector('.history-summary-line').textContent || '').includes('…'));
        const body = long ? long.querySelector('.history-item-body').textContent.trim().length : 0;
        const head = long ? long.querySelector('.history-summary-line').textContent.trim().length : 0;
        return { found: Boolean(long), body, head };
    });
    check('長い訴えは、たたんだ側で切られている', cut.found);
    check('たたんだ側のほうが短い', cut.found && cut.head < cut.body, `${cut.head} < ${cut.body}`);
    check('切っても、頭の50字ぶんには収まっている', cut.head > 0 && cut.head < 60, `${cut.head}字`);

    console.log('\n=== 3.5 📋・💴 が、同じカードを使っているか（ISSUE-072）');
    // 3か所に書き分けていたので、片方だけ古くなっていた。
    // 「同じ中身が出るか」を、実際に並べて突き合わせる。
    const shape = {};
    for (const tab of ['visit-type', 'visit-amount']) {
        await openTab(p, tab);
        shape[tab] = await p.evaluate(() => {
            const el = document.querySelector('.history-item');
            if (!el) return null;
            const q = (sel) => Boolean(el.querySelector(sel));
            return {
                summary: q('.history-summary'),
                type: q('.history-summary-type'),
                line: q('.history-summary-line'),
                body: q('.history-item-body'),
                // 開いた中に出る欄。📋 だけが持っていたもの
                fields: (el.querySelector('.history-item-body') || {}).textContent
                    ? ['選んだ色', '訴え', '処方', 'メモ'].filter((k) =>
                        el.querySelector('.history-item-body').textContent.includes(k)).join('/')
                    : ''
            };
        });
        console.log(`   ${tab}:`, JSON.stringify(shape[tab]));
    }
    check('どちらもたためるカードになっている',
        ['visit-type', 'visit-amount'].every((t) => shape[t] && shape[t].summary && shape[t].body));
    check('どちらも同じ欄が開いた中に出る',
        shape['visit-type'].fields === shape['visit-amount'].fields,
        JSON.stringify(['visit-type', 'visit-amount'].map((t) => shape[t].fields)));
    check('📋 が持っていた欄が、そろって出ている',
        shape['visit-type'].fields.includes('処方') && shape['visit-type'].fields.includes('メモ'),
        shape['visit-type'].fields);

    console.log('\n=== 3.6 開いたら、たたんだ側の1行が消えるか');
    // 同じ文が二重に出ていた
    await openTab(p, 'visit-type');
    const dupItem = p.locator('.history-item').first();
    check('たたんでいる間は要約が出ている', await shown(dupItem.locator('.history-summary-line')));
    await dupItem.locator('.history-summary').click();
    await p.waitForTimeout(400);
    check('開くと要約は引っ込む', !(await shown(dupItem.locator('.history-summary-line'))));
    check('開いた中には全文が出ている',
        (await dupItem.locator('.history-item-body').textContent()).includes('訴え'));
    await dupItem.locator('.history-summary').click();
    await p.waitForTimeout(300);

    console.log('\n=== 4. 🕐 で見ていたものが、カルテに残っているか（ISSUE-073）');
    // 消しただけになっていないか。寄せた先に本当に出ているかを見る
    await openTab(p, 'visit-type');
    check('🕐 のタブがもう無い',
        (await p.locator('.detail-subtab-btn[data-tab="visit-count"]').count()) === 0);
    // 🕐 を寄せて5つ（ISSUE-073）、👤 を名前へ移して4つ（ISSUE-077）
    check('タブは4つになっている',
        (await p.locator('.detail-subtab-btn').count()) === 4,
        `${await p.locator('.detail-subtab-btn').count()}個`);

    const stats = await p.locator('.visit-stats').textContent().catch(() => '');
    console.log('   見出し:', JSON.stringify(String(stats).replace(/\s+/g, ' ').trim()));
    check('通算施術回数が出ている', /通算施術回数/.test(stats));
    check('最終施術日が出ている', /最終施術日/.test(stats));
    check('平均施術ペースが出ている', /平均施術ペース/.test(stats));

    const first4 = p.locator('.history-item').first();
    check('第N回の帯が出ている', (await first4.locator('.visit-no').textContent()).includes('第'));
    check('前回からの間隔が出ている',
        (await first4.locator('.visit-gap').textContent()).match(/日ぶり|初回来店/) !== null,
        (await first4.locator('.visit-gap').textContent()).trim());
    check('帯は、たたんでいても見えている', await shown(first4.locator('.visit-head')));

    console.log('\n=== 5. カレンダーから飛んできた日は、最初から開いているか');
    // 押した日を見に来ているのに閉じていたら、もう一度押させることになる
    await openTab(p, 'visit-calendar');
    const dayCell = p.locator('#personal-calendar-instance .calendar-day.has-event').first();
    check('記録のある日がある', await dayCell.count() > 0);
    await dayCell.click();
    await p.waitForTimeout(1000);
    // その月の一覧のカードから、カルテ側へ入る
    const card = p.locator('#cust-month-list .cust-month-card').first();
    if (await card.count()) {
        await card.click();
        await p.waitForTimeout(1200);
    }
    await openTab(p, 'visit-type');
    const openedCount = await p.locator('.history-item.is-open').count();
    check('見に来た日は開いた状態で出る', openedCount > 0, `${openedCount}件`);

    console.log(ng === 0 ? '\n  ぜんぶ通りました' : `\n  ❌ ${ng} 件だめでした`);
    await b.close();
    process.exit(ng === 0 ? 0 : 1);
})();
