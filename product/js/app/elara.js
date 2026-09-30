// エララ（AE-1α）— 運用者だけが見る画面。
//
// この画面は、アプリのどこからもリンクされていない。設定にも、説明書にも、
// 案内（デモ）にも出てこない。**開き方を知っている人だけが開く。**
// セラピストの手もとには、この画面へ行く道が一本も無い。
//
// なぜ在るのか。
//   カルテは「こう使われるだろう」と考えて作った。実際にどう使われているかは、
//   作った側からは見えない。**設計した姿と、いま動いている姿の差**だけを
//   ここに並べる。それを見て何をするかは、見た人が決める。
//
// していないこと。
//   - 書き換えない。localStorage も IndexedDB も、読むだけ。
//   - 勧めない。「こうしたほうがいい」は書かない。数と、そこにある事実だけ。
//   - 外へ出さない。取り出した先はこのページの中だけで、どこへも送らない。
//
// ページの中に script は書けない（_headers の CSP が止める）。だから
// manual.js と同じく、外に置いた module をひとつ読む形にしてある。

import {
    SERVICE_CATEGORY_DEFS,
    getServiceMenu,
    getLastBackupAt,
} from './data.js';

const CUSTOMERS_KEY = 'therapist_customers';
const ADVICE_SOURCE = 'data/advice/today.json';

/** 台帳をそのまま読む。**getCustomers() は使わない。** */
//
// getCustomers() は、中身が空のときに見本の顧客を書き込む。エララが
// 開かれただけで台帳が生まれてしまうのは、「見るだけ」に反する。
// だから生の値を読んで、読めたものだけを見る。
function readCustomers() {
    let raw = null;
    try {
        raw = localStorage.getItem(CUSTOMERS_KEY);
    } catch (e) {
        return { list: [], state: 'blocked' };
    }
    if (!raw) return { list: [], state: 'empty' };
    try {
        const list = JSON.parse(raw);
        if (!Array.isArray(list)) return { list: [], state: 'broken' };
        return { list, state: 'ok' };
    } catch (e) {
        return { list: [], state: 'broken' };
    }
}

const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const num = (n) => Number(n || 0).toLocaleString('ja-JP');

/** 中身のある字か。空白だけは「書かれていない」とみなす */
const has = (v) => typeof v === 'string' ? v.trim().length > 0
    : Array.isArray(v) ? v.length > 0
    : (v !== null && v !== undefined && v !== '' && v !== false);

const allRecords = (list) => list.reduce((acc, c) => {
    (Array.isArray(c.records) ? c.records : []).forEach((r) => acc.push({ customer: c, record: r }));
    return acc;
}, []);

/** その記録の区分カルテに、字が書かれているか */
const karteWritten = (record, key) => {
    const k = (record && record.kartes && record.kartes[key]) || null;
    return Boolean(k && has(k.note));
};

const daysSince = (iso) => {
    const t = Date.parse(iso || '');
    if (!Number.isFinite(t)) return null;
    return Math.floor((Date.now() - t) / 86400000);
};

/** 「2026-09-01」の形だけを日付として扱う。時刻の欄と混ざらないように */
const recordDay = (record) => {
    const m = String((record && record.date) || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? Date.parse(`${m[1]}-${m[2]}-${m[3]}T00:00:00`) : NaN;
};

// ---------------------------------------------------------------------------
// 見るもの
// ---------------------------------------------------------------------------

/** 顧客ひとりに1つずつある欄。書かれている人数を数える */
const CUSTOMER_FIELDS = [
    { label: '呼び名',              get: (c) => c.nickname },
    { label: 'ふりがな',            get: (c) => c.kana },
    { label: '電話',                get: (c) => c.phone },
    { label: '誕生日',              get: (c) => c.birthday },
    { label: '紹介者',              get: (c) => c.referrer },
    { label: '❤️ memo',             get: (c) => c.initialConsultation },
    { label: '顧客メモ',            get: (c) => c.memo },
    { label: 'ソウルカラー',        get: (c) => c.soulColors },
    { label: '体質・アレルギー',    get: (c) => constitutionSet(c) },
    { label: '初診・本人のこと',    get: (c) => (c.intake || {}).personal },
    { label: '初診・来た理由と目標', get: (c) => (c.intake || {}).reasonGoal },
    { label: '初診・家族のこと',    get: (c) => (c.intake || {}).family },
    { label: '初診・病歴',          get: (c) => (c.intake || {}).history },
    { label: '初診・薬',            get: (c) => (c.intake || {}).medication },
];

/** 体質の欄に何か入っているか。1つでも立っていれば「設定済み」 */
function constitutionSet(customer) {
    const c = (customer && customer.constitution) || {};
    const flags = (c.flags && typeof c.flags === 'object') ? c.flags : {};
    if (Object.keys(flags).some((k) => flags[k])) return true;
    if (Array.isArray(c.allergies) && c.allergies.length) return true;
    if (Array.isArray(c.otherAllergies) && c.otherAllergies.length) return true;
    if (Array.isArray(c.otherFlags) && c.otherFlags.length) return true;
    return typeof c.maxDilution === 'number';
}

/** 1回の記録にある欄。書かれている件数を数える */
const RECORD_FIELDS_WATCHED = [
    { label: '時間',        get: (r) => r.time },
    { label: '訴え',        get: (r) => r.clientComplaint },
    { label: '所見',        get: (r) => r.therapistNote },
    { label: '施術内容',    get: (r) => r.menu },
    { label: '金額',        get: (r) => r.amount !== null && r.amount !== undefined && r.amount !== '' },
    { label: '色',          get: (r) => r.colors },
    { label: 'アドバンス',  get: (r) => r.advanceSet },
    { label: '写真',        get: (r) => r.photos },
    { label: '区分カルテ',  get: (r) => SERVICE_CATEGORY_DEFS.some((d) => karteWritten(r, d.key)) },
    { label: '処方（いまは画面に出していない欄）', get: (r) => r.prescription },
];

// ---------------------------------------------------------------------------
// 画面を組む
// ---------------------------------------------------------------------------

function bar(n, total) {
    const w = total > 0 ? Math.round((n / total) * 100) : 0;
    const cls = w === 0 ? ' zero' : (w < 25 ? ' low' : '');
    return `<div class="bar${cls}"><span style="width:${w}%"></span></div>`;
}

/** 「書かれている / 全部」の一覧。少ないものを上に */
function tallyTable(rows, total, unitLabel) {
    if (total === 0) return '<p class="none">数えるものがありません。</p>';
    const sorted = rows.slice().sort((a, b) => a.n - b.n);
    const body = sorted.map((r) => `
        <tr${r.n === 0 ? ' class="is-zero"' : ''}>
            <th>${esc(r.label)}</th>
            <td class="figure">${num(r.n)} / ${num(total)}</td>
            <td class="figure pct">${total ? Math.round((r.n / total) * 100) : 0}%</td>
            <td class="barcell">${bar(r.n, total)}</td>
        </tr>`).join('');
    return `<table class="tally"><caption>${esc(unitLabel)} ${num(total)} を母数にしています</caption><tbody>${body}</tbody></table>`;
}

function section(id, title, lead, html) {
    return `
    <section class="obs" id="${esc(id)}">
        <h2>${esc(title)}</h2>
        ${lead ? `<p class="lead">${esc(lead)}</p>` : ''}
        ${html}
    </section>`;
}

// --- 1. いま、ここにあるもの ------------------------------------------------

function sectionLedger(list) {
    const pairs = allRecords(list);
    const active = list.filter((c) => !c.isArchived);
    const days = pairs.map(({ record }) => recordDay(record)).filter(Number.isFinite);
    const first = days.length ? new Date(Math.min(...days)) : null;
    const last = days.length ? new Date(Math.max(...days)) : null;
    const fmt = (d) => d ? d.toISOString().slice(0, 10) : '—';
    const within = (n) => days.filter((t) => Date.now() - t <= n * 86400000).length;

    const items = [
        ['顧客', `${num(active.length)}人`, list.length !== active.length ? `休眠 ${num(list.length - active.length)}人を別に持っています` : ''],
        ['記録', `${num(pairs.length)}件`, days.length !== pairs.length ? `うち ${num(pairs.length - days.length)}件は日付が読めません` : ''],
        ['最初の記録', fmt(first), ''],
        ['最後の記録', fmt(last), last ? `${num(daysSince(last.toISOString()))}日前` : ''],
        ['直近30日', `${num(within(30))}件`, ''],
        ['直近90日', `${num(within(90))}件`, ''],
    ];
    const html = `<div class="cards">${items.map(([k, v, note]) => `
        <div class="card">
            <span class="card-key">${esc(k)}</span>
            <span class="card-val">${esc(v)}</span>
            ${note ? `<span class="card-note">${esc(note)}</span>` : ''}
        </div>`).join('')}</div>`;
    return section('ledger', '1. いま、ここにあるもの', '数えたのはこの端末に入っているぶんだけです。', html);
}

// --- 2. 顧客の欄 ------------------------------------------------------------

function sectionCustomerFields(list) {
    const rows = CUSTOMER_FIELDS.map((f) => ({
        label: f.label,
        n: list.filter((c) => has(f.get(c))).length,
    }));
    return section('customer-fields', '2. 顧客の欄が、どれだけ埋まっているか',
        '欄は作ってあります。実際に書かれているかは別のことです。',
        tallyTable(rows, list.length, '顧客（休眠のかたも含む）'));
}

// --- 3. 記録の欄 ------------------------------------------------------------

function sectionRecordFields(list) {
    const pairs = allRecords(list);
    const rows = RECORD_FIELDS_WATCHED.map((f) => ({
        label: f.label,
        n: pairs.filter(({ record }) => has(f.get(record))).length,
    }));
    return section('record-fields', '3. 1回の記録の欄が、どれだけ埋まっているか', '',
        tallyTable(rows, pairs.length, '記録'));
}

// --- 4. 施術内容 ------------------------------------------------------------

function sectionMenu(list) {
    const pairs = allRecords(list);
    const menu = getServiceMenu();
    const withMenu = pairs.filter(({ record }) => Array.isArray(record.menu) && record.menu.length > 0);

    const counts = menu.map((m) => ({
        item: m,
        n: withMenu.filter(({ record }) => record.menu.includes(m.key)).length,
    })).sort((a, b) => b.n - a.n);

    // 押されたことが一度も無いものが混ざるので、0 も必ず出す。
    // 「出てこない＝使われている」と読み違えないため。
    const chips = counts.map(({ item, n }) => `
        <div class="chip${n === 0 ? ' is-zero' : ''}">
            <span class="chip-icon">${esc(item.icon)}</span>
            <span class="chip-name">${esc(item.name)}</span>
            <span class="chip-n">${num(n)}</span>
        </div>`).join('');

    const zero = counts.filter((c) => c.n === 0);
    const note = `
        <p class="figure-note">
            施術内容を持っている記録は ${num(withMenu.length)}件（記録は全部で ${num(pairs.length)}件）。
            ${pairs.length > withMenu.length
                ? `残る ${num(pairs.length - withMenu.length)}件は、施術内容を押して選ぶ形にする前に書かれたものです。ここには入っていません。`
                : ''}
        </p>
        ${zero.length
            ? `<p class="figure-note">一度も押されていないもの ${num(zero.length)}件：${esc(zero.map((z) => z.item.name).join('、'))}</p>`
            : '<p class="figure-note">メニューはすべて一度は押されています。</p>'}`;

    return section('menu', '4. 並べた施術内容のうち、押されたもの',
        'メニューは16件から始めました。いま押されているのはこれだけです。',
        `<div class="chips">${chips}</div>${note}`);
}

// --- 5. 区分カルテ ----------------------------------------------------------

function sectionKartes(list) {
    const pairs = allRecords(list);
    const rows = SERVICE_CATEGORY_DEFS.map((d) => {
        const opened = pairs.filter(({ record }) =>
            Array.isArray(record.categories) && record.categories.includes(d.key)).length;
        const written = pairs.filter(({ record }) => karteWritten(record, d.key)).length;
        const photos = pairs.filter(({ record }) =>
            Array.isArray(record.photos) && record.photos.some((p) => p && p.category === d.key)).length;
        return { d, opened, written, photos };
    }).sort((a, b) => a.written - b.written);

    const body = rows.map(({ d, opened, written, photos }) => `
        <tr${written === 0 ? ' class="is-zero"' : ''}>
            <th><span class="cat-icon">${esc(d.icon)}</span>${esc(d.name)}</th>
            <td class="figure">${num(opened)}</td>
            <td class="figure">${num(written)}</td>
            <td class="figure">${num(photos)}</td>
            <td class="barcell">${bar(written, opened)}</td>
        </tr>`).join('');

    const html = `
        <table class="tally wide">
            <thead><tr><th>区分</th><th class="figure">開いた</th><th class="figure">書いた</th><th class="figure">写真</th><th></th></tr></thead>
            <tbody>${body}</tbody>
        </table>
        <p class="figure-note">
            「開いた」はその区分を選んだ記録の数、「書いた」はその区分の欄に字が入っている記録の数です。
            棒は「開いたうち、書かれた割合」です。
        </p>`;

    return section('kartes', '5. 区分ごとのカルテは、開いたあと書かれているか',
        '区分を押すと、その区分の書く欄が開きます。開いただけで終わっているかどうかを見ています。',
        html);
}

// --- 6. 手が止まっている記録 ------------------------------------------------

const SILENT_LIMIT = 8;

function sectionSilent(list) {
    const pairs = allRecords(list);
    const silent = pairs.filter(({ record }) =>
        !has(record.clientComplaint) &&
        !has(record.therapistNote) &&
        !has(record.prescription) &&
        !has(record.photos) &&
        !has(record.colors) &&
        !SERVICE_CATEGORY_DEFS.some((d) => karteWritten(record, d.key)));

    if (pairs.length === 0) return section('silent', '6. 日付だけがある記録', '', '<p class="none">記録がありません。</p>');
    if (silent.length === 0) {
        return section('silent', '6. 日付だけがある記録', '',
            '<p class="none">ありません。すべての記録に、何かしら書かれています。</p>');
    }

    const sorted = silent.slice().sort((a, b) => (recordDay(b.record) || 0) - (recordDay(a.record) || 0));
    const rows = sorted.slice(0, SILENT_LIMIT).map(({ customer, record }) => `
        <tr>
            <td class="figure">${esc(record.date || '日付なし')}</td>
            <th>${esc(customer.name || '（名前なし）')}</th>
            <td>${esc(record.type || '')}</td>
        </tr>`).join('');

    const html = `
        <p class="figure-note">${num(silent.length)}件（記録 ${num(pairs.length)}件のうち ${Math.round((silent.length / pairs.length) * 100)}%）。新しいほうから ${num(Math.min(SILENT_LIMIT, silent.length))}件：</p>
        <table class="tally wide"><tbody>${rows}</tbody></table>`;

    return section('silent', '6. 日付だけがある記録',
        '来たことは残っているが、訴えも所見も写真も色も、何も入っていないものです。',
        html);
}

// --- 7. 人のこと ------------------------------------------------------------

const PACE_LIMIT = 10;

function sectionPace(list) {
    const active = list.filter((c) => !c.isArchived);
    const out = [];

    active.forEach((c) => {
        const days = (Array.isArray(c.records) ? c.records : [])
            .map(recordDay).filter(Number.isFinite).sort((a, b) => a - b);
        if (days.length === 0) return;
        const gap = Math.floor((Date.now() - days[days.length - 1]) / 86400000);
        if (days.length === 1) {
            if (gap >= 60) out.push({ c, gap, pace: null, kind: 'once' });
            return;
        }
        // その人自身のふだんの間隔と比べる。人によって元の頻度が違うため、
        // 全体の平均と比べても意味がない。
        const pace = Math.round((days[days.length - 1] - days[0]) / (days.length - 1) / 86400000);
        if (pace > 0 && gap >= 30 && gap >= pace * 2) out.push({ c, gap, pace, kind: 'slow' });
    });

    if (out.length === 0) {
        return section('pace', '7. 間があいている人', '',
            '<p class="none">ふだんの間隔から離れている人は、いません。</p>');
    }

    out.sort((a, b) => b.gap - a.gap);
    const rows = out.slice(0, PACE_LIMIT).map(({ c, gap, pace, kind }) => `
        <tr>
            <th>${esc(c.name || '（名前なし）')}</th>
            <td class="figure">${num(gap)}日</td>
            <td>${kind === 'once'
                ? '来たのは1回だけ'
                : `ふだんは ${num(pace)}日おき（記録 ${num((c.records || []).length)}件）`}</td>
        </tr>`).join('');

    const html = `
        <p class="figure-note">${num(out.length)}人。空いている順に ${num(Math.min(PACE_LIMIT, out.length))}人：</p>
        <table class="tally wide"><tbody>${rows}</tbody></table>`;

    return section('pace', '7. 間があいている人',
        'その人自身のふだんの間隔と比べて、倍以上あいている人です。理由までは分かりません。',
        html);
}

// --- 8. 運用の様子 ----------------------------------------------------------

function storageBytes() {
    let total = 0;
    try {
        for (let i = 0; i < localStorage.length; i += 1) {
            const k = localStorage.key(i);
            if (!k || k.indexOf('therapist_') !== 0) continue;
            total += k.length + (localStorage.getItem(k) || '').length;
        }
    } catch (e) {
        return null;
    }
    return total * 2;   // UTF-16。おおよその目安
}

function sectionOperation(list) {
    const pairs = allRecords(list);
    const photoCount = pairs.reduce((n, { record }) =>
        n + (Array.isArray(record.photos) ? record.photos.length : 0), 0);

    const backup = getLastBackupAt();
    const backupDays = daysSince(backup);
    const bytes = storageBytes();

    const items = [
        ['控えを取った日', backup ? backup.slice(0, 10) : 'まだ一度もありません',
            backupDays === null ? '' : `${num(backupDays)}日前`],
        ['写真の控え', `${num(photoCount)}枚`, '実物は端末の中（IndexedDB）にあります'],
        ['この端末が持っている量', bytes === null ? '読めません' : `${(bytes / 1024 / 1024).toFixed(2)} MB`,
            'localStorage の therapist_ で始まるものだけ'],
        ['星詠み', '読み込み中…', '', 'advice'],
    ];

    const html = `<div class="cards">${items.map(([k, v, note, id]) => `
        <div class="card"${id ? ` id="card-${esc(id)}"` : ''}>
            <span class="card-key">${esc(k)}</span>
            <span class="card-val">${esc(v)}</span>
            ${note ? `<span class="card-note">${esc(note)}</span>` : ''}
        </div>`).join('')}</div>`;

    return section('operation', '8. 動かしかたの様子', '', html);
}

/** 星詠みの中身がいつのものか。取れなければ、取れなかったと書く */
async function fillAdvice() {
    const card = document.getElementById('card-advice');
    if (!card) return;
    const val = card.querySelector('.card-val');
    const note = card.querySelector('.card-note');
    const put = (v, n) => {
        if (val) val.textContent = v;
        if (n && !note) card.insertAdjacentHTML('beforeend', `<span class="card-note">${esc(n)}</span>`);
        else if (n && note) note.textContent = n;
    };
    try {
        const res = await fetch(ADVICE_SOURCE, { cache: 'no-store' });
        if (!res.ok) { put('読めません', `${res.status} が返りました`); return; }
        const json = await res.json();
        const d = daysSince(json.generatedAtISO);
        put(String(json.generatedAtISO || '').slice(0, 10) || '日付がありません',
            d === null ? '' : `${num(d)}日前に作られたもの`);
    } catch (e) {
        put('読めません', 'この置き場からは取れませんでした');
    }
}

// ---------------------------------------------------------------------------

function render() {
    const host = document.getElementById('elara-body');
    if (!host) return;

    const { list, state } = readCustomers();

    if (state !== 'ok') {
        const said = {
            empty:   'この端末には、まだ台帳がありません。',
            blocked: 'この端末では localStorage が読めません。',
            broken:  '台帳は在りますが、形が読み取れませんでした。',
        }[state] || '読めませんでした。';
        host.innerHTML = `<section class="obs"><h2>見えているもの</h2><p class="none">${esc(said)}</p></section>`;
        return;
    }

    host.innerHTML = [
        sectionLedger(list),
        sectionCustomerFields(list),
        sectionRecordFields(list),
        sectionMenu(list),
        sectionKartes(list),
        sectionSilent(list),
        sectionPace(list),
        sectionOperation(list),
        `<p class="closing">以上です。どうするかは決めていません。</p>`,
    ].join('');

    fillAdvice();
}

render();
