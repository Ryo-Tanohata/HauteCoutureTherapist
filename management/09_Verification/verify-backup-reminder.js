// 控えを忘れていることが、ちゃんと伝わるか。
//
// 置き場が壊れたときに残るのは端末の中のぶんだけ。
// 悪意より事故のほうが確率は高いので、ここは「うるさすぎず、忘れさせない」を見る。
const { chromium } = require('playwright');
const SITE = 'http://127.0.0.1:8900/product/index.html';
const ok = (c) => (c ? '✅' : '❌');
let ng = 0;
const check = (label, cond, extra = '') => { if (!cond) ng += 1; console.log(`  ${label}:`, ok(cond), extra); };

const openApp = async (b, setup) => {
    const p = await (await b.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
    p.on('pageerror', (e) => { console.log('  ERR', e.message); ng += 1; });
    await p.goto(SITE); await p.waitForTimeout(2500);
    if (setup) { await p.evaluate(setup); await p.reload(); await p.waitForTimeout(3500); }
    return p;
};
const openSettings = async (p) => {
    await p.locator('#btn-view-color-settings').click(); await p.waitForTimeout(900);
};
const reminderText = (p) => p.locator('#backup-reminder').innerText().catch(() => '');
// トーストは消えても文字が残るので、テキストで見る
const toastText = (p) => p.locator('#toast-message').innerText().catch(() => '');

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

    console.log('=== 1. 一度も取っていないとき');
    const A = await openApp(b, () => {
        localStorage.removeItem('therapist_last_backup_at');
        localStorage.removeItem('therapist_backup_nag_on');
    });
    const t1 = await toastText(A);
    console.log('   出たもの:', JSON.stringify(t1.slice(0, 60)));
    check('開いたときに知らせる', t1.includes('控え'));
    await openSettings(A);
    const r1 = await reminderText(A);
    console.log('   設定画面:', JSON.stringify(r1.slice(0, 60)));
    check('設定画面にも出る', r1.includes('まだ一度も控えを取っていません'));

    console.log('\n=== 2. 同じ日に開き直しても、二度は出さない');
    await A.reload(); await A.waitForTimeout(3500);
    check('その日はもう出ない', !(await toastText(A)).includes('控え'));

    console.log('\n=== 3. 取ってすぐなら、催促しない');
    const C = await openApp(b, () => {
        localStorage.setItem('therapist_last_backup_at', new Date().toISOString());
        localStorage.removeItem('therapist_backup_nag_on');
    });
    check('開いたときに出ない', !(await toastText(C)).includes('控えを'));
    await openSettings(C);
    const r3 = await reminderText(C);
    console.log('   設定画面:', JSON.stringify(r3.slice(0, 60)));
    check('最後に取った日だけ出る', r3.includes('最後に控えを取ったのは'));

    console.log('\n=== 4. 20日たったら、また知らせる');
    const D = await openApp(b, () => {
        const d = new Date(); d.setDate(d.getDate() - 20);
        localStorage.setItem('therapist_last_backup_at', d.toISOString());
        localStorage.removeItem('therapist_backup_nag_on');
    });
    const t4 = await toastText(D);
    console.log('   出たもの:', JSON.stringify(t4.slice(0, 60)));
    check('開いたときに知らせる', t4.includes('20日'));
    await openSettings(D);
    check('設定画面にも日数が出る', (await reminderText(D)).includes('20日'));

    console.log('\n=== 5. 書き出したら、その場で催促が消えるか');
    const dl = D.waitForEvent('download', { timeout: 20000 }).catch(() => null);
    await D.locator('#btn-export-data').click();
    const file = await dl;
    console.log('   書き出したファイル:', file ? file.suggestedFilename() : '(取れず)');
    check('ファイルが出てくる', Boolean(file));
    await D.waitForTimeout(1500);
    const r5 = await reminderText(D);
    console.log('   設定画面:', JSON.stringify(r5.slice(0, 60)));
    check('催促が消える', !r5.includes('たっています'));
    check('取った日が出る', r5.includes('最後に控えを取ったのは'));

    console.log('\n=== 6. 中身が空の端末では、急かさない');
    const E = await openApp(b, () => {
        localStorage.setItem('therapist_customers', '[]');
        localStorage.removeItem('therapist_last_backup_at');
        localStorage.removeItem('therapist_backup_nag_on');
    });
    await openSettings(E);
    const n = await E.evaluate(() => JSON.parse(localStorage.getItem('therapist_customers') || '[]').length);
    if (n > 0) {
        console.log('   （見本データが入り直したので、この確認は飛ばす）');
    } else {
        check('守るものが無ければ出さない', !(await reminderText(E)).includes('控え'));
    }

    console.log(ng === 0 ? '\n  ぜんぶ通りました' : `\n  ❌ ${ng} 件だめでした`);
    await b.close();
    process.exit(ng === 0 ? 0 : 1);
})();
