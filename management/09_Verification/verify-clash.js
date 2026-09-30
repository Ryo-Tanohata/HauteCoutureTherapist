// 予約の時間が重なったとき、気づけるか（ISSUE-066）。
//
// **止めることが目的ではない。** ご家族の同席や見学など、わざと重ねることがある。
// 見たいのは3つ。
//   ① 書く前に、その日の予定が見えるか
//   ② 同じ時間を選んだら、その行が目立つか
//   ③ 保存のとき確かめが出て、**「このまま追加する」で通るか**
// ③で止まってしまうと、いまより使いにくくなる。
const { chromium } = require('playwright');
const APP = 'http://127.0.0.1:8900/product/index.html';
const ok = (c) => (c ? '✅' : '❌');
let ng = 0;
const check = (l, c, e = '') => { if (!c) ng += 1; console.log(`  ${l}:`, ok(c), e); };

// 同じ日・同じ時間に、既存の予約を1件わざと置く
async function seed(page, dateStr, time) {
    await page.evaluate(({ d, t }) => {
        const list = JSON.parse(localStorage.getItem('therapist_customers') || '[]');
        const c = list[0];
        c.records = c.records || [];
        c.records.push({
            id: 'clash-seed', date: d, time: t, type: '先に入っている施術', amount: 8000,
            colors: [], categories: [], photos: [], kartes: {}
        });
        localStorage.setItem('therapist_customers', JSON.stringify(list));
    }, { d: dateStr, t: time });
}

const countRecords = (page) => page.evaluate(() =>
    JSON.parse(localStorage.getItem('therapist_customers') || '[]')
        .reduce((n, c) => n + (c.records || []).length, 0));

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
    p.on('pageerror', (e) => { console.log('  ERR', e.message.slice(0, 130)); ng += 1; });

    await p.goto(APP);
    await p.waitForTimeout(3200);

    // 今日の日付に置く。予約画面は既定で今日が選ばれる。
    const today = await p.evaluate(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    await seed(p, today, '10:00');
    await p.reload();
    await p.waitForTimeout(3200);

    console.log('=== 1. 書く前に、その日の予定が見えるか');
    await p.locator('#btn-view-calendar').click(); await p.waitForTimeout(1600);
    await p.locator('#btn-open-booking').click(); await p.waitForTimeout(1400);
    const list = p.locator('#booking-day-list');
    check('その日の一覧が出ている', await list.isVisible());
    const listText = (await list.textContent()).replace(/\s+/g, ' ').trim();
    console.log('   一覧:', JSON.stringify(listText));
    check('件数が書いてある', /すでに \d+ 件/.test(listText), listText);
    check('先に入っている予約が載っている', /先に入っている施術/.test(listText));
    check('時間が出ている', /10:00/.test(listText));

    console.log('\n=== 2. 同じ時間を選ぶと、その行が目立つか');
    await p.locator('#inline-record-time').selectOption('10:00').catch(async () => {
        // 選択肢の作りが違えば値で入れる
        await p.locator('#inline-record-time').evaluate((el) => {
            el.value = '10:00'; el.dispatchEvent(new Event('change', { bubbles: true }));
        });
    });
    await p.waitForTimeout(700);
    check('重なった行に印が付く',
        (await p.locator('#booking-day-list .booking-day-row.clash').count()) > 0);

    console.log('\n=== 3. 別の時間なら、印は付かないか');
    await p.locator('#inline-record-time').evaluate((el) => {
        el.value = '15:00'; el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await p.waitForTimeout(700);
    check('印が消える',
        (await p.locator('#booking-day-list .booking-day-row.clash').count()) === 0);

    console.log('\n=== 4. 重ならない時間なら、確かめずにそのまま保存されるか');
    const before = await countRecords(p);
    await p.locator('#btn-inline-submit-record').click();
    await p.waitForTimeout(1500);
    check('確かめは出ない', (await p.locator('#confirm-modal.active').count()) === 0);
    check('保存されている', (await countRecords(p)) === before + 1, `${before} → ${await countRecords(p)}`);

    console.log('\n=== 5. 同じ時間だと、確かめが出るか');
    await p.locator('#btn-open-booking').click(); await p.waitForTimeout(1400);
    await p.locator('#inline-record-time').evaluate((el) => {
        el.value = '10:00'; el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await p.waitForTimeout(500);
    const before2 = await countRecords(p);
    await p.locator('#btn-inline-submit-record').click();
    await p.waitForTimeout(1500);
    const confirmShown = (await p.locator('#confirm-modal.active').count()) > 0;
    check('確かめが出る', confirmShown);
    if (confirmShown) {
        const msg = (await p.locator('#confirm-modal-message').textContent()).replace(/\s+/g, ' ').trim();
        console.log('   文面:', JSON.stringify(msg));
        check('誰と重なるかが書いてある', /先に入っている施術/.test(msg), msg);
        check('時間が書いてある', /10:00/.test(msg));
    }
    check('まだ保存されていない', (await countRecords(p)) === before2,
        `${before2} → ${await countRecords(p)}`);

    console.log('\n=== 6. 「このまま追加する」で通るか（止めてしまわないこと）');
    // わざと重ねることがある以上、ここで通らないと使いものにならない
    await p.locator('#btn-submit-confirm').click();
    await p.waitForTimeout(1800);
    check('保存された', (await countRecords(p)) === before2 + 1,
        `${before2} → ${await countRecords(p)}`);

    console.log('\n=== 7. カルテ側の記録画面にも入っているか（片方だけにしない）');
    // ISSUE-060・065 と同じ取りこぼしを繰り返さないための確認
    await p.goto(APP); await p.waitForTimeout(3200);
    await seed(p, today, '11:00');
    await p.reload(); await p.waitForTimeout(3200);
    await p.locator('#btn-view-list').click(); await p.waitForTimeout(900);
    await p.locator('.customer-card-grid-item').first().click(); await p.waitForTimeout(1600);
    await p.locator('.detail-subtab-btn[data-tab="visit-calendar"]').click(); await p.waitForTimeout(1500);
    const emptyCell = p.locator('#personal-calendar-instance .calendar-day:not(.empty):not(.has-event)').first();
    await emptyCell.click(); await p.waitForTimeout(1400);
    // 日付を今日に、時間を 11:00 にそろえる
    await p.locator('#input-date').evaluate((el, d) => {
        el.value = d; el.dispatchEvent(new Event('change', { bubbles: true }));
    }, today);
    await p.locator('#input-time').evaluate((el) => {
        el.value = '11:00'; el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await p.waitForTimeout(500);
    const before3 = await countRecords(p);
    await p.locator('#btn-submit-record').click();
    await p.waitForTimeout(1600);
    check('カルテ側でも確かめが出る', (await p.locator('#confirm-modal.active').count()) > 0);
    check('まだ保存されていない', (await countRecords(p)) === before3);
    await p.locator('#btn-submit-confirm').click();
    await p.waitForTimeout(1800);
    check('「このまま追加する」で保存される', (await countRecords(p)) === before3 + 1,
        `${before3} → ${await countRecords(p)}`);

    // ------------------------------------------------------------------
    // 8. 時間の欄のすぐそばに、赤い警告が出るか（ISSUE-067）
    //
    // 上の一覧で色を変えるだけでは、**時間を選ぶ場所から遠くて気づけない**。
    // 選んでいるその場で言えているかを見る。
    // ------------------------------------------------------------------
    // ------------------------------------------------------------------
    // 8〜10. 時間の「選択肢の中」に、埋まっていることが出るか（ISSUE-067）
    //
    // 上の一覧で色を変えるだけでは、時間を選ぶ場所から遠くて気づけない。
    // 欄の外に警告の枠を置くと場所を取る。**選択肢の中に書く**ことにした。
    // 選ぶ前から埋まりが見えるかを確かめる。
    // ------------------------------------------------------------------
    console.log('\n=== 8. 時間の選択肢に、埋まっていることが出るか（トップ📅）');
    await p.goto(APP); await p.waitForTimeout(3200);
    await seed(p, today, '13:00');
    await p.reload(); await p.waitForTimeout(3200);
    await p.locator('#btn-view-calendar').click(); await p.waitForTimeout(1600);
    await p.locator('#btn-open-booking').click(); await p.waitForTimeout(1400);

    const opt13 = await p.locator('#inline-record-time option[value="13:00"]').textContent();
    console.log('   13:00 の選択肢:', JSON.stringify(opt13));
    check('埋まっている印が付く', /⚠️/.test(opt13), opt13);
    check('誰が入っているかが出る', /山田 花子/.test(opt13), opt13);
    check('元の時刻は残っている', /^13:00/.test(opt13), opt13);

    const opt17 = await p.locator('#inline-record-time option[value="17:00"]').textContent();
    console.log('   17:00 の選択肢:', JSON.stringify(opt17));
    check('空いている時間には何も付かない', opt17.trim() === '17:00', opt17);

    console.log('\n=== 9. その時間を選ぶと、欄そのものが赤くなるか');
    // 時間の欄は「詳細メモ」の畳みの中。**開いていないと色を測れない**
    // （畳んだままだと、色の移り変わりの途中の値が返る）
    await p.evaluate(() => {
        // **id で指す。** 「最初の details」は金額の畳みになった（ISSUE-080）
        const d = document.getElementById('inline-detail-fold');
        if (d) d.open = true;
    });
    await p.waitForTimeout(400);
    await p.locator('#inline-record-time').evaluate((el) => {
        el.value = '13:00'; el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    // 色は 0.3 秒かけて変わる。終わってから測る
    await p.waitForTimeout(1200);
    check('欄に印が付く',
        await p.locator('#inline-record-time').evaluate((el) => el.classList.contains('has-clash')));
    const border = await p.locator('#inline-record-time').evaluate((el) => getComputedStyle(el).borderTopColor);
    console.log('   枠の色:', border);
    check('赤で出ている', /255,\s*82,\s*82/.test(border), border);
    // 時間の欄は「詳細メモ」の畳みの中。畳んだままでも分かる必要がある
    check('畳んだままでも、見出しに重なりが出る',
        (await p.locator('#booking-day-list .booking-day-warn').count()) > 0);

    console.log('\n=== 10. 空いている時間に戻すと、印が消えるか');
    await p.locator('#inline-record-time').evaluate((el) => {
        el.value = '17:00'; el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await p.waitForTimeout(700);
    check('欄の印が消える',
        !(await p.locator('#inline-record-time').evaluate((el) => el.classList.contains('has-clash'))));
    // 付け直すたびに文字が積み重ならないこと
    const again = await p.locator('#inline-record-time option[value="13:00"]').textContent();
    check('印が二重に付かない', (again.match(/⚠️/g) || []).length === 1, again);

    console.log('\n=== 10b. カルテ側の記録画面でも同じか');
    await p.goto(APP); await p.waitForTimeout(3200);
    await seed(p, today, '14:00');
    await p.reload(); await p.waitForTimeout(3200);
    await p.locator('#btn-view-list').click(); await p.waitForTimeout(900);
    await p.locator('.customer-card-grid-item').first().click(); await p.waitForTimeout(1600);
    await p.locator('.detail-subtab-btn[data-tab="visit-calendar"]').click(); await p.waitForTimeout(1500);
    await p.locator('#personal-calendar-instance .calendar-day:not(.empty):not(.has-event)').first().click();
    await p.waitForTimeout(1400);
    await p.locator('#input-date').evaluate((el, d) => {
        el.value = d; el.dispatchEvent(new Event('change', { bubbles: true }));
    }, today);
    await p.waitForTimeout(700);
    const rOpt = await p.locator('#input-time option[value="14:00"]').textContent();
    console.log('   14:00 の選択肢:', JSON.stringify(rOpt));
    check('カルテ側でも印が付く', /⚠️/.test(rOpt), rOpt);

    console.log('\n=== 11. 既存の予約を開いたとき、自分自身と重なったことにならないか');
    // ここを外さないと、開くたびに必ず警告が出てしまう。
    // **他の予約が混ざると判定にならない**ので、まっさらにしてから1件だけ置く。
    await p.evaluate(() => localStorage.removeItem('therapist_customers'));
    await p.reload(); await p.waitForTimeout(3400);
    const onlyId = await p.evaluate((d) => {
        const list = JSON.parse(localStorage.getItem('therapist_customers') || '[]');
        list.forEach((c) => { c.records = []; });
        list[0].records = [{
            id: 'solo-1', date: d, time: '19:00', type: 'ひとりだけの予約', amount: 5000,
            colors: [], categories: [], photos: [], kartes: {}
        }];
        localStorage.setItem('therapist_customers', JSON.stringify(list));
        return list[0].id;
    }, today);
    await p.reload(); await p.waitForTimeout(3400);
    await p.locator('#btn-view-calendar').click(); await p.waitForTimeout(1600);
    await p.evaluate((d) => {
        const cell = [...document.querySelectorAll('#calendar-grid-body .calendar-day')]
            .find((el) => (el.title || el.textContent || '').includes(String(Number(d.slice(8)))));
        if (cell) cell.click();
    }, today);
    await p.waitForTimeout(1200);
    const editBtn = p.locator('.btn-cal-edit-rec').first();
    if (await editBtn.count()) {
        await editBtn.click();
        await p.waitForTimeout(1600);
        const own = await p.locator('#input-time option[value="19:00"]').textContent();
        console.log('   自分の時間の選択肢:', JSON.stringify(own));
        check('自分自身は埋まり扱いにならない', !/⚠️/.test(own), own);
        check('欄にも印が付かない',
            !(await p.locator('#input-time').evaluate((el) => el.classList.contains('has-clash'))));
    } else {
        console.log('   「変更」ボタンが見つからない: \u274c'); ng += 1;
    }

    console.log(ng === 0 ? '\n  ぜんぶ通りました' : `\n  ❌ ${ng} 件だめでした`);
    await b.close();
    process.exit(ng === 0 ? 0 : 1);
})();
