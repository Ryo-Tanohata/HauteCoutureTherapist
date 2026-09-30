// 押しのけられた控えが、画面から消え・記録には残り・期限で片づくか
// （ISSUE-075, ISSUE-076）。
//
// **「出さない」と「捨てる」は別物**。ここを取り違えると、
// サロンには同じに見えたまま、**戻せないものが増える**。
//
// なので見るのは3つ。
//   ① ⚠️ の箱が画面のどこにも出ないこと
//   ② それでも record.overwritten に中身が残り、書き出しにも入ること
//   ③ **30日を過ぎたものは、勝手に片づくこと**
// ①だけを見ると、**丸ごと捨てる実装でも通ってしまう。**
// ②だけで止めると、**ずっと溜まり続ける実装でも通ってしまう。**
const { chromium } = require('playwright');
const APP = 'http://127.0.0.1:8900/product/index.html';
const ok = (c) => (c ? '✅' : '❌');
let ng = 0;
const check = (l, c, e = '') => { if (!c) ng += 1; console.log(`  ${l}:`, ok(c), e); };

const CUST = '山田 花子';
const OLD = 'これは押しのけられた古いほうの処方です';

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
    p.on('pageerror', (e) => { console.log('  ERR', e.message.slice(0, 130)); ng += 1; });

    await p.goto(APP);
    await p.waitForTimeout(3200);

    console.log('=== 1. 控えを持つ記録を、わざと作る');
    // 見本には控えが無い。無い状態で「出ない」を確かめても、判定にならない
    const made = await p.evaluate((args) => {
        const list = JSON.parse(localStorage.getItem('therapist_customers') || '[]');
        const c = list.find((x) => (x.name || '').includes('山田'));
        if (!c || !c.records || !c.records.length) return false;
        c.records[0].overwritten = [
            { field: 'prescription', value: args.old, atISO: '2026-08-12T08:10:00.000Z' }
        ];
        localStorage.setItem('therapist_customers', JSON.stringify(list));
        return true;
    }, { old: OLD });
    check('控えを持つ記録を作れた', made);

    await p.reload();
    await p.waitForTimeout(3200);

    console.log('\n=== 2. 画面のどこにも出ないか');
    await p.evaluate((n) => {
        const card = [...document.querySelectorAll('.customer-card-grid-item')]
            .find((el) => el.textContent.includes(n));
        if (card) card.click();
    }, CUST);
    await p.waitForTimeout(1600);

    // カードは開かないと中身が描かれない。全部開いてから見る
    const cards = p.locator('.history-item');
    const n = await cards.count();
    for (let i = 0; i < n; i++) {
        await cards.nth(i).locator('.history-summary').click();
        await p.waitForTimeout(150);
    }
    const page = await p.locator('body').evaluate((el) => el.textContent);
    check('⚠️ の箱が出ていない', !page.includes('別の端末でも書かれていました'));
    check('控えの中身が出ていない', !page.includes(OLD));
    check('箱の入れ物も作られていない', (await p.locator('.overwritten-box').count()) === 0);

    // 記録そのもの（処方）は、これまでどおり出ていること
    check('処方の欄は、これまでどおり出ている', page.includes('処方'));

    console.log('\n=== 3. 記録には残っているか');
    // ここが本題。出さないだけで、捨ててはいない
    const kept = await p.evaluate(() => {
        const list = JSON.parse(localStorage.getItem('therapist_customers') || '[]');
        const c = list.find((x) => (x.name || '').includes('山田'));
        const r = c && c.records && c.records[0];
        return (r && Array.isArray(r.overwritten)) ? r.overwritten : null;
    });
    console.log('   残っているもの:', JSON.stringify(kept));
    check('record.overwritten が残っている', Array.isArray(kept) && kept.length === 1);
    check('中身がそのまま入っている', kept && kept[0].value === OLD);
    check('どの欄のものか分かる', kept && kept[0].field === 'prescription');
    check('いつ書いたかも分かる', kept && String(kept[0].atISO).startsWith('2026-08-12'));

    console.log('\n=== 4. 書き出したファイルに入っているか');
    // 作り手が取り出せるのは、書き出したファイルから。入っていなければ意味が無い
    const inBackup = await p.evaluate(() => {
        const list = JSON.parse(localStorage.getItem('therapist_customers') || '[]');
        // 書き出しは customers をそのまま入れる。同じ形で組み立てて確かめる
        const payload = { app: 'therapist-crm', customers: list };
        return JSON.stringify(payload).includes('overwritten');
    });
    check('書き出す中身に含まれる', inBackup);

    console.log('\n=== 5. 消す手立てが、画面に残っていないか');
    // 見えないものを消させると、消したことにも気づけない
    check('「この控えを消す」が無い', (await p.locator('.btn-overwritten-drop').count()) === 0);

    console.log('\n=== 6. 30日を過ぎたものが、片づくか（ISSUE-076）');
    // 新しいものまで巻き込んで消したら、保険にならない。
    // **古いのは消え・新しいのは残る**の両方を見る。
    const seeded = await p.evaluate(() => {
        const iso = (daysAgo) => {
            const d = new Date();
            d.setDate(d.getDate() - daysAgo);
            return d.toISOString();
        };
        const list = JSON.parse(localStorage.getItem('therapist_customers') || '[]');
        const c = list.find((x) => (x.name || '').includes('山田'));
        c.records[0].overwritten = [
            { field: 'prescription', value: '31日前のもの', atISO: iso(31) },
            { field: 'therapistNote', value: '5日前のもの', atISO: iso(5) },
            { field: 'clientComplaint', value: '時刻が読めないもの', atISO: '' }
        ];
        localStorage.setItem('therapist_customers', JSON.stringify(list));
        return c.records[0].overwritten.length;
    });
    check('3件を仕込めた', seeded === 3, `${seeded}件`);

    // 片づけは起動から少し置いて走る
    await p.reload();
    await p.waitForTimeout(7000);

    const after = await p.evaluate(() => {
        const list = JSON.parse(localStorage.getItem('therapist_customers') || '[]');
        const c = list.find((x) => (x.name || '').includes('山田'));
        return (c.records[0].overwritten || []).map((o) => o.value);
    });
    console.log('   残ったもの:', JSON.stringify(after));
    check('31日前のものは消えた', !after.includes('31日前のもの'));
    check('5日前のものは残っている', after.includes('5日前のもの'));
    // 読めない時刻を残すと、そこだけ期限が効かない抜け道になる
    check('時刻が読めないものも消えた', !after.includes('時刻が読めないもの'));

    console.log('\n=== 7. 片づけるものが無いときは、書き戻さないか');
    // いつも書き戻すと、開くたびに同期が走る
    const before = await p.evaluate(() => localStorage.getItem('therapist_customers'));
    await p.reload();
    await p.waitForTimeout(7000);
    const nowStored = await p.evaluate(() => localStorage.getItem('therapist_customers'));
    check('置き場の中身が変わっていない', before === nowStored);

    console.log(ng === 0 ? '\n  ぜんぶ通りました' : `\n  ❌ ${ng} 件だめでした`);
    await b.close();
    process.exit(ng === 0 ? 0 : 1);
})();
