// 施術内容と施術の区分を、ひと並びにまとめた件（ISSUE-085）。
// もとは ISSUE-080/081 の「区分の作り直しと欄の整理」を見ていた検証で、
// そのぶんも引き続き見る。
//
// 見るのは6つ。
//   ① ひと並びのメニューが、**2つの画面のどちらにも**出ること
//   ② ふだんは畳まれていて、**閉じたままでも選んだ内容と合計が行に出る**こと
//   ③ 押したものの合計が金額になり、その都度のものは欄が出ること
//   ④ 施術メニュー・🧪処方・金額の欄は画面に無いが、入れ物は残っていること
//   ⑤ **区分の key が変わっていない**こと（変えると既存の記録の区分が消える）
//   ⑥ 昔の記録（menu を持たない）を開いても、**金額が化けない**こと
const { chromium } = require('playwright');
const APP = 'http://127.0.0.1:8900/product/index.html';
const ok = (c) => (c ? '✅' : '❌');
let ng = 0;
const check = (l, c, e = '') => { if (!c) ng += 1; console.log(`  ${l}:`, ok(c), e); };

// 押すもの。key は記録が指しているので、変えてはいけない
const WANT_MENU = ['m-first', 'm-repeat', 'm-month', 'm-extend', 'm-reiki-m', 'm-reiki-w',
    'm-ac', 'm-couns', 'm-volun', 'm-item', 'm-lecture', 'm-ws', 'm-other',
    'm-monitor', 'm-tel', 'm-color'];
// 書く欄。こちらも変えてはいけない
const WANT_FIELDS = ['monitor', 'session', 'aroma', 'phone', 'counseling',
    'animal', 'color', 'reiki', 'workshop', 'lecture'];

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
    p.on('pageerror', (e) => { console.log('  ERR', e.message.slice(0, 130)); ng += 1; });

    const isShown = (sel) => p.locator(sel).evaluate((el) => el.checkVisibility()).catch(() => false);
    const keysIn = (host) => p.locator(`${host} .service-cat-btn`)
        .evaluateAll((els) => els.map((e) => e.dataset.menu));

    await p.goto(APP);
    await p.waitForTimeout(3200);

    console.log('\n=== 1. 予約の画面（サロンがふだん使うのはこちら・ISSUE-065）');
    await p.locator('#btn-view-calendar').click();
    await p.waitForTimeout(1600);
    await p.locator('#btn-open-booking').click();
    await p.waitForTimeout(1400);
    check('予約の画面が開く', (await p.locator('#booking-modal.active').count()) > 0);

    check('ふだんは畳まれている',
        await p.evaluate(() => !document.getElementById('inline-menu-fold').open));
    // **閉じたままでも中身が分かること。** 見えないまま畳むと押し忘れに気づけない
    check('閉じたままでも要約の行がある', await isShown('#inline-menu-state'));
    check('閉じたままでも合計の行がある', await isShown('#inline-menu-sum'));

    await p.locator('#inline-menu-fold > summary').click();
    await p.waitForTimeout(500);
    const inlineKeys = await keysIn('#inline-service-categories');
    console.log('   予約の施術内容:', JSON.stringify(inlineKeys));
    check('16個そろっている', WANT_MENU.every((k) => inlineKeys.includes(k)),
        WANT_MENU.filter((k) => !inlineKeys.includes(k)).join(' / '));
    check('key が重複していない', new Set(inlineKeys).size === inlineKeys.length);

    console.log('\n=== 2. 押したものが、そのまま合計になるか');
    await p.locator('#inline-service-categories [data-menu="m-repeat"]').click();
    await p.waitForTimeout(300);
    await p.locator('#inline-service-categories [data-menu="m-extend"]').click();
    await p.waitForTimeout(400);
    const t1 = (await p.locator('#inline-menu-total').textContent()).trim();
    console.log('   再診 15,000 ＋ 延長 2,500 →', JSON.stringify(t1));
    check('合計になっている', t1.includes('17,500'), t1);
    check('隠れた金額の欄にも入る',
        (await p.locator('#inline-record-amount').inputValue()) === '17500');
    check('隠れた施術メニューにも入る',
        (await p.locator('#inline-record-type').inputValue()).includes('再診'));

    // 閉じても中身が分かるか
    await p.locator('#inline-menu-fold > summary').click();
    await p.waitForTimeout(400);
    const chipN = await p.locator('#inline-menu-state .menu-fold-chip').count();
    const sm = (await p.locator('#inline-menu-sum').textContent()).trim();
    console.log('   閉じたときの行:', chipN, '個のアイコン /', JSON.stringify(sm));
    check('閉じても選んだアイコンが出る', chipN === 2, `${chipN}個`);
    check('閉じても合計が出る', sm.includes('17,500'), sm);
    await p.locator('#inline-menu-fold > summary').click();
    await p.waitForTimeout(400);

    console.log('\n=== 2.5 スクロールしても、選んだものが見えているか（ISSUE-086）');
    // アイコンが16個あるので、下まで見るうちに要約が画面から出てしまい、
    // **いま何を選んでいるかが分からなくなっていた**。要約の行を上に貼り付けた。
    //
    // 測るのは「**アイコンの一番下まで送ったとき**」。そこが実際に困る場面。
    // 画面の一番下まで送ると、選ぶところ自体を通り過ぎるので、
    // 要約が付いてこなくて当たり前になる（貼り付けは自分の箱の中までしか効かない）。
    // 測る位置は「**選ぶところを下まで見終えたとき**」。
    // 合計や「⚙️ メニューを編集」まで送った状態で、そこが実際に困る場面。
    // アイコンの下端で測ると、貼り付けが無くても要約が見えていて、判定にならない。
    const stickAt = (foldId, scrollId) => p.evaluate(([f, sc]) => {
        const el = document.getElementById(f);
        const box = document.getElementById(sc);
        if (!el || !box) return null;
        const fB = el.getBoundingClientRect(), cB = box.getBoundingClientRect();
        box.scrollTop += (fB.bottom - cB.bottom) + 8;
        const s2 = el.querySelector('summary').getBoundingClientRect();
        const c2 = box.getBoundingClientRect();
        return {
            summaryTop: Math.round(s2.top),
            containerTop: Math.round(c2.top),
            見えている: s2.top >= c2.top - 2 && s2.bottom <= c2.bottom,
        };
    }, [foldId, scrollId]);

    const bkScroll = await p.evaluate(() => {
        let n = document.getElementById('inline-menu-fold').parentElement;
        while (n && n !== document.body) {
            const st = getComputedStyle(n);
            if ((st.overflowY === 'auto' || st.overflowY === 'scroll')
                && n.scrollHeight > n.clientHeight + 10) {
                if (!n.id) n.id = 'verify-bk-scroll';
                return n.id;
            }
            n = n.parentElement;
        }
        return null;
    });
    check('スクロールする入れ物が見つかった', Boolean(bkScroll), String(bkScroll));
    const stick = await stickAt('inline-menu-fold', bkScroll);
    console.log('   選ぶところの下まで送ったあと:', JSON.stringify(stick));
    check('要約の行が、上に貼り付いて残る', Boolean(stick && stick.見えている), JSON.stringify(stick));
    const chips = await p.locator('#inline-menu-state .menu-fold-chip').count();
    console.log('   貼り付いた行のアイコン:', chips, '個');
    check('選んだアイコンが行に出ている', chips === 2, `${chips}個`);
    check('合計も一緒に残る',
        (await p.locator('#inline-menu-sum').textContent()).includes('17,500'));

    // **見張りが効くのかは、カルテ側で確かめる**（この節の下のほう）。
    // 予約の画面は入れ物のほうが高く、この位置なら貼り付けが無くても
    // 要約が見えている。そこで外して試しても、何も見ていないのと同じになる。

    console.log('\n=== 2.6 貼り付いた行のアイコンが、横4つで並ぶか（ISSUE-087）');
    // 折り返しに任せると、右の合計が長くなったぶんだけこちらが痩せ、
    // **3行目から2つずつ**になっていた。4列の格子にして、幅を縮ませない。
    // 「＋ 未入力」が付いた長いほうでも確かめる（そこで崩れていた）
    const rowsOf = () => p.evaluate(() => {
        const els = [...document.querySelectorAll('#inline-menu-state .menu-fold-chip')];
        const by = {};
        els.forEach((e) => {
            const y = Math.round(e.getBoundingClientRect().top);
            (by[y] = by[y] || []).push(e.textContent);
        });
        const sum = document.querySelector('#inline-menu-fold > summary');
        return {
            rows: Object.entries(by).sort((a, b) => a[0] - b[0]).map(([, v]) => v.length),
            はみ出し: Math.round(sum.scrollWidth - sum.clientWidth),
            横スクロール: Math.round(
                document.documentElement.scrollWidth - document.documentElement.clientWidth),
        };
    });

    // ぜんぶ押す。金額が「都度」のものも入るので「＋ 未入力」が付く
    const allKeys = await p.locator('#inline-service-categories .service-cat-btn')
        .evaluateAll((els) => els.map((e) => e.dataset.menu));
    for (const k of allKeys) {
        if (['m-repeat', 'm-extend'].includes(k)) continue;   // すでに押してある
        await p.locator(`#inline-service-categories [data-menu="${k}"]`).click();
        await p.waitForTimeout(60);
    }
    const rows = await rowsOf();
    const sumTxt = (await p.locator('#inline-menu-sum').textContent()).trim();
    console.log('   16個選んだとき:', JSON.stringify(rows), '／ 合計:', JSON.stringify(sumTxt));
    check('合計が長いほうで試せている（＋未入力が付いている）',
        sumTxt.includes('未入力'), sumTxt);
    check('最後の行以外は、どこも4つ',
        rows.rows.length > 2 && rows.rows.slice(0, -1).every((n) => n === 4),
        JSON.stringify(rows.rows));
    check('要約の行がはみ出していない', rows.はみ出し <= 1, `${rows.はみ出し}px`);
    check('画面が横にずれていない', rows.横スクロール <= 1, `${rows.横スクロール}px`);

    // 選び直して次の節へ
    for (const k of allKeys) {
        if (['m-repeat', 'm-extend'].includes(k)) continue;
        await p.locator(`#inline-service-categories [data-menu="${k}"]`).click();
        await p.waitForTimeout(50);
    }
    await p.waitForTimeout(300);

    console.log('\n=== 3. 金額がその都度のものは、欄が出るか（ISSUE-081 の穴）');
    // 「都度」の項目は、以前は金額をどこからも入れられなかった
    await p.locator('#inline-service-categories [data-menu="m-item"]').click();
    await p.waitForTimeout(400);
    const t2 = (await p.locator('#inline-menu-total').textContent()).trim();
    console.log('   item を押した直後:', JSON.stringify(t2));
    check('入れ忘れが「無料」に化けていない', t2.includes('未入力'), t2);
    check('金額を入れる欄が出る',
        (await p.locator('#inline-menu-adhoc input').count()) === 1);
    await p.locator('#inline-menu-adhoc input').fill('3000');
    await p.waitForTimeout(400);
    const t3 = (await p.locator('#inline-menu-total').textContent()).trim();
    console.log('   3,000 を入れたあと:', JSON.stringify(t3));
    check('その都度の金額も合計に入る', t3.includes('20,500'), t3);

    console.log('\n=== 4. 下ろした欄が、画面に出ていないか');
    // **閉じた `<details>` の中身は getBoundingClientRect では見分けられない。**
    // Chrome 141 では閉じたままでも高さが返る。checkVisibility() で見る
    check('施術メニューの欄が出ていない', !(await isShown('#inline-record-type')));
    check('🧪 処方の欄が出ていない', !(await isShown('#inline-record-prescription')));
    check('金額の欄が出ていない', !(await isShown('#inline-record-amount')));
    // 入れ物ごと消すと、押した施術内容から来た値の行き先が無くなる
    check('施術メニューの入れ物は残っている', (await p.locator('#inline-record-type').count()) > 0);
    check('🧪 処方の入れ物も残っている', (await p.locator('#inline-record-prescription').count()) > 0);
    check('金額の入れ物も残っている', (await p.locator('#inline-record-amount').count()) > 0);

    console.log('\n=== 5. カルテ側でも同じか（画面は2つある）');
    await p.goto(APP); await p.waitForTimeout(3200);
    await p.evaluate(() => {
        const card = [...document.querySelectorAll('.customer-card-grid-item')]
            .find((el) => el.textContent.includes('山田'));
        if (card) card.click();
    });
    await p.waitForTimeout(1600);
    await p.locator('.detail-subtab-btn[data-tab="visit-calendar"]').click();
    await p.waitForTimeout(1400);
    await p.locator('#personal-calendar-instance .calendar-day:not(.empty):not(.has-event)').first().click();
    await p.waitForTimeout(1400);

    check('カルテ側も畳まれている',
        await p.evaluate(() => !document.getElementById('record-menu-fold').open));
    await p.locator('#record-menu-fold > summary').click();
    await p.waitForTimeout(500);
    const recKeys = await keysIn('#record-service-categories');
    console.log('   カルテの施術内容:', JSON.stringify(recKeys));
    check('カルテ側にも16個そろっている', WANT_MENU.every((k) => recKeys.includes(k)),
        WANT_MENU.filter((k) => !recKeys.includes(k)).join(' / '));
    check('施術メニューの欄が出ていない', !(await isShown('#input-type')));
    check('🧪 処方の欄が出ていない', !(await isShown('#input-prescription')));
    check('金額の欄が出ていない', !(await isShown('#input-amount')));
    check('金額の入れ物は残っている', (await p.locator('#input-amount').count()) > 0);

    // カルテ側でも、アイコンの下まで見たときに要約が残るか（ISSUE-086）
    await p.locator('#record-service-categories [data-menu="m-repeat"]').click();
    await p.waitForTimeout(300);
    const stickRec = await stickAt('record-menu-fold', 'record-form');
    console.log('   カルテ側:', JSON.stringify(stickRec));
    check('カルテ側でも要約が貼り付いて残る',
        Boolean(stickRec && stickRec.見えている), JSON.stringify(stickRec));
    check('カルテ側の行にもアイコンが出る',
        (await p.locator('#record-menu-state .menu-fold-chip').count()) === 1);

    // **この見張りが効くのかを確かめる。**
    // カルテ側は入れ物（495px）より選ぶところ（626px）のほうが高いので、
    // 貼り付けが無ければ確実に上へ抜ける。0件を見て通す形にはしない
    await p.addStyleTag({ content: '.menu-fold > summary { position: static !important; }' });
    await p.evaluate(() => { document.getElementById('record-form').scrollTop = 0; });
    await p.waitForTimeout(300);
    const looseRec = await stickAt('record-menu-fold', 'record-form');
    console.log('   貼り付けを外したとき:', JSON.stringify(looseRec));
    check('貼り付けを外すと、上へ抜ける（見張りが効いている証し）',
        Boolean(looseRec && !looseRec.見えている), JSON.stringify(looseRec));
    await p.evaluate(() => {
        document.querySelectorAll('style').forEach((el) => {
            if (el.textContent.includes('position: static !important')) el.remove();
        });
        document.getElementById('record-form').scrollTop = 0;
    });
    await p.waitForTimeout(300);

    console.log('\n=== 6. 押すと、その施術の書く欄が開くか');
    await p.locator('#record-service-categories [data-menu="m-item"]').click();
    await p.waitForTimeout(900);
    const kartes = (await p.locator('#record-kartes').textContent()).replace(/\s+/g, ' ');
    console.log('   開いた欄:', JSON.stringify(kartes.trim().slice(0, 60)));
    check('🍀 item の欄が開く', kartes.includes('item'), kartes.trim().slice(0, 60));
    check('押していない欄は開かない', !kartes.includes('A.C'), kartes.trim().slice(0, 60));

    console.log('\n=== 7. 書く欄の key が変わっていないか');
    // **key を変えると、既に書かれた記録の区分が黙って消える**
    const fields = await p.evaluate(() => [...document.querySelectorAll('#record-service-categories [data-cat]')]
        .map((el) => el.dataset.cat));
    console.log('   ', JSON.stringify([...new Set(fields)]));
    check('もとからある key がそろっている',
        WANT_FIELDS.every((k) => fields.includes(k)),
        WANT_FIELDS.filter((k) => !fields.includes(k)).join(' / '));

    console.log('\n=== 8. 昔の記録を開いても、金額が化けないか');
    // 昔の記録は menu を持たない。区分から当てずっぽうで引くので、
    // **そこから合計を作り直すと、入っていた金額が消える**
    await p.goto(APP); await p.waitForTimeout(3000);
    await p.evaluate(() => {
        const cs = JSON.parse(localStorage.getItem('therapist_customers') || '[]');
        cs[0].records.unshift({
            id: 'verify-old-1', date: '2026-08-19', time: '10:00 - 11:00',
            type: '初診', amount: 15000, categories: ['counseling', 'color'],
            clientComplaint: '', prescription: '', therapistNote: '',
        });
        localStorage.setItem('therapist_customers', JSON.stringify(cs));
    });
    await p.reload(); await p.waitForTimeout(3200);
    await p.evaluate(() => {
        const c = [...document.querySelectorAll('.customer-card-grid-item')][0];
        if (c) c.click();
    });
    await p.waitForTimeout(1600);
    await p.locator('.detail-subtab-btn[data-tab="visit-type"]').click();
    await p.waitForTimeout(1200);
    await p.locator('.history-item .history-summary').first().click();
    await p.waitForTimeout(400);
    await p.locator('.history-item .btn-edit-record').first().click();
    await p.waitForTimeout(1600);
    const keptAmount = await p.locator('#input-amount').inputValue();
    const foldSum = (await p.locator('#record-menu-sum').textContent()).trim();
    console.log('   入っていた金額:', keptAmount, '／ 行の表示:', JSON.stringify(foldSum));
    check('金額が化けていない（15000のまま）', keptAmount === '15000', keptAmount);
    check('行にも入っていた金額が出る', foldSum.includes('15,000'), foldSum);
    check('区分から引いた施術内容が出ている',
        (await p.locator('#record-menu-state').textContent()).includes('counseling'));

    console.log('\n=== 9. 押したら、そこから作った合計に切り替わるか');
    await p.locator('#btn-toggle-edit-record').click();
    await p.waitForTimeout(700);
    await p.locator('#record-menu-fold > summary').click();
    await p.waitForTimeout(400);
    const lblBefore = (await p.locator('#record-menu-total').locator('xpath=../span[1]').textContent()).trim();
    check('押す前は「前に入っていた金額」と出る', lblBefore.includes('前に入っていた'), lblBefore);
    await p.locator('#record-service-categories [data-menu="m-first"]').click();
    await p.waitForTimeout(500);
    const lblAfter = (await p.locator('#record-menu-total').locator('xpath=../span[1]').textContent()).trim();
    check('押したあとは「合計」に変わる', lblAfter === '合計', lblAfter);
    check('合計が金額の入れ物に入る',
        (await p.locator('#input-amount').inputValue()) === '15000',
        await p.locator('#input-amount').inputValue());

    console.log(ng === 0 ? '\n  ぜんぶ通りました' : `\n  ❌ ${ng} 件だめでした`);
    await b.close();
    process.exit(ng === 0 ? 0 : 1);
})();
