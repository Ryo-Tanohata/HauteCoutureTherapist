// 右下の💬を、止められるか・戻せるか（ISSUE-071）。
//
// 「消えたか」だけを見ると、**消しっぱなしの実装でも通る。**
// サロンのご要望は「いつでも再開できるように」なので、
// **戻せるところまで**が本題。
//
// あわせて、止めている間は**繋ぎ先を調べに行かない**ことも見る。
// 隠すだけの直しだと、裏では動き続けてしまう。
const { chromium } = require('playwright');
const APP = 'http://127.0.0.1:8900/product/index.html';
const ok = (c) => (c ? '✅' : '❌');
let ng = 0;
const check = (l, c, e = '') => { if (!c) ng += 1; console.log(`  ${l}:`, ok(c), e); };

// ⚙️ 設定 →「🤖 AI の設定」を開く
async function openAiSettings(page) {
    await page.locator('#btn-view-color-settings').click();
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
        const badge = document.getElementById('ai-route-badge');
        const group = badge && badge.closest('details');
        if (group) group.open = true;
    });
    await page.waitForTimeout(500);
}

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));

    // 止めている間にAIへ行っていないかを見るため、行き先を控える。
    // 見るのは**生成を頼む先**だけ。繋ぎ先を調べる `/api/ai-status` は
    // 設定画面の札もアプリ自身が使うので、チャットのせいかを切り分けられない。
    const aiCalls = [];
    p.on('request', (r) => {
        const u = r.url();
        if (/\/api\/chat|api\.anthropic\.com|generativelanguage\.googleapis\.com/.test(u)) aiCalls.push(u);
    });

    await p.goto(APP);
    await p.waitForTimeout(3400);

    console.log('=== 1. 何もしていない端末では、💬 が出ないか');
    // サロンのご要望で、既定を「出さない」にしている
    check('💬 のボタンが無い', (await p.locator('#fc-fab').count()) === 0);
    check('チャットの画面も作られていない', (await p.locator('#fc-panel').count()) === 0);
    check('止めている印が付いている',
        await p.evaluate(() => document.body.classList.contains('chat-hidden')));

    console.log('\n=== 2. 止めている間、AIへ繋ぎに行っていないか');
    // 隠すだけだと、繋ぎ先調べだけは動き続ける
    await p.waitForTimeout(1500);
    aiCalls.forEach((u) => console.log('   行った先:', u.slice(0, 80)));
    check('AIへ行っていない', aiCalls.length === 0, `${aiCalls.length}件`);

    console.log('\n=== 3. 末尾の余白が、要らないぶん詰まっているか');
    const pad = await p.evaluate(() => getComputedStyle(document.querySelector('main')).paddingBottom);
    check('ボタンぶんの余白が空いていない', parseInt(pad, 10) < 60, pad);

    console.log('\n=== 4. 設定に、戻す場所があるか');
    await openAiSettings(p);
    const toggle = p.locator('#chat-visibility-preference');
    check('設定に切り替えがある', (await toggle.count()) > 0);
    check('いま「出さない」が選ばれている',
        await toggle.locator('.record-color-set-btn[data-chat="off"]').evaluate((el) => el.classList.contains('active')));

    console.log('\n=== 5. 「出す」に戻すと、その場で戻るか');
    // 読み込み直しをお願いする作りだと、戻したのに何も起きないように見える
    await toggle.locator('.record-color-set-btn[data-chat="on"]').click();
    await p.waitForTimeout(2500);
    check('💬 のボタンが出る', (await p.locator('#fc-fab').count()) > 0);
    check('押せる状態で出ている', await p.locator('#fc-fab').isVisible());
    check('止めている印が外れている',
        !(await p.evaluate(() => document.body.classList.contains('chat-hidden'))));

    await p.locator('#fc-fab').click();
    await p.waitForTimeout(1500);
    check('押すとチャットが開く', await p.locator('#fc-panel.open').count() > 0);

    console.log('\n=== 6. 読み込み直しても、戻した状態が残るか');
    await p.goto(APP);
    await p.waitForTimeout(3400);
    check('💬 が出たままになっている', (await p.locator('#fc-fab').count()) > 0);

    console.log('\n=== 7. もう一度止められるか');
    await openAiSettings(p);
    await p.locator('#chat-visibility-preference .record-color-set-btn[data-chat="off"]').click();
    await p.waitForTimeout(800);
    check('その場で消える', !(await p.locator('#fc-fab').isVisible()));
    await p.goto(APP);
    await p.waitForTimeout(3400);
    check('読み込み直しても出てこない', (await p.locator('#fc-fab').count()) === 0);

    console.log('\n=== 8. 途中でエラーが出ていないか');
    errors.forEach((e) => console.log('   ERR', e.slice(0, 130)));
    check('エラーが出ていない', errors.length === 0, `${errors.length}件`);

    console.log(ng === 0 ? '\n  ぜんぶ通りました' : `\n  ❌ ${ng} 件だめでした`);
    await b.close();
    process.exit(ng === 0 ? 0 : 1);
})();
