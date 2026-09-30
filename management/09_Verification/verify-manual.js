// 取扱説明書のページが読めるか、目次と検索が効くか、
// そして同じ中身が操作ガイド（AI）の手元にも渡っているか。
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8900/product/';
const ok = (c) => (c ? '✅' : '❌');
let ng = 0;
const check = (label, cond, extra = '') => { if (!cond) ng += 1; console.log(`  ${label}:`, ok(cond), extra); };

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

    // ---------------- パソコンの幅 ----------------
    const p = await (await b.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
    const blocked = []; const errors = [];
    p.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) blocked.push(m.text()); });
    p.on('pageerror', (e) => errors.push(e.message));

    console.log('=== 1. 説明書のページが読めるか');
    await p.goto(BASE + 'manual.html');
    await p.waitForTimeout(2500);
    blocked.forEach((t) => console.log('   弾かれた:', t.slice(0, 140)));
    check('守りに弾かれていない', blocked.length === 0, `${blocked.length}件`);
    check('エラーが出ていない', errors.length === 0, errors.join(' / ').slice(0, 120));
    check('読み込み中のままでない', !(await p.locator('.loading').count()));
    check('見出しが出ている', (await p.locator('main h2').count()) >= 8,
        `${await p.locator('main h2').count()}個`);
    check('表が出ている', (await p.locator('main table').count()) >= 5,
        `${await p.locator('main table').count()}個`);
    check('目次ができている', (await p.locator('nav.toc a').count()) >= 10,
        `${await p.locator('nav.toc a').count()}項目`);

    console.log('\n=== 2. 中身が、聞かれそうなことを網羅しているか');
    const text = await p.locator('main').innerText();
    const musts = ['予約', 'カルテ', '合言葉', '控え', '書き出す', '同期',
        'Soul Color', 'アーカイブ', 'ニックネーム', '削除', 'ホーム画面', '画面ロック'];
    const missing = musts.filter((w) => !text.includes(w));
    check('主な言葉がすべて載っている', missing.length === 0, missing.join('・') || '');
    check('十分な分量がある', text.length > 4000, `${text.length}文字`);

    console.log('\n=== 3. 探せるか');
    await p.locator('#manual-search').fill('控え');
    await p.waitForTimeout(400);
    const shownSecs = await p.locator('main section:not(.hidden)').count();
    const allSecs = await p.locator('main section').count();
    check('絞り込める', shownSecs > 0 && shownSecs < allSecs, `${shownSecs}/${allSecs} 節`);
    check('絞った中に「控え」がある', (await p.locator('main section:not(.hidden)').first().innerText()).includes('控え'));
    await p.locator('#manual-search').fill('ぬりかべ');
    await p.waitForTimeout(400);
    check('無いものは、無いと出る', await p.locator('.no-hit').isVisible());
    await p.locator('#manual-search').fill('');
    await p.waitForTimeout(400);
    check('消せば全部戻る', (await p.locator('main section:not(.hidden)').count()) === allSecs);

    console.log('\n=== 4. 目次から飛べるか');
    const firstLink = p.locator('nav.toc a').nth(3);
    const href = await firstLink.getAttribute('href');
    await firstLink.click();
    await p.waitForTimeout(900);
    const y = await p.evaluate((id) => {
        const el = document.getElementById(id);
        return el ? Math.round(el.getBoundingClientRect().top) : null;
    }, href.slice(1));
    check('飛んだ先が、上のバーに隠れていない', y !== null && y >= 0 && y < 200, `上から${y}px`);

    console.log('\n=== 5. アプリから開けるか');
    const appCtx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
    // 💬 は既定で出さない設定（ISSUE-071）。説明書が渡っているかを見たいので、出す側にする
    await appCtx.addInitScript(() => localStorage.setItem('therapist_chat_enabled', 'on'));
    const app = await appCtx.newPage();
    await app.goto(BASE + 'index.html');
    await app.waitForTimeout(3000);
    const link = app.locator('#btn-view-manual');
    check('入口のボタンがある', await link.isVisible());
    // 入口はリンクではなくボタン。リンクだと長押しで端末のメニューが出る（ISSUE-057）
    check('リンクではない', (await link.evaluate((el) => el.tagName)) === 'BUTTON');
    const opened = await app.evaluate(() => new Promise((resolve) => {
        const real = window.open;
        window.open = (url, target) => { window.open = real; resolve({ url, target }); return null; };
        document.getElementById('btn-view-manual').click();
        setTimeout(() => { window.open = real; resolve(null); }, 1500);
    }));
    check('押すと説明書が別の窓で開く',
        opened && opened.url === 'manual.html' && opened.target === '_blank', JSON.stringify(opened));

    console.log('\n=== 6. 同じ中身が、操作ガイド（AI）の手元にも渡っているか');
    // 吹き出しを開いて、取り込まれた資料の名前を見る
    const fab = app.locator('#fc-fab, [id$="-fab"]').first();
    if (await fab.count()) {
        await fab.click();
        await app.waitForTimeout(2000);
        // 一覧は畳まれていることがあるので、見た目ではなく中の文字で見る
        const ctx = await app.evaluate(() => {
            const el = document.querySelector('[id$="-ctx-list"]');
            return el ? el.textContent : '';
        });
        console.log('   取り込まれた資料:', JSON.stringify(ctx.replace(/\n+/g, ' / ').slice(0, 120)));
        check('取扱説明書が入っている', ctx.includes('取扱説明書'));
    } else {
        console.log('   （吹き出しが見つからないので飛ばす）');
        ng += 1;
    }

    console.log('\n=== 7. スマホの幅でも読めるか');
    const sp = await (await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
    await sp.goto(BASE + 'manual.html');
    await sp.waitForTimeout(2500);
    const over = await sp.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('横にはみ出していない', over <= 1, `はみ出し ${over}px`);
    check('本文が読める大きさ', await sp.evaluate(() => {
        const el = document.querySelector('main p');
        return el ? parseFloat(getComputedStyle(el).fontSize) >= 14 : false;
    }));
    check('戻るボタンがある', await sp.locator('.back-link').isVisible());

    console.log('\n=== 8. 説明書が、実物の画面とずれていないか');
    // **これが本題。** 画面を直しても説明書は直さないので、静かにずれていく。
    // タブを4つに減らしたあとも、説明書には消えたタブが6つ並んだままだった。
    const appPage = await b.newPage();
    await appPage.goto(BASE + 'index.html');
    await appPage.waitForTimeout(3000);

    // いま実物にあるタブの名前を、画面から拾う
    const real = await appPage.evaluate(() => ({
        main: [...document.querySelectorAll('.nav-tab-btn')]
            .map((el) => (el.getAttribute('title') || '').trim()).filter(Boolean),
        sub: [...document.querySelectorAll('.detail-subtab-btn')]
            .map((el) => (el.querySelector('.tab-text') || {}).textContent || '')
            .map((t) => t.trim()).filter(Boolean),
    }));
    console.log('   実物のタブ:', JSON.stringify(real));
    check('上のタブが6つある', real.main.length === 6, `${real.main.length}個`);
    check('カルテの中のタブが4つある', real.sub.length === 4, JSON.stringify(real.sub));

    const md = await (await fetch(BASE + 'docs/manual.md')).text();

    // 消えた画面の名前が、説明書に残っていないか
    const GONE = ['施術日・回数', '売上・金額合計', '顧客個人情報', '情報タブ'];
    const stale = GONE.filter((w) => md.includes(w));
    check('消えた画面の名前が残っていない', stale.length === 0, stale.join(' / '));

    // いま実物にあるタブが、説明書に出てくるか
    const notInDoc = real.sub.filter((t) => !md.includes(t));
    check('いまあるタブは説明書に出てくる', notInDoc.length === 0, notInDoc.join(' / '));

    // 画面から下ろした欄を、書ける欄として案内していないか
    check('金額を「書く欄」として案内していない',
        !/\|\s*\*\*金額\*\*\s*\|\s*実際にいただいた額/.test(md));

    console.log(ng === 0 ? '\n  ぜんぶ通りました' : `\n  ❌ ${ng} 件だめでした`);
    await b.close();
    process.exit(ng === 0 ? 0 : 1);
})();
