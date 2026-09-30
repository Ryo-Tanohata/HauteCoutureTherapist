// 「取りこぼしの窓」を、実際に起こして測る。
//
// 同期は ①読む → ②突き合わせる → ③書き戻す の順。
// A が①を終えてから③に入るまでの間に B が書き戻すと、
// A の③で B のぶんが置き場から消える——はず。本当にそうか。
// そして、そのあと直るのか。直らない場合はあるのか。
const { chromium } = require('playwright');
const URL = 'http://127.0.0.1:8899/product/index.html';
const PASS = 'ラベンダーと海と山のあいだ';
const ok = (c) => (c ? '✅' : '❌');
let ng = 0;
const check = (label, cond, extra = '') => { if (!cond) ng += 1; console.log(`  ${label}:`, ok(cond), extra); };

// 置き場は Node 側に1つだけ置き、2台から触らせる（本番と同じ形）
const store = { data: null, photos: {} };
const log = [];

const install = async (p, label) => {
    await p.exposeFunction('__srvGet', async (what, id) => {
        log.push({ t: Date.now(), who: label, op: 'GET ' + what });
        if (what === 'data') return store.data;
        if (what === 'photos') return Object.keys(store.photos);
        if (what === 'photo') return store.photos[id] || null;
        return null;
    });
    await p.exposeFunction('__srvPut', async (what, id, arr) => {
        log.push({ t: Date.now(), who: label, op: 'PUT ' + what });
        if (what === 'data') store.data = arr;
        else if (what === 'photo') store.photos[id] = arr;
        return true;
    });
    // A の書き戻しだけ、合図があるまで待たせる関門
    await p.exposeFunction('__gate', async () => {
        while (globalThis.__hold === label) await new Promise((r) => setTimeout(r, 50));
        return true;
    });
    await p.addInitScript(() => {
        const realFetch = window.fetch.bind(window);
        window.fetch = async (url, opts = {}) => {
            const u = String(url);
            if (u.indexOf('/api/sync') === -1) return realFetch(url, opts);
            const q = new URLSearchParams(u.split('?')[1] || '');
            const what = q.get('what'); const id = q.get('id');
            const m = (opts.method || 'GET').toUpperCase();
            if (what === 'ping') return new Response(JSON.stringify({ ok: true }), { status: 200 });
            if (m === 'GET') {
                const v = await window.__srvGet(what, id);
                if (what === 'photos') return new Response(JSON.stringify({ ids: v || [] }), { status: 200 });
                if (!v) return new Response('', { status: 404 });
                return new Response(new Uint8Array(v), { status: 200 });
            }
            if (what === 'data') await window.__gate();          // ここで足止めする
            await window.__srvPut(what, id, Array.from(new Uint8Array(opts.body)));
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
        };
    });
};

const seed = () => {
    localStorage.clear();
    const iso = '2026-08-01T00:00:00.000Z';
    localStorage.setItem('therapist_customers', JSON.stringify([{
        id: 'c1', customerNo: 'C-0001', name: 'Julie', nickname: '', kana: '', birthday: '1990-01-01',
        soulColors: ['1-red'], status: 'active', createdAt: '2026-01-01T00:00:00.000Z', updatedAtISO: iso,
        records: [{ id: 'r1', date: '2026-08-01', time: '10:00', type: 'アロマ', amount: 9000,
            clientComplaint: '', prescription: '', therapistNote: '', updatedAtISO: iso, fieldsAtISO: {} }]
    }]));
};

const openDevice = async (b, label) => {
    const p = await (await b.newContext({ viewport: { width: 1000, height: 900 } })).newPage();
    p.on('pageerror', (e) => { console.log(`  ERR(${label})`, e.message); ng += 1; });
    await install(p, label);
    await p.goto(URL); await p.waitForTimeout(800);
    await p.evaluate(seed);
    await p.reload(); await p.waitForTimeout(2000);
    return p;
};
const connect = async (p) => {
    await p.locator('#btn-view-color-settings').click(); await p.waitForTimeout(900);
    await p.locator('#input-salon-pass').fill(PASS);
    await p.locator('#btn-salon-connect').click(); await p.waitForTimeout(6000);
};
const syncNow = async (p) => {
    await p.locator('#btn-view-color-settings').click(); await p.waitForTimeout(600);
    await p.locator('#btn-salon-sync').click();
};
const addRec = (p, id, note) => p.evaluate(async ([id, note]) => {
    const m = await import('./js/app/data.js');
    m.addRecord('c1', '2026-08-05', '追加した施術', 5000, '11:00', '', '', note);
    // id を固定して、どちらのぶんか分かるようにする
    const cs = JSON.parse(localStorage.getItem('therapist_customers'));
    cs[0].records[0].id = id;
    localStorage.setItem('therapist_customers', JSON.stringify(cs));
}, [id, note]);
// 端末には見本の客も混ざるので、Julie（c1）だけを見る
const ids = (p) => p.evaluate(() => {
    const cs = JSON.parse(localStorage.getItem('therapist_customers') || '[]');
    const c = cs.find((x) => x.id === 'c1');
    return c ? (c.records || []).map((r) => r.id).sort() : ['(Julie が居ない)'];
});

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    globalThis.__hold = null;

    const A = await openDevice(b, 'A');
    await connect(A);
    const B = await openDevice(b, 'B');
    await connect(B);

    console.log('=== 0. ふだんの同期で、①と③の間はどれくらい空くか');
    log.length = 0;
    await syncNow(A); await A.waitForTimeout(4000);
    const g = log.filter((x) => x.who === 'A');
    const t0 = g.find((x) => x.op === 'GET data');
    const t1 = g.find((x) => x.op === 'PUT data');
    console.log('  ①読む → ③書き戻す:', t0 && t1 ? `${t1.t - t0.t}ms` : '(測れず)');

    console.log('\n=== 1. A の書き戻しを止めている間に、B が書いて同期する');
    await addRec(A, 'rA', 'Aで書いた');
    await addRec(B, 'rB', 'Bで書いた');
    console.log('  A の手元:', JSON.stringify(await ids(A)));
    console.log('  B の手元:', JSON.stringify(await ids(B)));

    globalThis.__hold = 'A';               // A の③を足止め
    await syncNow(A);                      // A が①を済ませ、③の手前で止まる
    await A.waitForTimeout(2500);
    await syncNow(B); await B.waitForTimeout(4000);   // その間に B が丸ごと1周する
    const midway = await B.evaluate(() => null);
    console.log('  （この時点で置き場には B のぶんが入っている）');
    globalThis.__hold = null;              // A の③を通す
    await A.waitForTimeout(4000);

    // 置き場の中身を、第三の端末で読んで確かめる
    const C = await openDevice(b, 'C');
    await connect(C);
    const inStore = await ids(C);
    console.log('  置き場にあるもの:', JSON.stringify(inStore));
    const lost = !inStore.includes('rB');
    check('取りこぼしが起きる（B のぶんが置き場から消える）', lost,
        lost ? '← 起きた' : '← 起きなかった');
    check('B の手元には残っている', (await ids(B)).includes('rB'));

    console.log('\n=== 2. そのあと B がもう一度同期すると、直るか');
    await syncNow(B); await B.waitForTimeout(4000);
    const D = await openDevice(b, 'D');
    await connect(D);
    const healed = await ids(D);
    console.log('  置き場にあるもの:', JSON.stringify(healed));
    check('B のぶんが戻る', healed.includes('rB'));
    check('A のぶんも残っている', healed.includes('rA'));

    console.log('\n=== 3. B がそのまま閉じたら、どうなるか');
    console.log('  → B の端末にだけ残り、置き場にも A にも無い状態が続く。');
    console.log('    B を開いて同期するまで直らない（上の 2. がその瞬間）。');

    // ここからが本題。窓の中で「消した」場合はどうなるか。
    console.log('\n=== 4. 窓の中で「消した」とき（サロンで起きたのはこれ）');
    store.data = null; store.photos = {};
    const E = await openDevice(b, 'E');   // 足止めされる側（label が A でないので通す）
    await connect(E);
    const F = await openDevice(b, 'F');
    await connect(F);
    await addRec(E, 'rX', '消される記録');
    await syncNow(E); await E.waitForTimeout(4000);
    await syncNow(F); await F.waitForTimeout(4000);
    console.log('  はじめの状態  E:', JSON.stringify(await ids(E)), ' F:', JSON.stringify(await ids(F)));

    // E が読んでから書き戻すまでの間に、F が消して同期する
    globalThis.__hold = 'E';               // E の③を足止め
    await E.evaluate(async () => {
        const m = await import('./js/app/data.js');
        m.addRecord('c1', '2026-08-06', 'Eで足した', 3000, '12:00', '', '', '');
    });
    await F.evaluate(async () => {
        const m = await import('./js/app/data.js');
        m.deleteRecord('c1', 'rX');
    });
    await E.waitForTimeout(2500);          // E は③の手前で止まっている
    await F.waitForTimeout(300);
    await syncNow(F); await F.waitForTimeout(4000);
    console.log('  F が消したあと F:', JSON.stringify(await ids(F)));

    const G = await openDevice(b, 'G');
    await connect(G);
    console.log('  置き場にあるもの:', JSON.stringify(await ids(G)));
    check('F が消したものは置き場からも消えている', !(await ids(G)).includes('rX'));

    // 消したことを知らない E が、あとから書き戻す
    globalThis.__hold = null;              // E の③を通す
    await E.waitForTimeout(4000);
    const H = await openDevice(b, 'H');
    await connect(H);
    const afterE = await ids(H);
    console.log('  E が書き戻したあとの置き場:', JSON.stringify(afterE));
    const revived = afterE.includes('rX');
    check('E の書き戻しで生き返らない', !revived, revived ? '← 生き返った' : '');

    await syncNow(F); await F.waitForTimeout(4000);
    const I = await openDevice(b, 'I');
    await connect(I);
    const afterF = await ids(I);
    console.log('  そのあと F がもう一度同期:', JSON.stringify(afterF));
    check('F が同期すれば消えた状態に戻る', !afterF.includes('rX'));

    console.log(ng === 0 ? '\n  想定どおりでした' : `\n  ❌ ${ng} 件、想定と違いました`);
    await b.close();
    process.exit(0);
})();
