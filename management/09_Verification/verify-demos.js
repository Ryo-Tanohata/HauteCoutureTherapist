// デモが、いまのアプリと合っているか（ISSUE-069）。
//
// デモは**説明ではなく実際の画面を動かす**ので、アプリを直すと簡単に壊れる。
// 押す相手が消えていれば黙って飛ばされ、**「短くなっただけ」に見えて気づけない。**
//
// 見るのは3つ。
//   ① 最後まで流れきるか（途中で止まらないか）
//   ② 説明の数が、宣言している目安と合っているか
//   ③ **この数日で入った機能に、実際に触れているか**
// ③が肝心。①②だけなら、古いままのデモでも通ってしまう。
const { chromium } = require('playwright');
const APP = 'http://127.0.0.1:8900/product/index.html';
const ok = (c) => (c ? '✅' : '❌');
let ng = 0;
const check = (l, c, e = '') => { if (!c) ng += 1; console.log(`  ${l}:`, ok(c), e); };

// 説明の受け皿。**1本ごとに作り直してはいけない。**
// exposeFunction は同じ名前で2度目が失敗するので、最初に渡した受け皿に
// ずっと入り続ける。2本目が空になり、判定にならなかった。
const saidBuf = [];

// デモは1本1〜2分かかる。早送りの仕組みに乗せて、最後まで流す。
async function runDemo(page, btnId, { maxMs = 240000 } = {}) {
    saidBuf.length = 0;
    await page.exposeFunction('__demoSaid', (t) => { saidBuf.push(t); }).catch(() => {});
    await page.evaluate(() => {
        const bar = document.getElementById('tour-bar-caption');
        if (!bar || bar.dataset.watched) return;
        bar.dataset.watched = '1';
        new MutationObserver(() => {
            const t = (bar.textContent || '').trim();
            if (t) window.__demoSaid(t);
        }).observe(bar, { childList: true, characterData: true, subtree: true });
    });

    await page.locator(`#${btnId}`).click();
    await page.waitForTimeout(1200);

    // 最後まで一気に送る（早送りのつまみを終端へ）
    const started = Date.now();
    while (Date.now() - started < maxMs) {
        const done = await page.evaluate(() => !document.body.classList.contains('demo-active'));
        if (done) break;
        // 次へを連打して進める
        const next = page.locator('#tour-btn-next');
        if (await next.count() && await next.isVisible()) {
            await next.click({ timeout: 2000 }).catch(() => {});
        }
        await page.waitForTimeout(350);
    }
    const total = await page.evaluate(() => {
        const l = document.getElementById('tour-step-label');
        return l ? l.textContent.trim() : '';
    });
    const stillRunning = await page.evaluate(() => document.body.classList.contains('demo-active'));
    return { said: [...saidBuf], total, stillRunning };
}

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));

    await p.goto(APP);
    await p.waitForTimeout(3400);

    console.log('=== 1. デモの入口が、一覧にそろっているか');
    await p.locator('#btn-demo-guide').click();
    await p.waitForTimeout(1400);
    const btns = await p.locator('.demo-index-btn').evaluateAll((els) => els.map((e) => e.id));
    console.log('   一覧:', JSON.stringify(btns));
    check('デモが6本ある', btns.filter(Boolean).length >= 6, `${btns.length}本`);

    console.log('\n=== 2. 予約のデモが、新しい作りに触れているか（ISSUE-063〜068）');
    const r = await runDemo(p, 'btn-start-booking-tour-index');
    const text = r.said.join(' ／ ');
    console.log('   進行:', r.total, r.stillRunning ? '（まだ動いている）' : '（終わった）');
    check('最後まで流れきった', !r.stillRunning, r.total);
    check('説明が十分な数出た', r.said.length >= 12, `${r.said.length}個`);

    // ここが本題。触れていなければ、デモが古いということ。
    const musts = [
        ['空のままで保存できる（ISSUE-063）', /空のままで保存/],
        ['その日すでに入っている予約（ISSUE-066）', /すでに入っている予約/],
        ['時間の重なりの印（ISSUE-067）', /印が出/],
        ['施術内容（ISSUE-068 → 085）', /施術内容/],
        ['その人のページからの予約（ISSUE-063）', /その人のページからも/],
        ['月ぶんの一覧（ISSUE-063）', /その月の予定/]
    ];
    musts.forEach(([label, re]) => check(label, re.test(text)));

    console.log('\n=== 3. カラーと星のデモが、⚠️の切り分けに触れているか（ISSUE-060）');
    await p.goto(APP); await p.waitForTimeout(3400);
    await p.locator('#btn-demo-guide').click(); await p.waitForTimeout(1200);
    const r2 = await runDemo(p, 'btn-start-star-tour');
    const text2 = r2.said.join(' ／ ');
    console.log('   進行:', r2.total, r2.stillRunning ? '（まだ動いている）' : '（終わった）');
    check('最後まで流れきった', !r2.stillRunning, r2.total);
    console.log('   出た説明:', JSON.stringify(r2.said));
    check('赤い枠に入るものを説明している', /病歴/.test(text2) && /薬/.test(text2), text2.slice(0, 120));
    check('メモは分けて出ることを説明している', /カルテのメモ|分けて出/.test(text2));

    console.log('\n=== 3.5 名前から開く形に、デモが追いついているか（ISSUE-077）');
    // 👤 タブを外したとき、デモは黙って飛ばされる。文面で見るしかない
    await p.goto(APP); await p.waitForTimeout(3400);
    await p.locator('#btn-demo-guide').click(); await p.waitForTimeout(1200);
    const r3 = await runDemo(p, 'btn-start-intake-tour');
    const text3 = r3.said.join(' ／ ');
    console.log('   進行:', r3.total, r3.stillRunning ? '（まだ動いている）' : '（終わった）');
    check('最後まで流れきった', !r3.stillRunning, r3.total);
    check('名前を押して開くことに触れている', /名前を押すと/.test(text3), text3.slice(0, 160));
    check('「情報タブ」とは言っていない', !/「情報」タブ/.test(text3));

    console.log('\n=== 4. デモの途中でエラーが出ていないか');
    errors.forEach((e) => console.log('   ERR', e.slice(0, 130)));
    check('エラーが出ていない', errors.length === 0, `${errors.length}件`);

    console.log('\n=== 5. デモで入れた予約が、片付いているか');
    // 「最後に消えます」と一覧に書いてある以上、残っていてはいけない
    const leftovers = await p.evaluate(() => JSON.parse(localStorage.getItem('therapist_customers') || '[]')
        .flatMap((c) => (c.records || []))
        .filter((r) => /肩と首の張り。午前中の予約希望。/.test(r.clientComplaint || '')).length);
    check('デモの予約が残っていない', leftovers === 0, `${leftovers}件`);

    console.log(ng === 0 ? '\n  ぜんぶ通りました' : `\n  ❌ ${ng} 件だめでした`);
    await b.close();
    process.exit(ng === 0 ? 0 : 1);
})();
