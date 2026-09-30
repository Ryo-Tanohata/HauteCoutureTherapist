// よみがなの自動入力（ISSUE-079）。
//
// 漢字から読みは引けない。「圭」が「けい」か「かど」かは字面では決まらない。
// なので**変換を確定する前に打った読み**を拾うしかない。
//
// ここで転んでいた。**変換候補を選ぶと `compositionupdate` がもう一度、
// 今度は変換後の漢字で流れてくる。** 最後の値を採ると読みが漢字に化ける
// （実機のよみがな欄に「田中 圭」が入っていた）。
//
// 「かなが入るか」だけを見ると足りない。**変換したときに漢字が入らないこと**、
// そして**拾えないときは空のままにすること**まで見る。
// 当て推量の読みが入るくらいなら、空のほうがよい。
const { chromium } = require('playwright');
const APP = 'http://127.0.0.1:8900/product/index.html';
const ok = (c) => (c ? '✅' : '❌');
let ng = 0;
const check = (l, c, e = '') => { if (!c) ng += 1; console.log(`  ${l}:`, ok(c), e); };

// 日本語IMEの打ち方を、合成イベントで真似る。
// updates … 変換中に流れてくる値の並び（最後は変換後の候補になりうる）
// committed … 確定した文字
const typeWithIme = (page, updates, committed) => page.evaluate(({ updates, committed }) => {
    const name = document.getElementById('input-name');
    const fire = (type, data) => name.dispatchEvent(new CompositionEvent(type, { data, bubbles: true }));
    fire('compositionstart', '');
    updates.forEach((d) => { name.value = d; fire('compositionupdate', d); });
    name.value = committed;
    fire('compositionend', committed);
    return { name: name.value, kana: document.getElementById('input-kana').value };
}, { updates, committed });

const clearForm = (page) => page.evaluate(() => {
    document.getElementById('btn-cancel-customer').click();
    document.getElementById('btn-add-customer').click();
});

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
    p.on('pageerror', (e) => { console.log('  ERR', e.message.slice(0, 130)); ng += 1; });

    await p.goto(APP);
    await p.waitForTimeout(3200);
    await p.locator('#btn-add-customer').click();
    await p.waitForTimeout(1000);

    console.log('=== 1. 変換せず、ひらがなのまま確定');
    let r = await typeWithIme(p, ['た', 'たな', 'たなか'], 'たなか');
    console.log('   氏名:', JSON.stringify(r.name), '→ よみがな:', JSON.stringify(r.kana));
    check('打ったかながそのまま入る', r.kana === 'たなか', r.kana);

    console.log('\n=== 2. 漢字に変換して確定（実機で壊れていた打ち方）');
    await clearForm(p); await p.waitForTimeout(700);
    r = await typeWithIme(p, ['た', 'たな', 'たなか', '田中'], '田中');
    console.log('   氏名:', JSON.stringify(r.name), '→ よみがな:', JSON.stringify(r.kana));
    check('漢字ではなく、読みが入る', r.kana === 'たなか', r.kana);
    check('よみがなに漢字が混じっていない', !/[一-鿿]/.test(r.kana), r.kana);

    console.log('\n=== 3. 姓と名を続けて打つ');
    await clearForm(p); await p.waitForTimeout(700);
    await typeWithIme(p, ['た', 'たな', 'たなか', '田中'], '田中');
    r = await p.evaluate(() => {
        const name = document.getElementById('input-name');
        const fire = (t, d) => name.dispatchEvent(new CompositionEvent(t, { data: d, bubbles: true }));
        // 空白は変換を通さずに入る
        name.value = '田中 ';
        name.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ' ' }));
        fire('compositionstart', '');
        ['け', 'けい', '圭'].forEach((d) => { name.value = '田中 ' + d; fire('compositionupdate', d); });
        name.value = '田中 圭';
        fire('compositionend', '圭');
        return { name: name.value, kana: document.getElementById('input-kana').value };
    });
    console.log('   氏名:', JSON.stringify(r.name), '→ よみがな:', JSON.stringify(r.kana));
    check('姓と名がつながる', r.kana === 'たなか けい', r.kana);

    console.log('\n=== 4. 予測変換で、かなを見ないまま確定');
    // 読みを拾えていない。**当て推量を入れるより空のほうがよい**
    await clearForm(p); await p.waitForTimeout(700);
    r = await typeWithIme(p, ['た', '田中'], '田中');
    console.log('   氏名:', JSON.stringify(r.name), '→ よみがな:', JSON.stringify(r.kana));
    check('間違った読みを入れない（空のまま）', r.kana === '', r.kana);

    console.log('\n=== 5. 貼り付け（変換を通さない漢字）');
    await clearForm(p); await p.waitForTimeout(700);
    r = await p.evaluate(() => {
        const name = document.getElementById('input-name');
        name.value = '山田 花子';
        name.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
        return { name: name.value, kana: document.getElementById('input-kana').value };
    });
    console.log('   氏名:', JSON.stringify(r.name), '→ よみがな:', JSON.stringify(r.kana));
    check('読めない字は入れない（空のまま）', r.kana === '', r.kana);

    console.log('\n=== 6. 手で直したら、もう上書きしないか');
    await clearForm(p); await p.waitForTimeout(700);
    await typeWithIme(p, ['や', 'やまだ'], 'やまだ');
    await p.evaluate(() => {
        const kana = document.getElementById('input-kana');
        kana.value = 'やまだ たろう';
        kana.dispatchEvent(new InputEvent('input', { bubbles: true }));
    });
    r = await typeWithIme(p, ['は', 'はなこ', '花子'], 'やまだ花子');
    console.log('   よみがな:', JSON.stringify(r.kana));
    check('手で入れたものが残る', r.kana === 'やまだ たろう', r.kana);

    console.log('\n=== 7. ソウルカラーの自動計算が、登録画面からも消えたか');
    const form = await p.locator('#customer-modal').textContent();
    check('「この5色を入れる」が無い', !form.includes('この5色を入れる'));
    check('「参考：この計算では5色」が無い', !form.includes('参考：この計算では5色'));
    check('置き場も作られていない', (await p.locator('#input-soul-auto').count()) === 0);
    check('5色の丸は残っている', (await p.locator('#soul-color-slots .soul-slot').count()) === 5,
        `${await p.locator('#soul-color-slots .soul-slot').count()}個`);

    console.log(ng === 0 ? '\n  ぜんぶ通りました' : `\n  ❌ ${ng} 件だめでした`);
    await b.close();
    process.exit(ng === 0 ? 0 : 1);
})();
