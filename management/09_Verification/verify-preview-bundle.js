// 1ファイルに束ねたプレビューが、本物と同じに動くか（ISSUE-074）。
//
// **束ねたものは別物**。import を落として連結しているので、
// 名前がぶつかれば丸ごと動かず、外への読み込みが残っていれば
// Artifact 側の守りに弾かれる。**開けたかどうかでは足りない。**
//
// 「起動したか」で止めず、**この数日で入れたものが出ているか**まで見る。
const { chromium } = require('playwright');
const path = require('path');
const ok = (c) => (c ? '✅' : '❌');
let ng = 0;
const check = (l, c, e = '') => { if (!c) ng += 1; console.log(`  ${l}:`, ok(c), e); };

const FILE = process.argv[2];
if (!FILE) { console.log('使い方: node verify-preview-bundle.js <local-test.html のパス>'); process.exit(2); }

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
    const errors = [];
    const outside = [];
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('requestfailed', (r) => outside.push(r.url()));
    p.on('request', (r) => { if (/^https?:/.test(r.url())) outside.push(r.url()); });

    await p.goto('file://' + path.resolve(FILE));
    await p.waitForTimeout(3600);

    console.log('=== 1. 起動できたか');
    errors.forEach((e) => console.log('   ERR', e.slice(0, 160)));
    check('エラーが出ていない', errors.length === 0, `${errors.length}件`);
    check('顧客の一覧が出ている', (await p.locator('.customer-card-grid-item').count()) > 0,
        `${await p.locator('.customer-card-grid-item').count()}人`);

    console.log('\n=== 2. 外へ取りに行っていないか');
    // Artifact は外のホストを一切許さない。残っていればその場で弾かれる
    const uniq = [...new Set(outside.map((u) => (u.split('/')[2] || u)))];
    uniq.forEach((h) => console.log('   外:', h));
    check('外部の読み込みが無い', uniq.length === 0, uniq.join(', ') || '（無し）');

    console.log('\n=== 3. この数日で入れたものが、束ねた側にも入っているか');
    // 束ね直しを忘れると、**古いアプリのまま静かに配られる**
    check('💬 が出ていない（ISSUE-071）', (await p.locator('#fc-fab').count()) === 0);

    await p.evaluate(() => {
        const card = [...document.querySelectorAll('.customer-card-grid-item')]
            .find((el) => el.textContent.includes('山田'));
        if (card) card.click();
    });
    await p.waitForTimeout(1600);

    check('🕐 のタブが無い（ISSUE-073）',
        (await p.locator('.detail-subtab-btn[data-tab="visit-count"]').count()) === 0);
    check('タブは4つ（ISSUE-073, 077）', (await p.locator('.detail-subtab-btn').count()) === 4,
        `${await p.locator('.detail-subtab-btn').count()}個`);
    check('最初に出るのがカルテ（ISSUE-073）',
        await p.locator('.detail-subtab-btn[data-tab="visit-type"]').evaluate((el) => el.classList.contains('active')));

    const stats = await p.locator('.visit-stats').textContent().catch(() => '');
    console.log('   見出し:', JSON.stringify(String(stats).replace(/\s+/g, ' ').trim()));
    check('回数とペースの見出しが出ている（ISSUE-073）',
        /通算施術回数/.test(stats) && /平均施術ペース/.test(stats));

    const first = p.locator('.history-item').first();
    check('第N回の帯が出ている（ISSUE-073）',
        (await first.locator('.visit-no').textContent()).includes('第'));
    check('最初はたたまれている（ISSUE-070）',
        !(await first.locator('.history-item-body').evaluate((el) => el.getBoundingClientRect().height > 0)));
    await first.locator('.history-summary').click();
    await p.waitForTimeout(400);
    check('押すと開く（ISSUE-070）',
        await first.locator('.history-item-body').evaluate((el) => el.getBoundingClientRect().height > 0));
    check('開いた中に処方とメモが出る（ISSUE-072）',
        (await first.locator('.history-item-body').textContent()).includes('処方')
        && (await first.locator('.history-item-body').textContent()).includes('メモ'));

    // 書いたものだけ出す（ISSUE-082）。見本の記録は4項目とも埋まっているので、
    // ここで見えるのは「未記入」の行が出ないことだけ
    const body = await first.locator('.history-item-body').textContent();
    check('「未記入」の行が出ていない（ISSUE-082）',
        !/(選んだ色|訴え|処方|メモ):\s*未記入/.test(body));

    // 下ごしらえは既定で止めてある（ISSUE-083）。**束ね忘れると、ここで出てしまう**
    check('body に prep-hidden が付いている（ISSUE-083）',
        await p.evaluate(() => document.body.classList.contains('prep-hidden')));

    // 施術内容がひと並びになっているか（ISSUE-085）。
    // **束ねる一覧に入れ忘れると、押しても何も起きない**
    // ここまでで記入画面が開いている。**畳みを外すだけでは画面が戻らない**ので、
    // 読み込み直してから、その人のカレンダーへ入り直す
    await p.goto('file://' + path.resolve(FILE));
    await p.waitForTimeout(3000);
    await p.evaluate(() => {
        const c = [...document.querySelectorAll('.customer-card-grid-item')][0];
        if (c) c.click();
    });
    await p.waitForTimeout(1500);
    await p.locator('.detail-subtab-btn[data-tab="visit-calendar"]').click();
    await p.waitForTimeout(1200);
    await p.locator('#personal-calendar-instance .calendar-day:not(.empty):not(.has-event)').first().click();
    await p.waitForTimeout(1400);
    check('施術内容が畳まれている（ISSUE-085）',
        await p.evaluate(() => {
            const el = document.getElementById('record-menu-fold');
            return Boolean(el) && !el.open;
        }));
    await p.locator('#record-menu-fold > summary').click();
    await p.waitForTimeout(400);
    const menuN = await p.locator('#record-service-categories .service-cat-btn').count();
    check('施術内容が16個出ている（ISSUE-085）', menuN >= 16, `${menuN}個`);
    await p.locator('#record-service-categories [data-menu="m-repeat"]').click();
    await p.waitForTimeout(400);
    const bundleTotal = (await p.locator('#record-menu-total').textContent()).trim();
    console.log('   再診を押した合計:', JSON.stringify(bundleTotal));
    check('押すと合計が出る（ISSUE-085）', bundleTotal.includes('15,000'), bundleTotal);

    // 記入画面を開いたままだと、次の節でタブに手が届かない
    await p.locator('#record-modal .btn-close, #btn-cancel-record').first().click();
    await p.waitForTimeout(800);
    check('記入画面を閉じられた', (await p.locator('#record-modal.active').count()) === 0);

    console.log('\n=== 4. 予約が、日付だけで取れるか（ISSUE-063）');
    await p.locator('#btn-view-calendar').click();
    await p.waitForTimeout(1400);
    const day = p.locator('#calendar-grid-body .calendar-day:not(.empty)').nth(20);
    check('カレンダーのマスが出ている', (await day.count()) > 0);
    await day.click();
    await p.waitForTimeout(1400);
    // 日を押すと、その日の一覧が開く（トップの📅は従来どおり／ISSUE-063 の申し送り）
    const dayOpen = await p.locator('#calendar-day-details').evaluate((el) => el.style.display !== 'none');
    check('日を押すとその日の一覧が開く', dayOpen);
    const addBtn = p.locator('#calendar-day-details button, #calendar-visits-container button').first();
    check('その日から予約を足せる', (await addBtn.count()) > 0);

    console.log('\n=== 5. 星詠みが、埋め込んだ文章で出るか');
    await p.locator('#btn-view-advice').click();
    await p.waitForTimeout(2600);
    const advice = await p.locator('#advice-view-container').textContent();
    check('星詠みの本文が出ている', advice.replace(/\s+/g, '').length > 200, `${advice.replace(/\s+/g, '').length}字`);

    console.log('\n=== 6. 通しでエラーが増えていないか');
    errors.slice(0, 5).forEach((e) => console.log('   ERR', e.slice(0, 160)));
    check('最後までエラーが出ていない', errors.length === 0, `${errors.length}件`);

    console.log(ng === 0 ? '\n  ぜんぶ通りました' : `\n  ❌ ${ng} 件だめでした`);
    await b.close();
    process.exit(ng === 0 ? 0 : 1);
})();
