// 「下ごしらえ」を止めた件（ISSUE-083）。💬（ISSUE-071）と同じ形にしてある。
//
// **「消した」ではなく「止めた」。** だから見るのは2方向ある。
//   ① 使わない設定で、本当に止まっているか（画面に出ない・ネットワークへ出ない）
//   ② 使う設定に戻したら、ちゃんと戻るか
//
// ②を見ないと、「止めた」つもりが「壊した」になっていても気づけない。
const { chromium } = require('playwright');
const APP = 'http://127.0.0.1:8900/product/index.html';
const ok = (c) => (c ? '✅' : '❌');
let ng = 0;
const check = (l, c, e = '') => { if (!c) ng += 1; console.log(`  ${l}:`, ok(c), e); };

const openSettings = async (p) => {
    await p.locator('#btn-view-color-settings').click();
    await p.waitForTimeout(1200);
    // 「🤖 AI の設定」は畳まれている
    const g = p.locator('#color-settings-view-container details.settings-group')
        .filter({ hasText: 'AI の設定' }).first();
    await g.evaluate((el) => { el.open = true; });
    await p.waitForTimeout(600);
    return g;
};
const shown = (p, sel) => p.locator(sel).evaluate((el) => el.checkVisibility()).catch(() => false);

// デモは1本1〜2分かかる。verify-demos と同じやり方で最後まで送る。
const said = [];
async function runDemo(page, btnId, openerId, { maxMs = 200000 } = {}) {
    said.length = 0;
    await page.exposeFunction('__said', (t) => { said.push(t); }).catch(() => {});
    await page.locator(`#${openerId}`).click();
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
        const bar = document.getElementById('tour-bar-caption');
        if (!bar || bar.dataset.watched) return;
        bar.dataset.watched = '1';
        new MutationObserver(() => {
            const t = (bar.textContent || '').trim();
            if (t) window.__said(t);
        }).observe(bar, { childList: true, characterData: true, subtree: true });
    });
    await page.locator(`#${btnId}`).click();
    await page.waitForTimeout(1200);
    const started = Date.now();
    while (Date.now() - started < maxMs) {
        if (await page.evaluate(() => !document.body.classList.contains('demo-active'))) break;
        const next = page.locator('#tour-btn-next');
        if (await next.count() && await next.isVisible()) await next.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(350);
    }
    return {
        said: [...said],
        total: await page.evaluate(() => (document.getElementById('tour-step-label') || {}).textContent || ''),
        running: await page.evaluate(() => document.body.classList.contains('demo-active')),
    };
}

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => { console.log('  ERR', e.message.slice(0, 130)); ng += 1; });

    // **ネットワークへ出ていないかを見る。** 隠すだけとの違いはここ
    const hits = [];
    p.on('request', (r) => {
        const u = r.url();
        // googleapis.com だけだと **Google Fonts まで拾う**。AIの入口を指すこと
        if (/\/api\/(ai-status|session-advice)|api\.anthropic\.com|generativelanguage\.googleapis\.com/.test(u)) hits.push(u);
    });

    console.log('\n=== 1. 既定は「使わない」か');
    await p.goto(APP);
    await p.waitForTimeout(3200);
    check('body に prep-hidden が付く',
        await p.evaluate(() => document.body.classList.contains('prep-hidden')));

    console.log('\n=== 2. カルテの記入画面から下りているか');
    await p.evaluate(() => {
        const c = [...document.querySelectorAll('.customer-card-grid-item')][0];
        if (c) c.click();
    });
    await p.waitForTimeout(1600);
    await p.locator('.detail-subtab-btn[data-tab="visit-calendar"]').click();
    await p.waitForTimeout(1400);
    await p.locator('#personal-calendar-instance .calendar-day:not(.empty):not(.has-event)').first().click();
    await p.waitForTimeout(1400);
    check('記入画面が開く', (await p.locator('#record-modal.active').count()) > 0);
    check('「下ごしらえを作る」が出ていない', !(await shown(p, '#btn-record-session-advice')));
    // **入れ物ごと消してはいない。** 戻せることが要
    check('入れ物は残っている', (await p.locator('#btn-record-session-advice').count()) > 0);
    check('「処方・メモに入れます」の案内も出ていない', !(await shown(p, '#record-session-advice .session-advice-hint')));
    await p.locator('#btn-cancel-record, #record-modal .btn-secondary').first().click().catch(() => {});
    await p.waitForTimeout(800);

    console.log('\n=== 3. 設定で、APIキーの欄まで下りているか');
    await p.goto(APP); await p.waitForTimeout(3200);
    await openSettings(p);
    check('🍳 の切り替えが出ている', (await p.locator('#prep-preference').count()) > 0);
    check('💬 の切り替えも残っている', (await p.locator('#chat-visibility-preference').count()) > 0);
    check('APIキーの欄が出ていない', !(await shown(p, '#color-settings-view-container .api-key-panel')));
    const badge = await p.locator('#ai-route-badge').textContent();
    console.log('   繋ぎ先の札:', JSON.stringify(badge.trim()));
    check('繋ぎ先を「調べています…」のままにしない', !badge.includes('調べています'), badge.trim());

    console.log('\n=== 4. ネットワークへ出ていないか（隠すだけとの違い）');
    console.log('   出た先:', JSON.stringify(hits));
    check('AIにも繋ぎ先の確認にも行っていない', hits.length === 0, hits.join(' / '));

    console.log('\n=== 5. 「使う」に戻したら、ちゃんと戻るか');
    // ここを見ないと、止めたつもりが壊れていても分からない
    await p.locator('#prep-preference [data-prep="on"]').click();
    await p.waitForTimeout(900);
    check('APIキーの欄が戻る', await shown(p, '#color-settings-view-container .api-key-panel'));
    await p.reload();
    await p.waitForTimeout(3200);
    check('読み込み直すと prep-hidden が外れる',
        !(await p.evaluate(() => document.body.classList.contains('prep-hidden'))));

    // **見張りが本当に効くのかを、ここで確かめる。**
    // 使う設定でも0件なら、④の「0件だから止まっている」は
    // 何も見ていないのと同じになる
    hits.length = 0;
    await p.locator('#btn-view-color-settings').click();
    await p.waitForTimeout(1500);
    console.log('   使う設定のとき、出た先:', JSON.stringify(hits));
    check('使う設定なら、繋ぎ先を調べに行く（④の見張りが効いている証し）',
        hits.length > 0, JSON.stringify(hits));
    await p.locator('#btn-view-list').click();
    await p.waitForTimeout(900);

    await p.evaluate(() => {
        const c = [...document.querySelectorAll('.customer-card-grid-item')][0];
        if (c) c.click();
    });
    await p.waitForTimeout(1600);
    await p.locator('.detail-subtab-btn[data-tab="visit-calendar"]').click();
    await p.waitForTimeout(1400);
    await p.locator('#personal-calendar-instance .calendar-day:not(.empty):not(.has-event)').first().click();
    await p.waitForTimeout(1400);
    check('「下ごしらえを作る」が戻る', await shown(p, '#btn-record-session-advice'));
    const label = await p.locator('#btn-record-session-advice').textContent();
    check('押せる状態になっている',
        !(await p.locator('#btn-record-session-advice').isDisabled()), label.trim());

    console.log('\n=== 6. 案内（デモ）が、見えないボタンを説明していないか');
    // ボタンは**隠してあるだけで DOM には残る**。`if (el)` は素通りするので、
    // 使わない設定でも案内だけが流れてしまう恐れがある。
    // **手順5で「使う」に戻したままなので、ここで戻しておく。**
    // 同じブラウザのままだと設定が残り、使う設定のまま試して通ってしまう
    await p.evaluate(() => {
        localStorage.setItem('therapist_prep_enabled', 'off');
        localStorage.setItem('therapist_chat_enabled', 'off');
    });
    await p.goto(APP); await p.waitForTimeout(3200);
    check('使わない設定に戻っている',
        await p.evaluate(() => document.body.classList.contains('prep-hidden')));
    const chart = await runDemo(p, 'btn-start-chart-tour', 'btn-demo-guide');
    console.log('   カルテのデモ:', chart.total, '／', chart.said.length, '手順');
    check('デモが最後まで流れた', chart.said.length > 0 && !chart.running,
        `${chart.said.length}手順 / まだ動いている=${chart.running}`);
    const words = chart.said.join(' / ');
    check('「下ごしらえ」を案内していない', !words.includes('下ごしらえ'),
        chart.said.filter((t) => t.includes('下ごしらえ')).join(' / '));
    check('隠れた処方欄も案内していない', !words.includes('処方欄'),
        chart.said.filter((t) => t.includes('処方欄')).join(' / '));

    console.log('\n=== 6.5 キーのデモは、どうすれば出るかを伝えているか');
    await p.goto(APP); await p.waitForTimeout(3200);
    const keyTour = await runDemo(p, 'btn-start-apikey-tour-index', 'btn-demo-guide');
    console.log('   キーのデモ:', JSON.stringify(keyTour.said.slice(0, 3)));
    check('キーのデモも止まらずに終わる', keyTour.said.length > 0 && !keyTour.running);
    check('「畳んである」と伝えている',
        keyTour.said.join(' / ').includes('畳んであります'), keyTour.said.join(' / ').slice(0, 160));

    console.log('\n=== 7. 💬 だけ使う場合、キーの欄は残るか');
    // **キーを使うのは下ごしらえだけではない。** チャットも同じキーを読む。
    // 下ごしらえだけを見て畳むと、チャットを使う人がキーを入れられなくなる
    await p.goto(APP); await p.waitForTimeout(3200);
    await openSettings(p);
    await p.locator('#prep-preference [data-prep="off"]').click();
    await p.waitForTimeout(700);
    await p.locator('#chat-visibility-preference [data-chat="on"]').click();
    await p.waitForTimeout(900);
    check('💬だけ使う設定でも、キーの欄は出る',
        await shown(p, '#color-settings-view-container .api-key-panel'));

    console.log(ng === 0 ? '\n  ぜんぶ通りました' : `\n  ❌ ${ng} 件だめでした`);
    await b.close();
    process.exit(ng === 0 ? 0 : 1);
})();
