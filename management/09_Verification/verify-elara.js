// エララの画面（product/elara.html）。
//
// 見るのは4つ。
//   ① アプリのどこからもここへリンクが無いこと（これが本題）
//   ② 台帳を読んで、8つの節が出ること
//   ③ **何も書き換えないこと**（localStorage が開く前と1文字も変わらない）
//   ④ CSP（本番と同じヘッダ）の下で、script が止められずに動くこと
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:8900/product';
const ROOT = path.resolve(__dirname, '../..');
const ok = (c) => (c ? '✅' : '❌');
let ng = 0;
const check = (l, c, e = '') => { if (!c) ng += 1; console.log(`  ${l}:`, ok(c), e); };

const SECTIONS = ['ledger', 'customer-fields', 'record-fields', 'menu', 'kartes', 'silent', 'pace', 'operation'];

/** product 以下の、elara.js 自身を除いた全ファイルを見る */
function filesUnder(dir, out = []) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) filesUnder(full, out);
        else out.push(full);
    });
    return out;
}

(async () => {
    // --- ① どこからもリンクされていないこと -------------------------------
    // 消し忘れではなく「置いていない」ことを、実物のファイルで確かめる。
    // ここが破れると、セラピストの画面にエララへの入口が生えることになる。
    const SELF = ['product/js/app/elara.js', 'product/elara.html'];
    const suspects = filesUnder(path.join(ROOT, 'product'))
        .filter((f) => /\.(html|js|md|json|css)$/.test(f))
        .filter((f) => !SELF.includes(path.relative(ROOT, f)))
        .filter((f) => !f.includes(`${path.sep}vendor${path.sep}`))
        .filter((f) => /elara/i.test(fs.readFileSync(f, 'utf8')))
        .map((f) => path.relative(ROOT, f));
    check('アプリ側にエララへの参照が無い', suspects.length === 0, suspects.join(', '));

    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    // --- 台帳を用意する。まずアプリを開いて見本を入れさせる ----------------
    await p.goto(`${BASE}/index.html`);
    await p.waitForTimeout(3000);

    // 空の記録を1件混ぜる。「日付だけがある記録」の節を、
    // 一度も通らないまま ✅ にしないため。
    await p.evaluate(() => {
        const cs = JSON.parse(localStorage.getItem('therapist_customers') || '[]');
        if (!cs[0]) return;
        cs[0].records = cs[0].records || [];
        cs[0].records.push({
            id: 'elara-empty-1', date: '2026-04-01', time: '10:00 - 11:00',
            categories: ['counseling'], colors: [], photos: [],
            clientComplaint: '', prescription: '', therapistNote: '', kartes: {},
        });
        localStorage.setItem('therapist_customers', JSON.stringify(cs));
    });

    // --- ③ の前準備。開く前の中身を丸ごと控える --------------------------
    const before = await p.evaluate(() => {
        const out = {};
        for (let i = 0; i < localStorage.length; i += 1) {
            const k = localStorage.key(i);
            out[k] = localStorage.getItem(k);
        }
        return out;
    });

    // --- ②④ エララを開く --------------------------------------------------
    // ここから先だけを見る。アプリ側（index.html）が出したものを混ぜると、
    // エララと関係のない失敗でここが赤くなる。
    errors.length = 0;
    await p.goto(`${BASE}/elara.html`);
    await p.waitForTimeout(1500);

    check('CSP に止められず動いた', errors.length === 0, errors.slice(0, 2).join(' / '));
    check('「読み込んでいます」のまま止まっていない',
        !(await p.locator('#elara-body > .none').first().isVisible().catch(() => false))
        || (await p.locator('section.obs').count()) > 0);

    for (const id of SECTIONS) {
        const el = p.locator(`section#${id}`);
        const shown = await el.count() === 1 && await el.first().isVisible();
        check(`節 ${id} が出ている`, shown);
    }

    // 数が実際に入っていること。節だけ出て中身が空だと意味がない
    const ledger = await p.locator('#ledger .card-val').allTextContents();
    check('台帳の数が入っている', ledger.length >= 6 && /\d/.test(ledger[0] || ''), ledger.slice(0, 2).join(' / '));

    const menuChips = await p.locator('#menu .chip').count();
    check('施術内容が16件以上並んでいる', menuChips >= 16, `${menuChips}件`);

    const silentText = await p.locator('#silent').innerText();
    check('空の記録を拾えている', /2026-04-01/.test(silentText), silentText.slice(0, 60).replace(/\n/g, ' '));

    const kartesRows = await p.locator('#kartes tbody tr').count();
    check('区分カルテが10行ある', kartesRows === 10, `${kartesRows}行`);

    // 星詠みは fetch で後から入る
    await p.waitForTimeout(1200);
    const advice = await p.locator('#card-advice .card-val').innerText();
    check('星詠みの日付が入った', advice !== '読み込み中…', advice);

    // --- ③ 書き換えていないこと -------------------------------------------
    const after = await p.evaluate(() => {
        const out = {};
        for (let i = 0; i < localStorage.length; i += 1) {
            const k = localStorage.key(i);
            out[k] = localStorage.getItem(k);
        }
        return out;
    });
    const keysBefore = Object.keys(before).sort();
    const keysAfter = Object.keys(after).sort();
    const changed = keysAfter.filter((k) => before[k] !== after[k]);
    const added = keysAfter.filter((k) => !(k in before));
    check('鍵が増えていない', added.length === 0, added.join(', '));
    check('中身が1文字も変わっていない', changed.length === 0, changed.join(', '));
    check('鍵が減ってもいない', keysBefore.length === keysAfter.length);
    check('比べる中身があった（空回りしていない）', keysBefore.length >= 2, `${keysBefore.length}個`);

    await b.close();
    console.log(ng === 0 ? '\n✅ すべて通りました' : `\n❌ ${ng}件 だめでした`);
    process.exit(ng === 0 ? 0 : 1);
})();
