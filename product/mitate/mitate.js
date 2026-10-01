// くらしの見立て
//
// 聞き取ったこと（その方の話・食べたもの・体質）と、今日の材料（空・天気・季節・旬）を
// ひとつの依頼文にまとめ、セラピストご自身の Claude に渡す。
//
// ── 守っていること ──
// ・書いたものは、この端末の localStorage にだけ置く。置き場（サーバー）には送らない
// ・本名は聞かない。依頼文に入るのはお呼び名だけ
// ・精油は、Terre Mer KARTE と同じ oil-safety で先に絞り、残った候補だけを渡す
//   （禁忌の判断を AI にさせない）
// ・食べ物のアレルギーは「出してはいけないもの」として依頼文の頭に置く

import {
    CONSTITUTION_FLAGS, ALLERGY_FAMILIES, OIL_SAFETY, filterOils
} from '../js/app/oil-safety.js';
import { seasonFor } from './seasons.js';

const STORE_KEY = 'mitate.draft.v1';
const HISTORY_KEY = 'mitate.history.v1';
const ADVICE_URL = '../data/advice/today.json';

// ── 選ぶもの ─────────────────────────────────────────────
const CHOICES = {
    parts: ['首', '肩', '背中', '腰', 'お腹', '頭', '脚', '目', '眠り', '気持ち'],
    foodStyle: ['オーガニック', '国産・産地を選ぶ', '旬のもの', '発酵食品', '和食が中心', '外食が多い', '甘いものが好き', 'お酒をよく飲む'],
    // 体質：安全の絞り込みに効くもの（oil-safety の項目）＋ 見立ての話に使うもの
    body: [
        { key: 'cold', label: '冷えやすい' },
        { key: 'heat', label: '暑がり・のぼせやすい' },
        { key: 'dry', label: '乾燥しやすい' },
        { key: 'swell', label: 'むくみやすい' },
        ...CONSTITUTION_FLAGS.map((f) => ({ key: f.key, label: f.label, safety: true }))
    ],
    oilAllergy: ALLERGY_FAMILIES.map((f) => ({ key: f.key, label: f.label })),
    foodAllergy: ['貝類', '甲殻類（えび・かに）', '魚卵', '小麦', '卵', '乳', 'そば', '落花生', '大豆', 'くるみ']
};

const $ = (id) => document.getElementById(id);

// ── 下書き（この端末だけ） ──────────────────────────────────
const blank = () => ({
    who: '', talk: '', ate: '', area: '', birth: '',
    parts: [], foodStyle: [], body: [], oilAllergy: [], foodAllergy: []
});

function load(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
        return fallback;
    }
}
function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 残せなくても使える */ }
}

let draft = Object.assign(blank(), load(STORE_KEY, {}));
let advice = null;

// ── 選ぶ札 ───────────────────────────────────────────────
function renderChips() {
    document.querySelectorAll('[data-chips]').forEach((host) => {
        const name = host.dataset.chips;
        host.innerHTML = '';
        CHOICES[name].forEach((c) => {
            const key = typeof c === 'string' ? c : c.key;
            const label = typeof c === 'string' ? c : c.label;
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'chip';
            b.textContent = label;
            b.setAttribute('aria-pressed', draft[name].includes(key) ? 'true' : 'false');
            b.addEventListener('click', () => {
                const on = draft[name].includes(key);
                draft[name] = on ? draft[name].filter((k) => k !== key) : [...draft[name], key];
                b.setAttribute('aria-pressed', on ? 'false' : 'true');
                save(STORE_KEY, draft);
            });
            host.appendChild(b);
        });
    });
}

const FIELDS = [['f-who', 'who'], ['f-talk', 'talk'], ['f-ate', 'ate'], ['f-area', 'area'], ['f-birth', 'birth']];

function fillFields() {
    FIELDS.forEach(([id, k]) => { $(id).value = draft[k] || ''; });
}

function bindFields() {
    FIELDS.forEach(([id, k]) => {
        const el = $(id);
        el.addEventListener('input', () => { draft[k] = el.value; save(STORE_KEY, draft); });
    });
}

const labelOf = (name, key) => {
    const c = CHOICES[name].find((x) => (typeof x === 'string' ? x : x.key) === key);
    return c ? (typeof c === 'string' ? c : c.label) : key;
};

// ── 手順の切り替え ─────────────────────────────────────────
function go(step) {
    document.querySelectorAll('.panel').forEach((p) => { p.hidden = p.dataset.panel !== String(step); });
    document.querySelectorAll('.step').forEach((s) => {
        if (s.dataset.step === String(step)) s.setAttribute('aria-current', 'step');
        else s.removeAttribute('aria-current');
    });
    if (step === 2) renderMaterial();
    if (step === 3) renderMitate();
    window.scrollTo(0, 0);
}

// ── 今日の材料 ─────────────────────────────────────────────
const stripMd = (t) => String(t).replace(/\*\*/g, '').replace(/^[-*]\s*/, '').trim();

/** 星詠みの「【0. 今日の空と体調】」の箇条を取り出す */
function skyLines(text) {
    const m = String(text || '').match(/【0\.[^】]*】([\s\S]*?)(?:\n###|\n## |$)/);
    if (!m) return [];
    return m[1].split('\n').map((l) => l.trim()).filter((l) => /^[-*]\s/.test(l)).map(stripMd);
}

async function loadAdvice() {
    try {
        const res = await fetch(ADVICE_URL, { cache: 'no-cache' });
        if (!res.ok) throw new Error(String(res.status));
        advice = await res.json();
    } catch (e) {
        advice = null;
    }
}

const fmtDate = (d) => `${d.getMonth() + 1}月${d.getDate()}日（${'日月火水木金土'[d.getDay()]}）`;

function renderMaterial() {
    const today = new Date();
    $('mat-date').textContent = `${fmtDate(today)}の材料`;
    const sky = $('mat-sky');
    sky.innerHTML = '';
    const lines = advice ? skyLines(advice.advice) : [];
    if (lines.length) {
        lines.forEach((l) => { const li = document.createElement('li'); li.textContent = l; sky.appendChild(li); });
        $('mat-updated').textContent = advice.generatedAt ? `${advice.generatedAt} 更新` : '';
    } else {
        const li = document.createElement('li');
        li.className = 'muted';
        li.textContent = '今日の星詠みが読めませんでした。空と天気は Claude に調べてもらいます。';
        sky.appendChild(li);
    }
    const s = seasonFor(today);
    $('mat-season').textContent = `薬膳の考え方では、いまは${s.season}、五行の「${s.element.name}」。受け持ちは${s.element.organ}、味は${s.element.taste}、色は${s.element.color}。`;
    $('mat-season-note').textContent = `${s.element.note}（よく挙がる食材：${s.element.foods}）`;
    const foods = $('mat-foods');
    foods.innerHTML = '';
    s.foods.forEach((f) => { const t = document.createElement('span'); t.className = 'tag'; t.textContent = f; foods.appendChild(t); });
    const src = $('mat-sources');
    src.innerHTML = '';
    if (advice && Array.isArray(advice.sources) && advice.sources.length) {
        const h = document.createElement('div');
        h.className = 'muted';
        h.textContent = '参考にしたページ（星詠み）';
        src.appendChild(h);
        advice.sources.slice(0, 6).forEach((x) => {
            if (!x || !/^https:\/\//.test(x.url || '')) return;
            const a = document.createElement('a');
            a.href = x.url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = x.title || x.url;
            src.appendChild(a);
        });
    }
}

// ── 星座（生年月日から太陽星座だけ。細かい出生図は Claude に任せない） ──
const SIGNS = [
    ['山羊座', 1, 19], ['水瓶座', 2, 18], ['魚座', 3, 20], ['牡羊座', 4, 19], ['牡牛座', 5, 20], ['双子座', 6, 21],
    ['蟹座', 7, 22], ['獅子座', 8, 22], ['乙女座', 9, 22], ['天秤座', 10, 23], ['蠍座', 11, 22], ['射手座', 12, 21]
];
function sunSign(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return '';
    const mon = Number(m[2]);
    const day = Number(m[3]);
    const [name, , last] = SIGNS[mon - 1];
    if (day <= last) return name;
    return SIGNS[mon % 12][0];
}

// ── 精油の絞り込み ─────────────────────────────────────────
function oilChoice() {
    const flags = {};
    draft.body.forEach((k) => { if (CONSTITUTION_FLAGS.some((f) => f.key === k)) flags[k] = true; });
    const customer = { constitution: { flags, allergies: draft.oilAllergy } };
    return filterOils(Object.keys(OIL_SAFETY), customer);
}

// ── 依頼文 ───────────────────────────────────────────────
function buildPrompt() {
    const today = new Date();
    const s = seasonFor(today);
    const oils = oilChoice();
    const who = draft.who.trim() || 'お客様';
    const bodyLabels = draft.body.map((k) => labelOf('body', k));
    const lines = [];

    lines.push('あなたは、星と季節と食をよく知るセラピストの右腕です。');
    lines.push(`下の材料から、${who}の「今日」を見立ててください。占いのように楽しめて、読んで心がほどける文にしてください。`);
    lines.push('');
    lines.push('## 語り口の決まり');
    lines.push('- 空・季節・その方が食べたものを、ばらばらに並べず、ひとつの物語として語る。最初に、その日の物語の題を一行で付ける');
    lines.push('- 艶やかで、ユーモアのある日本語で。比喩は一段落にひとつまで。飾りすぎない');
    lines.push('- ユーモアは軽く、お客様をからかわない');
    lines.push('- 栄養・安全・オーガニックの効き目など、確かめられることは比喩に混ぜず、一文で正確に書く');
    lines.push('- オーガニックについては「農薬の残りが少ないことは確か」「栄養が多いかはまだはっきりしない」を区別する');
    lines.push('- 体のことは「〜しやすい」「〜かもしれない」まで。診断・治療の言い方はしない');
    lines.push('- 星や五行は、言い伝え・考え方として語る（事実のようには書かない）');
    lines.push('');
    lines.push('## 守ること（必ず）');
    if (draft.foodAllergy.length) {
        lines.push(`- 食べ物のアレルギー：${draft.foodAllergy.join('、')}。これらと、これらを含む料理は勧めない`);
    }
    if (draft.body.includes('pregnancy')) {
        lines.push('- 妊娠中：生の魚介や生肉など、妊娠中は控えるよう勧められている食べ物は勧めない。最近食べたものに含まれていても責めず、やさしく伝える');
    }
    lines.push(`- 精油は、次の候補の中からだけ選ぶ（体質で絞り込み済み）：${oils.ok.map((o) => o.oil).join('、') || '（なし）'}`);
    if (oils.care.length) {
        lines.push(`- 条件付きで使える精油（注意を添える）：${oils.care.map((o) => `${o.oil}（${[...(o.cares || []), ...(o.notes || [])].join('・')}）`).join('、')}`);
    }
    lines.push('- 精油の濃度は低め（1%前後）を基本にする');
    lines.push('- 最後に必ず「強い痛み・しびれ・熱があるとき、数日たっても良くならないときは医療機関へ」と添える');
    lines.push('');
    lines.push(`## ${who}のこと`);
    if (draft.talk.trim()) lines.push(`- 今日のお話：${draft.talk.trim()}`);
    if (draft.parts.length) lines.push(`- 気になる場所：${draft.parts.join('、')}`);
    if (draft.ate.trim()) lines.push(`- 最近食べたもの：${draft.ate.trim()}`);
    if (draft.foodStyle.length) lines.push(`- 食のこだわり：${draft.foodStyle.join('、')}`);
    if (bodyLabels.length) lines.push(`- 体質：${bodyLabels.join('、')}`);
    const sign = sunSign(draft.birth);
    if (sign) lines.push(`- 生まれの太陽星座：${sign}`);
    if (draft.area.trim()) lines.push(`- お住まいの地域：${draft.area.trim()}`);
    lines.push('');
    lines.push(`## 今日（${today.getFullYear()}年${fmtDate(today)}）の材料`);
    const sky = advice ? skyLines(advice.advice) : [];
    if (advice && advice.data) {
        const d = advice.data;
        lines.push(`- 天体：太陽は${d.sunSign}、月は${d.moonSign}（${d.moonPhase}）、水星は${d.mercurySign}${d.isMercuryRetrograde ? '（逆行中）' : ''}、金星は${d.venusSign}、火星は${d.marsSign}`);
    }
    sky.forEach((l) => lines.push(`- ${l}`));
    if (!sky.length) lines.push('- 今日の空と天気は、ウェブで調べてから書いてください');
    const area = draft.area.trim();
    if (area && !/東京/.test(area)) {
        lines.push(`- 上の天気は東京のもの。${area}の今日の天気と気圧は、ウェブで調べてから使ってください`);
    }
    lines.push(`- 季節と五行（薬膳の考え方）：${s.season}、五行は「${s.element.name}」。受け持ちは${s.element.organ}、味は${s.element.taste}、色は${s.element.color}。${s.element.note}`);
    lines.push(`- 旬の食材：${s.foods.join('、')}`);
    lines.push('');
    lines.push('## 書く形');
    lines.push('1. 題（一行）');
    lines.push('2. 空と体（2〜3文）');
    lines.push('3. 星（2〜3文）');
    lines.push('4. 食（食べたものの見立て、今日の一皿の提案、食育とオーガニックのひとこと。3〜5文）');
    lines.push('5. アロマと暮らし（2〜3文）');
    lines.push('6. 受診の目安（一文）');
    lines.push('全体で600字ほど。見出しは短く。');
    return lines.join('\n');
}

function renderMitate() {
    const sum = $('sum-list');
    sum.innerHTML = '';
    const add = (t) => { const li = document.createElement('li'); li.textContent = t; sum.appendChild(li); };
    add(`お呼び名：${draft.who.trim() || '（未入力）'}`);
    if (draft.talk.trim()) add(`お話：${draft.talk.trim()}`);
    if (draft.ate.trim()) add(`最近の食事：${draft.ate.trim()}`);
    if (draft.foodStyle.length) add(`こだわり：${draft.foodStyle.join('、')}`);
    if (draft.body.length) add(`体質：${draft.body.map((k) => labelOf('body', k)).join('、')}`);
    if (draft.foodAllergy.length) add(`食べ物のアレルギー：${draft.foodAllergy.join('、')}`);
    add('今日の材料：空・天気・季節と五行・旬');

    const oils = oilChoice();
    $('oil-ok').textContent = oils.ok.map((o) => o.oil).join('、') || '（候補なし）';
    $('oil-out').textContent = oils.avoid.length
        ? `外したもの：${oils.avoid.map((o) => `${o.oil}（${o.reasons.join('・')}）`).join('、')}`
        : '体質で外したものはありません。';
    $('prompt-text').textContent = buildPrompt();
    renderHistory();
}

// ── Claude に渡す ─────────────────────────────────────────
const CLAUDE_NEW = 'https://claude.ai/new';

function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text));
    }
    return Promise.resolve(fallbackCopy(text));
}
function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
}

function sendToClaude() {
    const prompt = buildPrompt();
    // 押した操作の続きのうちに、コピーと新しい窓を両方始める（iPhone が止めないように）。
    // 依頼文は長いので URL には載せず、コピーして貼ってもらう
    const copied = copyText(prompt);
    window.open(CLAUDE_NEW, '_blank', 'noopener');
    copied.then((ok) => {
        $('claude-status').textContent = ok
            ? '依頼文をコピーしました。開いた Claude の入力欄に貼り付けて、送ってください。'
            : 'コピーできませんでした。下の「依頼文の中身を見る」から選んでコピーしてください。';
    });
}

function copyOnly() {
    copyText(buildPrompt()).then((ok) => {
        $('claude-status').textContent = ok
            ? '依頼文をコピーしました。Claude アプリに貼り付けて送ってください。'
            : 'コピーできませんでした。下の「依頼文の中身を見る」から選んでコピーしてください。';
    });
}

// ── 頼む（ルーティンが書いて、ここへ届ける） ─────────────────────
const PENDING_KEY = 'mitate.pending.v1';
const POLL_MS = 8000;
let pollTimer = null;

function setAskStatus(text) { $('ask-status').textContent = text; }

function showWaiting(on, title, sub) {
    $('waiting').hidden = !on;
    if (title) $('waiting-title').textContent = title;
    if (sub) $('waiting-sub').textContent = sub;
    $('btn-ask').disabled = on;
}

/** 入口（Zero Trust）のログインが切れると、ログイン画面へ回される。そのときは中身が読めない */
async function callApi(url, opts) {
    const res = await fetch(url, Object.assign({ redirect: 'manual', cache: 'no-store' }, opts || {}));
    if (res.type === 'opaqueredirect' || res.status === 0) {
        throw new Error('入口のログインが切れています。ページを読み込み直して、ログインし直してください。');
    }
    let body = {};
    try { body = await res.json(); } catch (e) { body = {}; }
    if (!res.ok) throw new Error(body.detail || `うまく頼めませんでした（${res.status}）`);
    return body;
}

async function askClaude() {
    const request = buildPrompt();
    showWaiting(true, 'ただいま、星を読んでいます…', '空と季節を調べながら書いています。数分かかります。この画面のまま、お待ちください。');
    $('reading').hidden = true;
    setAskStatus('');
    try {
        const { id } = await callApi('/api/mitate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ request })
        });
        save(PENDING_KEY, { id, who: draft.who.trim(), at: Date.now() });
        poll();
    } catch (e) {
        showWaiting(false);
        setAskStatus(`${e.message} 下の「自分で Claude に渡す」からも頼めます。`);
    }
}

async function poll() {
    clearTimeout(pollTimer);
    const pending = load(PENDING_KEY, null);
    if (!pending || !pending.id) return;
    showWaiting(true);
    try {
        const r = await callApi(`/api/mitate?id=${encodeURIComponent(pending.id)}`);
        if (r.status === 'done') {
            save(PENDING_KEY, null);
            showWaiting(false);
            showReading(pending.who, r.text);
            return;
        }
        if (r.status === 'timeout' || r.status === 'unknown') {
            save(PENDING_KEY, null);
            showWaiting(false);
            setAskStatus('時間内に届きませんでした。もう一度頼むか、下の「自分で Claude に渡す」を使ってください。');
            return;
        }
    } catch (e) {
        // 一時的な通信の途切れは、次の回にもう一度見る
        setAskStatus(e.message);
        if (/ログイン/.test(e.message)) { showWaiting(false); return; }
    }
    pollTimer = setTimeout(poll, POLL_MS);
}

/** 届いた見立てを出し、その場で端末にも残す（置き場からは受け取った時点で消えるため） */
function showReading(who, text) {
    const now = new Date();
    const date = `${now.getFullYear()}年${fmtDate(now)}`;
    $('reading-who').textContent = who || 'お客様';
    $('reading-date').textContent = date;
    $('reading-body').textContent = text;
    $('reading').hidden = false;
    const list = load(HISTORY_KEY, []);
    list.push({ id: String(now.getTime()), who: who || '', date, text });
    save(HISTORY_KEY, list.slice(-50));
    renderHistory();
    setAskStatus('見立てが届きました。この端末に残しました。');
    $('reading').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── 残した見立て ───────────────────────────────────────────
function renderHistory() {
    const host = $('history');
    host.innerHTML = '';
    const list = load(HISTORY_KEY, []);
    list.slice().reverse().forEach((h) => {
        const item = document.createElement('article');
        item.className = 'history-item';
        const meta = document.createElement('div');
        meta.className = 'meta';
        const a = document.createElement('span');
        a.textContent = h.who || 'お客様';
        const b = document.createElement('span');
        b.textContent = h.date;
        meta.append(a, b);
        const body = document.createElement('div');
        body.className = 'body';
        body.textContent = h.text;
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'del';
        del.textContent = 'この見立てを消す';
        del.addEventListener('click', () => {
            if (!confirm('この見立てを、この端末から消しますか？')) return;
            save(HISTORY_KEY, load(HISTORY_KEY, []).filter((x) => x.id !== h.id));
            renderHistory();
        });
        item.append(meta, body, del);
        host.appendChild(item);
    });
}

function saveResult() {
    const text = $('f-result').value.trim();
    if (!text) return;
    const list = load(HISTORY_KEY, []);
    const now = new Date();
    list.push({ id: String(now.getTime()), who: draft.who.trim(), date: `${now.getFullYear()}年${fmtDate(now)}`, text });
    save(HISTORY_KEY, list.slice(-50));
    $('f-result').value = '';
    renderHistory();
}

// ── はじめる ─────────────────────────────────────────────
function start() {
    renderChips();
    fillFields();
    bindFields();
    document.querySelectorAll('.step').forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.step))));
    document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.go))));
    $('btn-ask').addEventListener('click', askClaude);
    $('btn-claude').addEventListener('click', sendToClaude);
    $('btn-copy').addEventListener('click', copyOnly);
    $('btn-save').addEventListener('click', saveResult);
    $('btn-clear').addEventListener('click', () => {
        if (!confirm('聞き取った内容を消して、はじめからにしますか？（残した見立ては消えません）')) return;
        draft = blank();
        save(STORE_KEY, draft);
        renderChips();
        fillFields();
    });
    // 頼んだまま閉じていたら、続きから待つ
    if (load(PENDING_KEY, null)) { go(3); poll(); }
    // 星詠みが届いたら、開いている段を描き直す
    loadAdvice().then(() => {
        const open = document.querySelector('.panel:not([hidden])');
        if (open && open.dataset.panel === '2') renderMaterial();
        if (open && open.dataset.panel === '3') renderMitate();
    });
}

start();
