// 「この方のこと」を、名前から開く形にした（ISSUE-077）。
//
// 👤 のタブを外したので、**入口が名前しか無い**。
// そこが繋がっていないと、初診の情報へ二度と辿り着けなくなる。
//
// 見るのは4つ。
//   ① 👤 のタブが無く、名前から開けること
//   ② 開いた先に、初診の情報が**ちゃんと出ている**こと（消したのではない）
//   ③ **押すまでは読むだけ**。✏️ を押して初めて直せること
//   ④ ソウルカラーが、いつも名前の横に出ていること
// ①だけを見ると、**中身ごと消した実装でも通ってしまう。**
const { chromium } = require('playwright');
const APP = 'http://127.0.0.1:8900/product/index.html';
const ok = (c) => (c ? '✅' : '❌');
let ng = 0;
const check = (l, c, e = '') => { if (!c) ng += 1; console.log(`  ${l}:`, ok(c), e); };

const CUST = '山田 花子';

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
    p.on('pageerror', (e) => { console.log('  ERR', e.message.slice(0, 130)); ng += 1; });

    await p.goto(APP);
    await p.waitForTimeout(3200);
    await p.evaluate((n) => {
        const card = [...document.querySelectorAll('.customer-card-grid-item')]
            .find((el) => el.textContent.includes(n));
        if (card) card.click();
    }, CUST);
    await p.waitForTimeout(1600);

    console.log('=== 1. タブが4つになり、👤 が無いか');
    check('👤 のタブが無い', (await p.locator('.detail-subtab-btn[data-tab="personal-info"]').count()) === 0);
    check('タブは4つ', (await p.locator('.detail-subtab-btn').count()) === 4,
        `${await p.locator('.detail-subtab-btn').count()}個`);

    console.log('\n=== 2. ソウルカラーが、名前の横に出ているか');
    // 開かないと見えないのでは遅い。顔ぶれを思い出す手がかりのため
    const dots = await p.locator('#detail-name-colors .soul-dot').count();
    check('名前の横に色が出ている', dots > 0, `${dots}個`);
    check('カルテのタブでも出たまま', await p.locator('#detail-name-colors').isVisible());

    console.log('\n=== 3. 名前を押すと「この方のこと」が開くか');
    check('名前が押せるものになっている', (await p.locator('#detail-name-open').count()) > 0);
    await p.locator('#detail-name-open').click();
    await p.waitForTimeout(1000);

    const body = await p.locator('#tab-content-area').textContent();
    check('氏名が出ている', body.includes('氏名'));
    check('生年月日が出ている', body.includes('生年'), body.slice(0, 60));
    check('Soul Color の欄が出ている', body.includes('Soul Color'));
    check('初診の情報が出ている', /病歴|服用|既往/.test(body));
    check('開いた印が付いている',
        await p.locator('#detail-name-open').evaluate((el) => el.classList.contains('is-open')));

    console.log('\n=== 4. ソウルカラーの自動計算が、下りているか');
    // サロンのご指示で外したもの
    check('自動計算の畳みが無い', !body.includes('ソウルカラーの自動計算'));
    check('置き場も作られていない', (await p.locator('#soul-color-auto').count()) === 0);

    console.log('\n=== 5. 押すまでは、読むだけか');
    // ここが肝心。触れた瞬間に編集が始まると、読むつもりで直してしまう
    check('✏️ のボタンがある', (await p.locator('#btn-personal-edit').count()) > 0);
    const nameField = p.locator('.quick-edit-field[data-field="name"]').first();
    await nameField.click();
    await p.waitForTimeout(600);
    check('押しても入力欄にならない', (await nameField.locator('input').count()) === 0);

    console.log('\n=== 6. ✏️ を押すと直せるか');
    await p.locator('#btn-personal-edit').click();
    await p.waitForTimeout(800);
    check('押した状態になる',
        (await p.locator('#btn-personal-edit').getAttribute('aria-pressed')) === 'true');
    const nameField2 = p.locator('.quick-edit-field[data-field="name"]').first();
    await nameField2.click();
    await p.waitForTimeout(600);
    check('こんどは入力欄になる', (await nameField2.locator('input').count()) > 0);

    console.log('\n=== 7. 他のタブへ移ると、編集は解けるか');
    // 直せる状態のまま置き去りにすると、あとで触って直してしまう
    await p.locator('.detail-subtab-btn[data-tab="visit-type"]').click();
    await p.waitForTimeout(900);
    check('名前の印が外れている',
        !(await p.locator('#detail-name-open').evaluate((el) => el.classList.contains('is-open'))));
    await p.locator('#detail-name-open').click();
    await p.waitForTimeout(900);
    check('戻ったときは読むだけに戻っている',
        (await p.locator('#btn-personal-edit').getAttribute('aria-pressed')) === 'false');

    console.log('\n=== 8. 頭が2行に収まり、操作が名前の行にあるか（ISSUE-078）');
    // ✏️ を外して📦🗑️を名前の行へ寄せた。**縦が縮んでいなければ意味が無い**
    check('✏️（まとめて直す）が無い', (await p.locator('#btn-edit-customer').count()) === 0);
    check('📦 が名前の行にある',
        (await p.locator('.detail-name-row #btn-detail-archive').count()) > 0);
    check('🗑️ が名前の行にある',
        (await p.locator('.detail-name-row #btn-delete-customer').count()) > 0);
    check('✕ も名前の行にある',
        (await p.locator('.detail-name-row #btn-close-detail').count()) > 0);

    const head = await p.locator('.detail-view-header').evaluate((el) => el.getBoundingClientRect().height);
    console.log('   頭の高さ:', Math.round(head) + 'px');
    // 直す前は 128px（名前 / 札 / カナ / ボタンの帯）。実際に測った値
    check('頭が短くなっている（110px 未満）', head < 110, Math.round(head) + 'px');

    check('カナは、この方のことで直せる',
        (await p.locator('.quick-edit-field[data-field="kana"]').count()) > 0);

    console.log('\n=== 9. カルテへ戻れるか');
    // 入口が名前だけなので、戻れなくなっていないかも見る
    await p.locator('.detail-subtab-btn[data-tab="visit-type"]').click();
    await p.waitForTimeout(900);
    check('カルテが出る', (await p.locator('.visit-stats').count()) > 0);

    console.log(ng === 0 ? '\n  ぜんぶ通りました' : `\n  ❌ ${ng} 件だめでした`);
    await b.close();
    process.exit(ng === 0 ? 0 : 1);
})();
