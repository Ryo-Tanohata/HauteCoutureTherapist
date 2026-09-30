// カードの4行を「書いたものだけ出す」に変えた件（ISSUE-082）。
//
// きっかけは 🦄counseling だけの記録に「選んだ色: 未記入」が出ていたこと。
// 色を選ぶ欄は 🌈color を選んだときしか開かないので、**書く手立ての無い
// 項目が「書き忘れ」に見えていた**。
//
// 見るのは3つ。
//   ① 空の行が出ないこと（これが本題）
//   ② 書いた行はちゃんと出ること（消しすぎていないこと）
//   ③ 中身が空でもカードの中が空にならないこと（編集ボタンが残る）
const { chromium } = require('playwright');
const APP = 'http://127.0.0.1:8900/product/index.html';
const ok = (c) => (c ? '✅' : '❌');
let ng = 0;
const check = (l, c, e = '') => { if (!c) ng += 1; console.log(`  ${l}:`, ok(c), e); };

const ROWS = ['選んだ色', '訴え', '処方', 'メモ'];

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
    p.on('pageerror', (e) => { console.log('  ERR', e.message.slice(0, 130)); ng += 1; });

    await p.goto(APP);
    await p.waitForTimeout(3200);

    // 見本の記録は4項目とも埋まっているので、そのままだと
    // 「空なら出ない」ほうを一度も試さずに通ってしまう。空の記録を入れて確かめる。
    const EMPTY_WHEN = '2026-04-01';
    await p.evaluate((when) => {
        const cs = JSON.parse(localStorage.getItem('therapist_customers') || '[]');
        if (!cs[0]) return;
        cs[0].records = cs[0].records || [];
        cs[0].records.push({
            id: 'verify-empty-1', date: when, time: '10:00 - 11:00',
            categories: ['counseling'],       // 🌈color は選んでいない
            colors: [], clientComplaint: '', prescription: '', therapistNote: '',
        });
        localStorage.setItem('therapist_customers', JSON.stringify(cs));
    }, EMPTY_WHEN);
    await p.reload();
    await p.waitForTimeout(3200);

    console.log('\n=== 1. 見本の記録で、空の行が出ていないか');
    await p.evaluate(() => {
        const card = [...document.querySelectorAll('.customer-card-grid-item')][0];
        if (card) card.click();
    });
    await p.waitForTimeout(1600);
    await p.locator('.detail-subtab-btn[data-tab="visit-type"]').click();
    await p.waitForTimeout(1400);

    const cards = await p.locator('.history-item').count();
    check('カルテにカードがある', cards > 0, `${cards}枚`);

    // 閉じたままだと中身を読み違えるので、ぜんぶ開いてから見る
    await p.evaluate(() => {
        document.querySelectorAll('.history-item:not(.is-open) .history-summary')
            .forEach((el) => el.click());
    });
    await p.waitForTimeout(900);

    // 「◯◯: 未記入」の形が1つでもあれば失敗。
    // 初診問診の「未記入」は別の欄（.intake-empty）なので、カードの中だけ見る
    const bodies = await p.locator('.history-item .history-item-body').allTextContents();
    const bad = [];
    bodies.forEach((t, i) => ROWS.forEach((r) => {
        if (new RegExp(`${r}:\\s*未記入`).test(t)) bad.push(`${i}枚目の「${r}」`);
    }));
    check('空の行が1つも出ていない', bad.length === 0, bad.join(' / '));

    console.log('\n=== 2. 書いた行は残っているか（消しすぎていないか）');
    // 見本には訴えやメモの入った記録があるはず。1つも出ないなら消しすぎ
    const shown = ROWS.filter((r) => bodies.some((t) => t.includes(`${r}:`)));
    console.log('   出ている行:', JSON.stringify(shown));
    check('書いてある行はちゃんと出る', shown.length > 0, JSON.stringify(shown));

    console.log('\n=== 3. 空の記録でも、カードの中が空にならないか');
    // 4項目とも空だと中身が何も無くなる。**さっき入れた空の記録そのもの**を見る。
    // 埋まっているカードを見ても、この心配は確かめられない。
    const emptyBody = await p.evaluate((when) => {
        const el = [...document.querySelectorAll('.history-item')]
            .find((c) => (c.querySelector('.visit-when') || {}).textContent?.trim().startsWith(when));
        if (!el) return null;
        const body = el.querySelector('.history-item-body');
        return {
            文字: body.textContent.replace(/\s+/g, ' ').trim(),
            押せる: body.querySelectorAll('button').length,
        };
    }, EMPTY_WHEN);
    console.log('   空の記録の中身:', JSON.stringify(emptyBody));
    check('空の記録のカードが見つかった', Boolean(emptyBody));
    check('中に押せるものが残っている', Boolean(emptyBody && emptyBody.押せる > 0), JSON.stringify(emptyBody));

    console.log('\n=== 4. 中身の有無と、行の出方が合っているか');
    // 本題そのもの。ただし **区分と色は別もの**。
    // 見本の記録は区分の仕組みより前のもので、🌈 が付いていないのに
    // 色だけ入っている。それは「書いてある」ので出るのが正しい。
    // 見るべきは区分ではなく、**記録の中身と行の出方が合っているか**。
    const pairs = await p.evaluate(() => {
        // カードに記録のIDは載っていないので、頭の帯の「日付 (時刻)」で突き合わせる。
        // 同じ日時が2件あると、どちらか分からない。その分は数えない。
        const cs = JSON.parse(localStorage.getItem('therapist_customers') || '[]');
        const byWhen = new Map();
        cs.forEach((c) => (c.records || []).forEach((r) => {
            const k = `${r.date}|${r.time || ''}`;
            byWhen.set(k, byWhen.has(k) ? null : r);   // 重なったら null にして捨てる
        }));
        const has = (v) => Boolean(v && String(v).trim());
        return [...document.querySelectorAll('.history-item')].map((el) => {
            const when = el.querySelector('.visit-when');
            const body = el.querySelector('.history-item-body');
            if (!when || !body) return null;
            // 時刻は「14:00 - 15:00」のように空白を含む。\S+ では取りこぼす
            const m = when.textContent.trim().match(/^(\S+)\s*(?:\((.+)\))?$/);
            if (!m) return null;
            const r = byWhen.get(`${m[1]}|${(m[2] || '').trim()}`);
            if (!r) return null;
            const t = body.textContent;
            return {
                いつ: when.textContent.trim(),
                色: [Array.isArray(r.colors) && r.colors.length > 0, /選んだ色:/.test(t)],
                訴え: [has(r.clientComplaint), /訴え:/.test(t)],
                処方: [has(r.prescription), /処方:/.test(t)],
                メモ: [has(r.therapistNote), /メモ:/.test(t)],
            };
        }).filter(Boolean);
    });
    check('記録と突き合わせられた', pairs.length > 0, `${pairs.length}枚`);
    const mismatch = [];
    pairs.forEach((row) => Object.entries(row).forEach(([k, v]) => {
        if (!Array.isArray(v)) return;   // 「いつ」は目印なので飛ばす
        const [inData, onScreen] = v;
        if (inData !== onScreen) mismatch.push(`${row.いつ}の「${k}」中身=${inData} 画面=${onScreen}`);
    }));
    console.log('   突き合わせ:', JSON.stringify(pairs));
    // **空の記録が実際に見られたか。** これが無いと、上の✅は
    // 「空なら出ない」を一度も試さずに通っているだけになる
    const emptyRow = pairs.find((r) => r.いつ.startsWith(EMPTY_WHEN));
    check('空の記録が突き合わせに入った', Boolean(emptyRow), JSON.stringify(emptyRow || null));
    if (emptyRow) {
        check('空の記録では4行とも出ていない',
            ['色', '訴え', '処方', 'メモ'].every((k) => emptyRow[k][1] === false),
            JSON.stringify(emptyRow));
    }
    check('中身がある行だけが出ている', mismatch.length === 0, mismatch.join(' / '));

    console.log('\n=== 5. 見出しが、アイコンと名前を対にして出るか（ISSUE-089）');
    // 以前はアイコンの並びと名前の並びを別々に両方出しており、
    // 16個押した日は**5行**を占めて金額が下へ押し出されていた
    await p.evaluate(() => {
        const cs = JSON.parse(localStorage.getItem('therapist_customers') || '[]');
        const all = ['m-first', 'm-repeat', 'm-month', 'm-extend', 'm-reiki-m', 'm-reiki-w',
            'm-ac', 'm-couns', 'm-volun', 'm-item', 'm-lecture', 'm-ws', 'm-other',
            'm-monitor', 'm-tel', 'm-color'];
        cs[0].records.unshift(
            { id: 'v-old', date: '2026-08-15', time: '09:00', type: '無料カウンセリング',
              amount: 0, categories: ['counseling', 'color'] },
            { id: 'v-few', date: '2026-08-20', time: '10:00', type: '再診・延長',
              amount: 17500, categories: ['session'], menu: ['m-repeat', 'm-extend'] },
            { id: 'v-many', date: '2026-08-29', time: '11:00', type: all.join('・'),
              amount: 102500, categories: ['session'], menu: all });
        localStorage.setItem('therapist_customers', JSON.stringify(cs));
    });
    await p.reload(); await p.waitForTimeout(3000);
    await p.evaluate(() => {
        const c = document.querySelector('.customer-card-grid-item'); if (c) c.click();
    });
    await p.waitForTimeout(1600);
    await p.locator('.detail-subtab-btn[data-tab="visit-type"]').click();
    await p.waitForTimeout(1400);

    const heads = await p.evaluate(() => {
        const pick = (txt) => [...document.querySelectorAll('.history-item')]
            .find((el) => (el.querySelector('.visit-when') || {}).textContent.includes(txt));
        const read = (el) => {
            if (!el) return null;
            const h = el.querySelector('.history-summary-type');
            return {
                札: [...h.querySelectorAll('.summary-chip')].map((c) => c.textContent.replace(/\s+/g, '').trim()),
                ほか: ((h.querySelector('.summary-more') || {}).textContent || '').trim(),
                高さ: Math.round(h.getBoundingClientRect().height),
            };
        };
        return { 昔: read(pick('2026-08-15')), 少: read(pick('2026-08-20')), 多: read(pick('2026-08-29')) };
    });
    console.log('   ', JSON.stringify(heads));

    check('まとめる前の記録は、そのときの名前のまま',
        heads.昔 && heads.昔.札.length === 1 && heads.昔.札[0].includes('無料カウンセリング'),
        JSON.stringify(heads.昔));
    check('2件なら札が2つ、「ほか」は出ない',
        heads.少 && heads.少.札.length === 2 && heads.少.ほか === '', JSON.stringify(heads.少));
    check('札にアイコンと名前が対で入っている',
        heads.少 && heads.少.札[0].includes('🫶') && heads.少.札[0].includes('再診'),
        JSON.stringify(heads.少 && heads.少.札));
    check('16件でも札は3つまで', heads.多 && heads.多.札.length === 3, JSON.stringify(heads.多));
    check('残りは「ほか 13」にまとまる', heads.多 && heads.多.ほか === 'ほか 13', String(heads.多 && heads.多.ほか));
    // **ここが本題。** 以前は5行あった
    check('16件でも見出しは1行に収まる', heads.多 && heads.多.高さ <= 34, `${heads.多 && heads.多.高さ}px`);

    console.log('\n=== 6. 畳んだぶんは、開いたときに出るか');
    const many = p.locator('.history-item').filter({ hasText: 'ほか 13' }).first();
    await many.locator('.history-summary').click();
    await p.waitForTimeout(500);
    const manyBody = await many.locator('.history-item-body').textContent();
    check('開くと全部出る', manyBody.includes('施術内容:') && manyBody.includes('color'),
        manyBody.replace(/\s+/g, ' ').trim().slice(0, 70));

    // **日付で指すこと。** 「再診」で絞ると、16件のカードにも入っているので取り違える
    const few = p.locator('.history-item').filter({ hasText: '2026-08-20' }).first();
    if (await few.count()) {
        await few.locator('.history-summary').click();
        await p.waitForTimeout(400);
        const fewBody = await few.locator('.history-item-body').textContent();
        // 畳んでいないものに出すと、上の札と同じものが二度並ぶ
        check('畳んでいないときは出さない', !fewBody.includes('施術内容:'),
            fewBody.replace(/\s+/g, ' ').trim().slice(0, 60));
    }
    check('画面が横にずれていない',
        (await p.evaluate(() => document.documentElement.scrollWidth
            - document.documentElement.clientWidth)) <= 1);

    console.log(ng === 0 ? '\n  ぜんぶ通りました' : `\n  ❌ ${ng} 件だめでした`);
    await b.close();
    process.exit(ng === 0 ? 0 : 1);
})();
