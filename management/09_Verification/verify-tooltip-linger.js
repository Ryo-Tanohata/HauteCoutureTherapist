// 長押しの説明が、指を離してからも少し残るか。
// 残りすぎないか。次を押したら、すぐ入れ替わるか。
const { chromium } = require('playwright');
const APP = 'http://127.0.0.1:8900/product/index.html';
const ok = (c) => (c ? '✅' : '❌');
let ng = 0;
const check = (label, cond, extra = '') => { if (!cond) ng += 1; console.log(`  ${label}:`, ok(cond), extra); };

const shown = (p) => p.locator('.long-press-tooltip').count();
const text = async (p) => (await shown(p)) ? (await p.locator('.long-press-tooltip').first().innerText()) : '';

// 指で押して、離す。実際の指と同じ順番でイベントを起こす
const press = async (p, sel, holdMs) => {
    const box = await p.locator(sel).first().boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await p.touchscreen.tap(x, y).catch(() => {});   // 使わない。下で手で組む
};

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => { console.log('  ERR', e.message); ng += 1; });
    await p.goto(APP);
    await p.waitForTimeout(3000);

    // 説明を持つボタンを探す
    const sel = await p.evaluate(() => {
        const el = Array.from(document.querySelectorAll('button[title], [role="button"][title]'))
            .find((x) => x.offsetParent !== null && x.getAttribute('title'));
        if (!el) return null;
        el.id = el.id || 'pw-tip-target';
        return { id: el.id, title: el.getAttribute('title') };
    });
    if (!sel) { console.log('  説明を持つボタンが見つからない'); process.exit(1); }
    console.log('  ためすボタン:', JSON.stringify(sel.title));

    const hold = async (id, holdMs) => {
        await p.evaluate(async ([id, holdMs]) => {
            const el = document.getElementById(id);
            const r = el.getBoundingClientRect();
            const pt = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, identifier: 1, target: el };
            const mk = (type) => new TouchEvent(type, {
                bubbles: true, cancelable: true,
                touches: type === 'touchend' ? [] : [new Touch(pt)],
                targetTouches: type === 'touchend' ? [] : [new Touch(pt)],
                changedTouches: [new Touch(pt)]
            });
            el.dispatchEvent(mk('touchstart'));
            await new Promise((r2) => setTimeout(r2, holdMs));
            el.dispatchEvent(mk('touchend'));
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }, [id, holdMs]);
    };

    console.log('\n=== 1. 押している間は出る');
    await p.evaluate((id) => {
        const el = document.getElementById(id);
        const r = el.getBoundingClientRect();
        const pt = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, identifier: 1, target: el };
        el.dispatchEvent(new TouchEvent('touchstart', {
            bubbles: true, cancelable: true,
            touches: [new Touch(pt)], targetTouches: [new Touch(pt)], changedTouches: [new Touch(pt)]
        }));
    }, sel.id);
    await p.waitForTimeout(800);
    check('押している間に出る', (await shown(p)) === 1, await text(p));

    console.log('\n=== 2. 指を離しても、しばらく残る');
    await p.evaluate((id) => {
        const el = document.getElementById(id);
        const r = el.getBoundingClientRect();
        const pt = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, identifier: 1, target: el };
        el.dispatchEvent(new TouchEvent('touchend', {
            bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [new Touch(pt)]
        }));
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }, sel.id);

    await p.waitForTimeout(300);
    check('離した直後も残っている', (await shown(p)) === 1);
    await p.waitForTimeout(1000);   // 離してから約1.3秒
    check('1.3秒後もまだ読める', (await shown(p)) === 1);

    console.log('\n=== 3. そのあと、ちゃんと消える');
    await p.waitForTimeout(1400);   // 離してから約2.7秒（1.8 + 0.35 を過ぎている）
    check('2.7秒後には消えている', (await shown(p)) === 0, `${await shown(p)}個`);

    console.log('\n=== 4. 残っている間に次を押したら、すぐ入れ替わる');
    await hold(sel.id, 700);
    await p.waitForTimeout(200);
    check('もう一度出る', (await shown(p)) === 1);
    // 見送りの最中に、もう一度押す
    await p.evaluate((id) => {
        const el = document.getElementById(id);
        const r = el.getBoundingClientRect();
        const pt = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, identifier: 1, target: el };
        el.dispatchEvent(new TouchEvent('touchstart', {
            bubbles: true, cancelable: true,
            touches: [new Touch(pt)], targetTouches: [new Touch(pt)], changedTouches: [new Touch(pt)]
        }));
    }, sel.id);
    await p.waitForTimeout(100);
    check('前のものが残り続けない', (await shown(p)) <= 1, `${await shown(p)}個`);

    console.log('\n=== 5. 何度も離しても、消えるまでの時間が伸びない');
    // touchmove を連打しても見送りが積み重ならないこと
    await p.waitForTimeout(3000);
    await hold(sel.id, 700);
    await p.waitForTimeout(200);
    await p.evaluate((id) => {
        const el = document.getElementById(id);
        const r = el.getBoundingClientRect();
        const pt = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, identifier: 1, target: el };
        for (let i = 0; i < 10; i++) {
            el.dispatchEvent(new TouchEvent('touchmove', {
                bubbles: true, cancelable: true,
                touches: [new Touch(pt)], targetTouches: [new Touch(pt)], changedTouches: [new Touch(pt)]
            }));
        }
    }, sel.id);
    await p.waitForTimeout(2600);
    check('連打しても、伸びずに消える', (await shown(p)) === 0, `${await shown(p)}個`);

    console.log(ng === 0 ? '\n  ぜんぶ通りました' : `\n  ❌ ${ng} 件だめでした`);
    await b.close();
    process.exit(ng === 0 ? 0 : 1);
})();
