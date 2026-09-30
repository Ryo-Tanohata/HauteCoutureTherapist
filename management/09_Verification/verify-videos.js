// 説明書に動画がちゃんと添えられているか。守りに弾かれないか。
// 見出しと中身が食い違っていないか（ここが一番まずい間違い方）。
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8900/product/';
const ok = (c) => (c ? '✅' : '❌');
let ng = 0;
const check = (l, c, e = '') => { if (!c) ng += 1; console.log(`  ${l}:`, ok(c), e); };

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    const p = await (await b.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
    const blocked = [];
    p.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) blocked.push(m.text()); });
    await p.goto(BASE + 'manual.html');
    await p.waitForTimeout(3000);

    console.log('=== 1. 動画が添えられているか');
    const n = await p.locator('.manual-video video').count();
    check('動画がある', n >= 8, `${n}本`);
    blocked.forEach((t) => console.log('   弾かれた:', t.slice(0, 140)));
    check('守りに弾かれていない', blocked.length === 0, `${blocked.length}件`);

    console.log('\n=== 2. 正しい見出しの下に付いているか');
    const where = await p.evaluate(() => Array.from(document.querySelectorAll('.manual-video'))
        .map((f) => {
            let h = f.previousElementSibling;
            while (h && !/^H[23]$/.test(h.tagName)) h = h.previousElementSibling;
            return {
                head: h ? h.textContent.trim().slice(0, 26) : '(不明)',
                cap: f.querySelector('figcaption').textContent.slice(3, 26)
            };
        }));
    where.forEach((w) => console.log(`   ${w.head}  ←  ${w.cap}`));
    check('見出しの下に付いている', where.length > 0 && where.every((w) => w.head !== '(不明)'));

    console.log('\n=== 3. 実際に再生できるか（1本ためす）');
    const first = p.locator('.manual-video video').first();
    const played = await first.evaluate(async (v) => {
        v.muted = true;
        try { await v.play(); } catch (e) { return { error: e.message }; }
        await new Promise((r) => setTimeout(r, 1500));
        return { time: v.currentTime, w: v.videoWidth, h: v.videoHeight, dur: Math.round(v.duration) };
    });
    console.log('   ', JSON.stringify(played));
    check('再生が進む', played && played.time > 0.3);
    check('絵が入っている', played && played.w > 0, `${played.w}x${played.h}`);
    check('長さがまとも', played && played.dur > 8 && played.dur < 180, `${played.dur}秒`);

    console.log('\n=== 4. 開いた瞬間に、全部を落としに行っていないか');
    const eager = await p.evaluate(() => Array.from(document.querySelectorAll('.manual-video video'))
        .filter((v) => v.preload !== 'none').length);
    check('必要になるまで取りに行かない', eager === 0, `${eager}本が先読み`);

    console.log('\n=== 5. スマホ幅');
    const sp = await (await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
    await sp.goto(BASE + 'manual.html');
    await sp.waitForTimeout(3000);
    const over = await sp.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('横にはみ出していない', over <= 1, `${over}px`);
    check('動画も画面に収まる', await sp.evaluate(() => {
        const v = document.querySelector('.manual-video video');
        return v ? v.getBoundingClientRect().width <= window.innerWidth : false;
    }));

    console.log(ng === 0 ? '\n  ぜんぶ通りました' : `\n  ❌ ${ng} 件だめでした`);
    await b.close();
    process.exit(ng === 0 ? 0 : 1);
})();
