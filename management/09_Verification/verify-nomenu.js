// 長押ししたとき、端末のメニュー（「リンクアドレスをコピー」など）が出ないか。
// 逆に、入力欄と本文では、これまでどおり選んで写せるか。
const { chromium } = require('playwright');
const APP = 'http://127.0.0.1:8900/product/index.html';
const ok = (c) => (c ? '✅' : '❌');
let ng = 0;
const check = (l, c, e = '') => { if (!c) ng += 1; console.log(`  ${l}:`, ok(c), e); };

/** その場所で右クリック相当（＝長押しで出るメニュー）が止まるか */
const menuBlocked = (p, sel) => p.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    return ev.defaultPrevented;
}, sel);

/** 指で押している最中に、メニューが出ようとしたら止まるか（title を外す経路を通す） */
const menuBlockedWhileHeld = (p, sel) => p.evaluate(async (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const pt = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, identifier: 1, target: el };
    el.dispatchEvent(new TouchEvent('touchstart', {
        bubbles: true, cancelable: true,
        touches: [new Touch(pt)], targetTouches: [new Touch(pt)], changedTouches: [new Touch(pt)]
    }));
    await new Promise((r2) => setTimeout(r2, 700));   // 説明が出て、title が外れたころ
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    const blocked = ev.defaultPrevented;
    el.dispatchEvent(new TouchEvent('touchend', {
        bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [new Touch(pt)]
    }));
    return blocked;
}, sel);

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
    p.on('pageerror', (e) => { console.log('  ERR', e.message.slice(0, 140)); ng += 1; });
    await p.goto(APP); await p.waitForTimeout(3500);

    console.log('=== 1. 取扱説明書の入口');
    // リンクだと、止める指定を入れても端末側でメニューが出ることがある。
    // 作りのほうをボタンに揃えたので、そもそもリンクではないことを見る。
    const kind = await p.evaluate(() => {
        const el = document.getElementById('btn-view-manual');
        return el ? { tag: el.tagName, href: el.getAttribute('href') } : null;
    });
    console.log('   入口の作り:', JSON.stringify(kind));
    check('リンクではなくボタンになっている', kind && kind.tag === 'BUTTON' && !kind.href);

    check('メニューが出ない', await menuBlocked(p, '#btn-view-manual') === true);
    check('押している最中も出ない', await menuBlockedWhileHeld(p, '#btn-view-manual') === true);
    // -webkit-touch-callout は iPhone 用で、Chromium は計算結果として返さない。
    // 指定そのものが当たっているかを、規則の側から見る。
    // Chromium は -webkit-touch-callout を持たないので、CSSOM からは読めない。
    // 元の文字列を取ってきて、その規則にこの要素が入っているかを見る。
    const css = await p.evaluate(async () => {
        const text = await (await fetch('css/index.css')).text();
        const el = document.getElementById('btn-view-manual');
        let callout = false;
        text.split('}').forEach((block) => {
            if (block.indexOf('-webkit-touch-callout: none') === -1) return;
            const sel = block.split('{')[0].replace(/\/\*[\s\S]*?\*\//g, '').trim();
            sel.split(',').forEach((one) => {
                try { if (one.trim() && el.matches(one.trim())) callout = true; } catch (e) { /* noop */ }
            });
        });
        return { callout, select: getComputedStyle(el).userSelect };
    });
    console.log('   見た目の指定:', JSON.stringify(css));
    check('端末側の吹き出しも止めてある（iPhone 用の指定が当たっている）', css.callout === true);
    check('文字が選ばれない', css.select === 'none', css.select);

    // 直前の長押しで「読んだだけ」と見なされ、次の1回の押下が意図的に無効化される。
    // ここで1回空押しして、その効き目を消してから先へ進む。
    await p.locator('#btn-view-list').click().catch(() => {});
    await p.waitForTimeout(400);

    console.log('\n=== 2. ほかのアイコンも同じか');
    for (const sel of ['#btn-view-list', '#btn-view-calendar', '#btn-view-color-settings',
        '#btn-view-advice', '#btn-view-astro-aroma', '#btn-add-customer', '#btn-demo-guide']) {
        const r = await menuBlocked(p, sel);
        check(`${sel}`, r === true, r === null ? '(見つからない)' : '');
    }

    console.log('\n=== 3. 入力欄と本文は、これまでどおり写せるか');
    check('検索の入力欄では止めない', await menuBlocked(p, '#search-input') === false);
    await p.locator('#btn-view-color-settings').click(); await p.waitForTimeout(1500);
    // 設定の中はたたまれているので、開いてから見る
    await p.evaluate(() => document.querySelectorAll('details.settings-group')
        .forEach((d) => { d.open = true; }));
    await p.waitForTimeout(600);
    const passOk = await menuBlocked(p, '#input-salon-pass');
    check('合言葉の入力欄でも止めない', passOk === false, passOk === null ? '(見つからない)' : '');
    const areaOk = await menuBlocked(p, 'textarea');
    check('記録の本文（textarea）でも止めない', areaOk !== true, `${areaOk}`);

    console.log('\n=== 4. 押したら、別の窓で説明書が開くか');
    const opened = await p.evaluate(() => new Promise((resolve) => {
        const real = window.open;
        window.open = (url, target) => { window.open = real; resolve({ url, target }); return null; };
        document.getElementById('btn-view-manual').click();
        setTimeout(() => { window.open = real; resolve(null); }, 1500);
    }));
    console.log('   開いた先:', JSON.stringify(opened));
    check('説明書を別の窓で開く', opened && opened.url === 'manual.html' && opened.target === '_blank');

    console.log('\n=== 5. 説明そのものは、これまでどおり出るか');
    await p.locator('#btn-view-list').click(); await p.waitForTimeout(1200);
    await p.evaluate(() => {
        const el = document.getElementById('btn-view-manual');
        const r = el.getBoundingClientRect();
        const pt = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, identifier: 1, target: el };
        el.dispatchEvent(new TouchEvent('touchstart', {
            bubbles: true, cancelable: true,
            touches: [new Touch(pt)], targetTouches: [new Touch(pt)], changedTouches: [new Touch(pt)]
        }));
    });
    await p.waitForTimeout(900);
    const tip = await p.locator('.long-press-tooltip').count();
    const tipText = tip ? (await p.locator('.long-press-tooltip').first().innerText()).trim() : '';
    console.log('   出た説明:', JSON.stringify(tipText));
    check('説明が出る', tip === 1 && tipText.length > 0);

    console.log(ng === 0 ? '\n  ぜんぶ通りました' : `\n  ❌ ${ng} 件だめでした`);
    await b.close();
    process.exit(ng === 0 ? 0 : 1);
})();
