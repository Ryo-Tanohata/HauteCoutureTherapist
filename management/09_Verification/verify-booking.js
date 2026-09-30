// 予約が「日付だけ」で取れるか。その人のページからも取れるか。
//
// ISSUE-063。予約の時点では内容も金額も決まっていないのに必須になっていて、
// 忘れないうちに日だけ押さえる、ができなかった。
// また、その人のページの📅は**記録がある日しか押せず**、新規に書けなかった。
//
// 「押せるようになった」で止めない。**保存できるところまで**見る。
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

// カルテの📅タブ（上から2番目）を開く
async function openCalendarTab(page) {
    await page.locator('.detail-subtab-btn[data-tab="visit-calendar"]').click();
    await page.waitForTimeout(1400);
}

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
    p.on('pageerror', (e) => { console.log('  ERR', e.message.slice(0, 130)); ng += 1; });

    await p.goto(APP);
    await p.waitForTimeout(3200);

    console.log('=== 1. その人のページの📅で、空いている日が押せるか');
    await openCustomer(p, CUST);
    await openCalendarTab(p);

    // 記録の無いマスを1つ選ぶ（点が出ていないもの）
    const emptyCell = p.locator('#personal-calendar-instance .calendar-day:not(.empty):not(.has-event)').first();
    check('空いている日のマスがある', await emptyCell.count() > 0);
    check('押せる見た目になっている',
        (await emptyCell.evaluate((el) => getComputedStyle(el).cursor)) === 'pointer');

    await emptyCell.click();
    await p.waitForTimeout(1400);
    const modalOpen = await p.locator('#record-modal.active').count();
    check('押すと予約の画面が開く', modalOpen > 0);

    console.log('\n=== 2. 相手が決まっているので、選び直す欄は出ないか');
    // その人のページから開いた以上、別の人の予約を書けてしまってはいけない
    check('対象顧客の欄が隠れている',
        await p.locator('#record-customer-select-group').evaluate((el) => el.style.display === 'none'));
    const pickedId = await p.locator('#input-record-customer-id').inputValue();
    const wantId = await p.evaluate((n) => (JSON.parse(localStorage.getItem('therapist_customers') || '[]')
        .find((c) => (c.name || '').includes(n)) || {}).id, CUST);
    check('その人が選ばれている', String(pickedId) === String(wantId), `${pickedId} / ${wantId}`);
    const dateVal = await p.locator('#input-date').inputValue();
    check('押した日が入っている', /^\d{4}-\d{2}-\d{2}$/.test(dateVal), dateVal);

    console.log('\n=== 3. 内容も金額も書かずに保存できるか（ISSUE-063 の本題）');
    await p.locator('#btn-submit-record').click();
    await p.waitForTimeout(1600);
    const toast = await p.locator('#toast-message').textContent().catch(() => '');
    console.log('   出た知らせ:', JSON.stringify((toast || '').trim()));
    check('「必須です」で弾かれない', !/必須/.test(toast || ''), toast || '');
    const saved = await p.evaluate((d) => {
        const list = JSON.parse(localStorage.getItem('therapist_customers') || '[]');
        return list.some((c) => (c.records || []).some((r) => r.date === d));
    }, dateVal);
    check('その日の予約が実際に残っている', saved);

    console.log('\n=== 4. 下にその月ぶんのカードが並ぶか');
    await p.locator('#btn-cancel-record').click().catch(() => {});
    await p.waitForTimeout(900);
    await openCalendarTab(p);
    const cards = p.locator('#cust-month-list .cust-month-card');
    const n = await cards.count();
    console.log('   カード数:', n);
    check('カードが並んでいる', n > 0);
    check('いま入れた予約のカードがある',
        await p.locator(`#cust-month-list .cust-month-card[data-date="${dateVal}"]`).count() > 0);
    check('内容未定の印が出ている',
        (await p.locator('#cust-month-list .cust-month-tag').count()) > 0);
    const cardText = await cards.first().textContent();
    console.log('   1枚目:', JSON.stringify(cardText.replace(/\s+/g, ' ').trim()));
    check('0円と嘘をつかない', !/^0円|\s0円/.test(cardText), cardText);

    console.log('\n=== 5. 日付を押すと、その日のカードが目立つか');
    const dayCell = p.locator('#personal-calendar-instance .calendar-day.has-event').first();
    await dayCell.click();
    await p.waitForTimeout(1200);
    check('どれかのカードが選ばれている',
        (await p.locator('#cust-month-list .cust-month-card.picked').count()) > 0);
    check('予約の画面は開かない（記録のある日）',
        (await p.locator('#record-modal.active').count()) === 0);

    console.log('\n=== 6. カードを押すとカルテへ行くか');
    await p.locator('#cust-month-list .cust-month-card').first().click();
    await p.waitForTimeout(1600);
    check('カルテのタブに変わった',
        await p.locator('.detail-subtab-btn[data-tab="visit-type"]')
            .evaluate((el) => el.classList.contains('active')));

    console.log('\n=== 7. 横にはみ出していないか（スマホ幅）');
    await openCalendarTab(p);
    const over = await p.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('はみ出していない', over <= 1, `${over}px`);

    // ------------------------------------------------------------------
    // 8. トップ📅の予約画面でも、日付だけで保存できるか（ISSUE-065）
    //
    // **予約を書く画面は2つある。** カルテ側の #record-modal と、
    // トップ📅の #booking-modal。ISSUE-063 で必須を外したのは前者だけで、
    // サロンが実際に使う後者は「施術メニューを入力してください」で弾いていた。
    // 直したつもりで、いちばん使う入口が直っていなかった。
    // ------------------------------------------------------------------
    console.log('\n=== 8. トップ📅の予約画面でも、日付だけで保存できるか');
    await p.goto(APP);
    await p.waitForTimeout(3200);
    // 記録は顧客ごとに並ぶので、「最後の1件」が新しいものとは限らない。
    // 先に id を控えておき、増えたものを id で拾う。
    const beforeIds = await p.evaluate(() => JSON.parse(localStorage.getItem('therapist_customers') || '[]')
        .flatMap((c) => (c.records || []).map((r) => String(r.id))));
    const before = beforeIds.length;

    await p.locator('#btn-view-calendar').click(); await p.waitForTimeout(1600);
    await p.locator('#btn-open-booking').click(); await p.waitForTimeout(1400);
    check('予約の画面が開く', (await p.locator('#booking-modal.active').count()) > 0);
    check('施術メニューの欄が空', (await p.locator('#inline-record-type').inputValue()) === '');
    check('金額の欄が空', (await p.locator('#inline-record-amount').inputValue()) === '');

    await p.locator('#btn-inline-submit-record').click();
    await p.waitForTimeout(1600);
    const toast2 = await p.locator('#toast-message').textContent().catch(() => '');
    console.log('   出た知らせ:', JSON.stringify((toast2 || '').trim()));
    check('「入力してください」で弾かれない',
        !/入力してください/.test(toast2 || ''), toast2 || '');
    const after = await p.evaluate(() => JSON.parse(localStorage.getItem('therapist_customers') || '[]')
        .reduce((n, c) => n + (c.records || []).length, 0));
    check('記録が1件増えている', after === before + 1, `${before} → ${after}`);
    const stored = await p.evaluate((known) => {
        const all = JSON.parse(localStorage.getItem('therapist_customers') || '[]')
            .flatMap((c) => c.records || []);
        const r = all.find((x) => !known.includes(String(x.id)));
        return r ? { type: r.type, amount: r.amount, date: r.date } : null;
    }, beforeIds);
    console.log('   入った中身:', JSON.stringify(stored));
    check('増えた1件を見つけられた', stored !== null);
    check('金額が 0 ではなく空のまま',
        stored && (stored.amount === '' || stored.amount === null),
        JSON.stringify(stored && stored.amount));
    check('施術メニューも空のまま', stored && String(stored.type || '') === '',
        JSON.stringify(stored && stored.type));

    // ------------------------------------------------------------------
    // 9. 予約画面にも「施術の区分」があり、選んだものが保存されるか（ISSUE-068）
    //
    // カレンダーや一覧にはアイコンで出るので、予約の時点で入れておけると
    // 何の日か一目で分かる。**選べるだけでなく、保存されるか**まで見る。
    // ------------------------------------------------------------------
    console.log('\n=== 9. 予約画面に「施術の区分」があり、保存されるか');
    await p.goto(APP); await p.waitForTimeout(3200);
    const ids9 = await p.evaluate(() => JSON.parse(localStorage.getItem('therapist_customers') || '[]')
        .flatMap((c) => (c.records || []).map((r) => String(r.id))));

    await p.locator('#btn-view-calendar').click(); await p.waitForTimeout(1600);
    await p.locator('#btn-open-booking').click(); await p.waitForTimeout(1400);

    // 施術内容はひと並びにまとまり、**ふだんは畳んである**（ISSUE-085）。
    // 開かないと押せないので、まず要約の行を押す
    check('施術内容が畳まれている',
        await p.evaluate(() => !document.getElementById('inline-menu-fold').open));
    await p.locator('#inline-menu-fold > summary').click();
    await p.waitForTimeout(400);

    const catBtns = p.locator('#inline-service-categories .service-cat-btn');
    const catN = await catBtns.count();
    console.log('   施術内容の数:', catN);
    check('施術内容が出ている', catN >= 10, `${catN}個`);
    // **見るのは data-menu。** data-cat（書く欄）は重なってよい
    // （初診・再診・月set はどれも 🫶施術 を指す）
    const inlineKeys = await catBtns.evaluateAll((els) => els.map((e) => e.dataset.menu));
    console.log('   施術内容の key:', JSON.stringify(inlineKeys));
    check('中身が入っている', inlineKeys.every(Boolean));
    check('重複していない', new Set(inlineKeys).size === inlineKeys.length);

    // 書く欄を持つものを2つ選ぶ（保存される区分を見たいので）
    await p.locator('#inline-service-categories [data-menu="m-repeat"]').click();
    await p.waitForTimeout(300);
    await p.locator('#inline-service-categories [data-menu="m-color"]').click();
    await p.waitForTimeout(300);
    check('押したものが選ばれた状態になる',
        (await p.locator('#inline-service-categories .service-cat-btn.selected').count()) === 2);
    // 押したものが、そのまま合計になる
    const sum = await p.locator('#inline-menu-sum').textContent();
    console.log('   要約の合計:', JSON.stringify(sum.trim()));
    check('押したものが合計になる', sum.includes('15,000'), sum.trim());

    await p.locator('#btn-inline-submit-record').click();
    await p.waitForTimeout(1800);
    const rec9 = await p.evaluate((known) => {
        const all = JSON.parse(localStorage.getItem('therapist_customers') || '[]')
            .flatMap((c) => c.records || []);
        const r = all.find((x) => !known.includes(String(x.id)));
        return r ? { categories: r.categories, menu: r.menu, amount: r.amount } : null;
    }, ids9);
    console.log('   入った区分:', JSON.stringify(rec9));
    check('選んだ区分が保存されている',
        rec9 && Array.isArray(rec9.categories) && rec9.categories.length === 2,
        JSON.stringify(rec9 && rec9.categories));
    check('押した施術内容も保存されている',
        rec9 && Array.isArray(rec9.menu) && rec9.menu.length === 2,
        JSON.stringify(rec9 && rec9.menu));
    check('合計が金額に入っている', rec9 && String(rec9.amount) === '15000',
        String(rec9 && rec9.amount));

    console.log('\n=== 10. 次に開いたとき、前回の選択が残っていないか');
    await p.locator('#btn-open-booking').click(); await p.waitForTimeout(1400);
    check('また畳まれている',
        await p.evaluate(() => !document.getElementById('inline-menu-fold').open));
    await p.locator('#inline-menu-fold > summary').click(); await p.waitForTimeout(400);
    check('選択が持ち越されない',
        (await p.locator('#inline-service-categories .service-cat-btn.selected').count()) === 0);

    console.log('\n=== 11. 予約ボタンの帯が、黒く浮いていないか（ISSUE-068）');
    await p.locator('#btn-close-booking').click().catch(() => {});
    await p.waitForTimeout(800);
    const tone = await p.evaluate(() => {
        const row = document.querySelector('.booking-open-row');
        const box = document.querySelector('.calendar-view-section');
        const cs = (el) => getComputedStyle(el);
        // 実際に塗られている色を、画面と同じ形（0〜255）で拾う
        const nums = (s) => (s.match(/[\d.]+/g) || []).map(Number);
        return {
            rowColor: cs(row).backgroundColor, boxColor: cs(box).backgroundColor,
            rowImage: cs(row).backgroundImage.slice(0, 60),
            rowNums: nums(cs(row).backgroundColor), boxNums: nums(cs(box).backgroundColor)
        };
    });
    console.log('   帯:', tone.rowColor, '／ 枠:', tone.boxColor);
    console.log('   重ねている膜:', tone.rowImage);
    check('帯に色が付いている（透明のままでない）',
        !/rgba\(0, 0, 0, 0\)|transparent/.test(tone.rowColor), tone.rowColor);
    check('周りの枠と同じ色を使っている',
        tone.rowNums.slice(0, 3).join(',') === tone.boxNums.slice(0, 3).join(','),
        `${tone.rowColor} / ${tone.boxColor}`);
    check('透けを止める膜が重なっている', /gradient/.test(tone.rowImage), tone.rowImage);

    console.log(ng === 0 ? '\n  ぜんぶ通りました' : `\n  ❌ ${ng} 件だめでした`);
    await b.close();
    process.exit(ng === 0 ? 0 : 1);
})();
