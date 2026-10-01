// 取扱説明書に添える、声つきの短い動画を作る。
//
// 実物のアプリを本当に動かして、そのまま録る。絵で描いた作り物ではないので、
// アプリを変えれば録り直すだけで、説明とずれない。
// 声は VOICEVOX（冥鳴ひまり・春日部つむぎ・ずんだもん）。字幕にも同じ文を出すので、
// 音を出せない場所（施術中など）でも読める。
//
// ── 流れ ──
//   1. node scripts/build-manual-videos.js lines [番号…]
//        台本から、まだ声になっていない台詞を scripts/voice/pending.json に書き出す
//   2. node scripts/voice/tts.py scripts/voice/pending.json
//        VOICEVOX core で読み上げ、scripts/voice/<hash>.ogg と index.json（長さ）を作る
//        （VOICEVOX core が動く場所で。準備のしかたは scripts/voice/README.md）
//   3. node management/09_Verification/serve-with-headers.js   （別の窓で）
//   4. node scripts/build-manual-videos.js [番号…]
//        録って、声を重ね、product/docs/videos/<番号>.mp4 にする
//
// ── 気をつけたこと ──
// ・出てくるのは、アプリに元から入っている見本のお客様だけ。本物のカルテは一切映さない
// ・指の代わりに丸を出し、次にどこを押すかが分かるようにしている
// ・台詞の長さ（声の長さ）だけ待ってから次へ進むので、声と画面がずれない
// ・動画の最後に、声のクレジット（VOICEVOX:○○）を必ず出す（各キャラクターの利用規約）

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const SCENES = require('./manual-videos/scenes');

const BASE = process.env.MANUAL_BASE || 'http://127.0.0.1:8900/product/';
const OUT = path.resolve(__dirname, '..', 'product', 'docs', 'videos');
const VOICE = path.resolve(__dirname, 'voice');
const TMP = path.resolve(__dirname, '..', 'build', 'videos-tmp');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

// スマホで見るので、縦長で録る（iPhone の画面の大きさ）。2倍の細かさで写す。
// 字幕はアプリの画面に重ねず、下に帯を足してそこに出す（ボタンや一覧を隠さないため）
const VIEW = { width: 390, height: 680 };
const BAND = 130;
const SCALE = 2;
const BG = '#070b17';

// 話す人。style は VOICEVOX のスタイルID
const SPEAKERS = {
    himari: { name: '冥鳴ひまり', style: 14, color: '#c9a7ff', speed: 1.08 },
    tsumugi: { name: '春日部つむぎ', style: 8, color: '#ffd36b', speed: 1.1 },
    zunda: { name: 'ずんだもん', style: 3, color: '#8fe388', speed: 1.1 }
};

const lineHash = (who, voiceText) => crypto.createHash('sha1')
    .update(`${SPEAKERS[who].style}|${SPEAKERS[who].speed}|${voiceText}`).digest('hex').slice(0, 16);

// 台詞は「字幕の文」と「読ませる文」を分けられる（顧客No. → こきゃくナンバー など）
// 読み上げで間違えやすい言葉は、ここで読みに直す（字幕はそのまま）
const READINGS = [
    [/顧客No\.?\s*/g, 'こきゃくナンバー '],
    [/C-0000/g, 'シー、ゼロゼロゼロゼロ'],
    [/Soul Color/g, 'ソウルカラー'],
    [/1色目/g, 'いっしょくめ'],
    [/🐬\s*「/g, 'イルカの「'], [/🐬\s*の/g, 'イルカの'], [/🐬/g, 'イルカ'],
    [/(その|この|あの|新しい|ほかの|他の|来ていない|来られなくなった|同じ|はじめての)方/g, '$1かた'],
    [/(外した|登録した|来た|書いた)方/g, '$1かた'],
    [/＋\s*/g, ''],
    [/靈氣/g, 'れいき'],
    [/月set/g, 'つきセット'],
    [/A\.C/g, 'エーシー'],
    [/W\.S/g, 'ワークショップ'],
    [/iPhone・iPad/g, 'アイフォン、アイパッド'],
    [/iPhone/g, 'アイフォン'],
    [/iPad/g, 'アイパッド'],
    [/AI/g, 'エーアイ'],
    [/OK/g, 'オーケー'],
    [/📋\s*カルテ/g, 'カルテ'], [/📋/g, 'カルテ'],
    [/🗓️?/g, 'カレンダー'],
    [/💴\s*金額/g, '金額'], [/💴/g, '金額'],
    [/✨\s*星詠み/g, '星詠み'], [/✨/g, '星'],
    [/✏️?\s*編集する/g, '編集する'], [/✏️?/g, 'えんぴつマーク'],
    [/🌸\s*訴え/g, '訴え'], [/🌸/g, '訴え'],
    [/📦\s*アーカイブ/g, 'アーカイブ'], [/📦/g, 'アーカイブ'],
    [/👤\s*お客様の情報/g, 'お客様の情報'], [/👤/g, 'お客様の情報'],
    [/📷/g, 'カメラ'],
    [/🍀\s*item/g, 'アイテム'], [/item/g, 'アイテム'],
    [/🌈\s*color/g, 'カラー'], [/color/g, 'カラー'],
    [/「◀」「▶」/g, '左右の矢印'],
    [/他◯人/g, 'ほか何人'], [/◯/g, '何'],
    [/〜/g, ''],
    [/」「/g, '、'],
    [/"/g, ''],
    [/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{2190}-\u{21FF}]/gu, ''],
    [/[「」『』（）()]/g, ''],
    [/・/g, '、']
];
const toReading = (text) => READINGS.reduce((t, [re, to]) => t.replace(re, to), text).replace(/\s+/g, ' ').trim();
const splitLine = (line) => (Array.isArray(line) ? { cap: line[0], voice: line[1] } : { cap: line, voice: toReading(line) });

// ------------------------------------------------------------------
// 画面に重ねるもの（丸い印と、字幕と、クレジット）
// ------------------------------------------------------------------
const overlayCss = `
#mv-dot {
    position: fixed; z-index: 2147483000; width: 30px; height: 30px; margin: -15px 0 0 -15px;
    border-radius: 50%; background: rgba(0,242,254,0.35); border: 2px solid #00f2fe;
    box-shadow: 0 0 18px rgba(0,242,254,0.9); pointer-events: none;
    transition: left .28s ease, top .28s ease, transform .15s ease;
    left: -100px; top: -100px;
}
#mv-dot.tap { transform: scale(0.6); background: rgba(0,242,254,0.75); }
#mv-cap {
    position: fixed; z-index: 2147483000; left: 10px; right: 10px; bottom: 14px;
    padding: 10px 14px 12px; border-radius: 14px;
    background: rgba(8,13,26,0.94); border: 1px solid rgba(0,242,254,0.4);
    color: #fff; font-size: 17px; font-weight: 700; line-height: 1.55;
    font-family: 'Noto Sans JP', system-ui, sans-serif; pointer-events: none;
    box-shadow: 0 12px 34px rgba(0,0,0,0.6); opacity: 0; transition: opacity .2s ease;
    white-space: pre-wrap;
}
#mv-cap.on { opacity: 1; }
#mv-cap .who { display: inline-block; font-size: 12px; font-weight: 800; padding: 1px 9px;
    border-radius: 999px; color: #0b1020; margin-bottom: 4px; }
#mv-cap .txt { display: block; }
#mv-ring {
    position: fixed; z-index: 2147482999; border: 3px solid #00f2fe; border-radius: 12px;
    box-shadow: 0 0 0 4px rgba(0,242,254,0.18); pointer-events: none; opacity: 0;
    transition: opacity .2s ease, all .28s ease;
}
#mv-ring.on { opacity: 1; }
#mv-card {
    position: fixed; inset: 0; z-index: 2147483001; display: none;
    background: radial-gradient(circle at 50% 35%, #1b2447, #070b17 70%);
    color: #fff; font-family: 'Noto Sans JP', system-ui, sans-serif;
    flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 14px;
    padding: 30px;
}
#mv-card.on { display: flex; }
#mv-card .t1 { font-size: 13px; color: #00f2fe; font-weight: 800; letter-spacing: .08em; }
#mv-card .t2 { font-size: 23px; font-weight: 800; line-height: 1.5; }
#mv-card .t3 { font-size: 13px; color: #aab3cf; line-height: 1.9; white-space: pre-line; }
`;

const installOverlay = (css) => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    ['mv-dot', 'mv-cap', 'mv-ring', 'mv-card'].forEach((id) => {
        if (document.getElementById(id)) return;
        const el = document.createElement('div');
        el.id = id;
        document.body.appendChild(el);
    });
    window.__mvCap = (who, color, text) => {
        const c = document.getElementById('mv-cap');
        if (!c) return;
        c.innerHTML = '';
        if (text) {
            const w = document.createElement('span');
            w.className = 'who';
            w.textContent = who;
            w.style.background = color;
            const t = document.createElement('span');
            t.className = 'txt';
            t.textContent = text;
            c.append(w, t);
        }
        c.classList.toggle('on', Boolean(text));
    };
    window.__mvCard = (t1, t2, t3) => {
        const c = document.getElementById('mv-card');
        if (!c) return;
        if (!t2) { c.classList.remove('on'); return; }
        c.innerHTML = '';
        [['t1', t1], ['t2', t2], ['t3', t3]].forEach(([k, v]) => {
            if (!v) return;
            const d = document.createElement('div');
            d.className = k;
            d.textContent = v;
            c.appendChild(d);
        });
        c.classList.add('on');
    };
    window.__mvDot = (x, y, tap) => {
        const d = document.getElementById('mv-dot');
        if (!d) return;
        d.style.left = `${x}px`;
        d.style.top = `${y}px`;
        d.classList.toggle('tap', Boolean(tap));
    };
    window.__mvRing = (box) => {
        const r = document.getElementById('mv-ring');
        if (!r) return;
        if (!box) { r.classList.remove('on'); return; }
        r.style.left = `${box.x - 6}px`;
        r.style.top = `${box.y - 6}px`;
        r.style.width = `${box.width + 12}px`;
        r.style.height = `${box.height + 12}px`;
        r.classList.add('on');
    };
};

// ------------------------------------------------------------------
// 台本を書くための道具
// ------------------------------------------------------------------
function loadVoiceIndex() {
    const p = path.join(VOICE, 'index.json');
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
}

function makeStage(page, clock, voiceIndex) {
    const wait = (ms) => page.waitForTimeout(ms);
    const said = [];            // { hash, at }（録り始めからのミリ秒）
    const caps = [];            // 字幕 { at, who, color, text }。text が空なら消す
    const used = new Set();

    /** 話す。字幕を出し、声の長さだけ待つ */
    const say = async (who, line, { after = 380 } = {}) => {
        const sp = SPEAKERS[who];
        if (!sp) throw new Error(`話す人が分からない: ${who}`);
        const { cap, voice } = splitLine(line);
        const hash = lineHash(who, voice);
        // DRY=1 のときは声なしで通しだけ確かめる（押す場所が合っているか）
        const v = voiceIndex[hash] || (process.env.DRY ? { dur: 0.4 } : null);
        if (!v) throw new Error(`声がまだありません（lines を先に）: ${cap}`);
        const at = Date.now() - clock.t0;
        caps.push({ at, who: sp.name, color: sp.color, text: cap });
        said.push({ hash, at });
        used.add(who);
        await wait(Math.round(v.dur * 1000) + after);
    };

    const clear = async () => {
        caps.push({ at: Date.now() - clock.t0, text: '' });
        await page.evaluate(() => window.__mvRing(null));
    };

    /** そこへ丸を動かし、囲って見せてから押す */
    const tap = async (selector, { ring = true, nth = 0, settle = 700 } = {}) => {
        const el = page.locator(selector).nth(nth);
        await el.waitFor({ state: 'visible', timeout: 8000 });
        await el.scrollIntoViewIfNeeded();
        await wait(200);
        const box = await el.boundingBox();
        if (!box) throw new Error(`場所が取れない: ${selector}`);
        if (ring) await page.evaluate((b) => window.__mvRing(b), box);
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        await page.evaluate(([x2, y2]) => window.__mvDot(x2, y2, false), [x, y]);
        await wait(480);
        await page.evaluate(([x2, y2]) => window.__mvDot(x2, y2, true), [x, y]);
        await wait(160);
        await el.scrollIntoViewIfNeeded().catch(() => {});
        try {
            await el.click({ force: true, timeout: 4000 });
        } catch (e) {
            await el.evaluate((node) => node.click());
        }
        await page.evaluate(([x2, y2]) => window.__mvDot(x2, y2, false), [x, y]);
        await page.evaluate(() => window.__mvRing(null));
        await wait(settle);
    };

    /** 人が打っているように、1文字ずつ入れる */
    const type = async (selector, text, { nth = 0 } = {}) => {
        const el = page.locator(selector).nth(nth);
        await el.waitFor({ state: 'visible', timeout: 8000 });
        await el.scrollIntoViewIfNeeded();
        const box = await el.boundingBox();
        if (box) {
            await page.evaluate((b) => window.__mvRing(b), box);
            await page.evaluate(([x, y]) => window.__mvDot(x, y, false),
                [box.x + 20, box.y + box.height / 2]);
        }
        try {
            await el.click({ force: true, timeout: 4000 });
        } catch (e) {
            await el.evaluate((node) => node.focus());
        }
        await el.fill('');
        await el.type(text, { delay: 55 });
        await wait(400);
        await page.evaluate(() => window.__mvRing(null));
    };

    /** 押さずに、そこを囲って見せる（ms のあいだ）。声と重ねたいときは keep */
    const look = async (selector, { nth = 0, ms = 1200, keep = false } = {}) => {
        const el = page.locator(selector).nth(nth);
        await el.waitFor({ state: 'visible', timeout: 8000 });
        await el.scrollIntoViewIfNeeded();
        const box = await el.boundingBox();
        if (box) {
            await page.evaluate((b) => window.__mvRing(b), box);
            await page.evaluate(([x, y]) => window.__mvDot(x, y, false),
                [box.x + box.width / 2, box.y + box.height / 2]);
        }
        await wait(ms);
        if (!keep) await page.evaluate(() => window.__mvRing(null));
    };

    /** 囲いを消す */
    const unring = () => page.evaluate(() => window.__mvRing(null));

    const has = async (selector) => (await page.locator(selector).count()) > 0;

    return { page, wait, say, clear, tap, type, look, unring, has, said, caps, used };
}

/** 台詞を集めるだけの舞台（押したり待ったりはしない） */
function makeScriptStage(lines) {
    const noop = async () => {};
    // 何を呼んでも何もしない「ページ」。await しても、文字にしても壊れない
    const deep = new Proxy(function stub() {}, {
        get: (t, k) => {
            if (k === 'then') return undefined;
            if (k === Symbol.toPrimitive) return () => '';
            return deep;
        },
        apply: () => deep
    });
    const page = deep;
    return {
        page,
        wait: noop, clear: noop, tap: noop, type: noop, look: noop, unring: noop,
        has: async () => true,
        say: async (who, line) => {
            if (!SPEAKERS[who]) throw new Error(`話す人が分からない: ${who}`);
            const { voice } = splitLine(line);
            lines.push({ hash: lineHash(who, voice), who, style: SPEAKERS[who].style,
                speed: SPEAKERS[who].speed, text: voice });
        }
    };
}

// ------------------------------------------------------------------
// 1. 声にする台詞を書き出す
// ------------------------------------------------------------------
async function collectLines(targets) {
    const index = loadVoiceIndex();
    const all = [];
    for (const sc of targets) await sc.run(makeScriptStage(all));
    // 締めのクレジットは声を使わない
    const seen = new Set();
    const pending = all.filter((l) => {
        if (index[l.hash] || seen.has(l.hash)) return false;
        seen.add(l.hash);
        return true;
    });
    fs.mkdirSync(VOICE, { recursive: true });
    fs.writeFileSync(path.join(VOICE, 'pending.json'), JSON.stringify(pending, null, 1) + '\n');
    console.log(`台詞 ${all.length} 行のうち、まだ声が無いもの ${pending.length} 行 → scripts/voice/pending.json`);
}

// ------------------------------------------------------------------
// 2. 録って、声を重ねる
// ------------------------------------------------------------------
const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

/** 字幕の帯（話している人の名札と、台詞） */
const bandHtml = (c) => `<!doctype html><html><head><meta charset="utf-8"><style>
html, body { margin: 0; height: 100%; background: ${BG}; }
body { box-sizing: border-box; padding: 10px 14px; border-top: 2px solid rgba(0,242,254,0.45);
    font-family: 'Noto Sans JP', 'Noto Sans CJK JP', system-ui, sans-serif; color: #fff; }
.who { display: inline-block; font-size: 12px; font-weight: 800; padding: 1px 10px; border-radius: 999px;
    color: #0b1020; background: ${c.color}; margin-bottom: 5px; }
.txt { font-size: 17px; font-weight: 700; line-height: 1.5; }
</style></head><body><span class="who">${esc(c.who)}</span><div class="txt">${esc(c.text)}</div></body></html>`;

async function record(browser, scene, voiceIndex) {
    const work = path.join(TMP, scene.id);
    fs.rmSync(work, { recursive: true, force: true });
    fs.mkdirSync(work, { recursive: true });
    const ctx = await browser.newContext({
        viewport: VIEW,
        deviceScaleFactor: SCALE,
        isMobile: true,
        hasTouch: true
    });
    const clock = { t0: Date.now() };
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(`    [${scene.id}] 画面のエラー:`, e.message.slice(0, 120)));

    await page.goto(BASE + 'index.html');
    await page.waitForTimeout(3000);
    await page.evaluate(installOverlay, overlayCss);

    // 画面の絵を、細かさそのままで受け取る（録画機能は等倍でしか撮れないため）
    const frames = [];
    const cdp = await ctx.newCDPSession(page);
    cdp.on('Page.screencastFrame', async (f) => {
        const at = Date.now() - clock.t0;
        const file = path.join(work, `f${String(frames.length).padStart(5, '0')}.jpg`);
        fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
        frames.push({ file, at });
        cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    });
    await cdp.send('Page.startScreencast', {
        format: 'jpeg', quality: 88,
        maxWidth: VIEW.width * SCALE, maxHeight: VIEW.height * SCALE, everyNthFrame: 1
    });

    const s = makeStage(page, clock, voiceIndex);

    // 頭：題の札
    await page.evaluate(([a, b]) => window.__mvCard(a, b, ''), [`取扱説明書 ${scene.id}`, scene.title]);
    await page.waitForTimeout(200);
    const start = Date.now() - clock.t0;           // ここから先を使う（読み込み中は切る）
    await page.waitForTimeout(1600);
    await page.evaluate(() => window.__mvCard('', '', ''));
    await page.waitForTimeout(300);

    let ok = true;
    try {
        await scene.run(s);
    } catch (e) {
        ok = false;
        console.log(`    [${scene.id}] 途中で止まった:`,
            e.message.split('\n').slice(0, 3).join(' / ').slice(0, 260));
    }
    await s.clear();
    await page.waitForTimeout(400);

    // 締め：声のクレジット（使った人だけ）
    const credit = Object.keys(SPEAKERS).filter((k) => s.used.has(k))
        .map((k) => `VOICEVOX:${SPEAKERS[k].name}`).join('\n');
    await page.evaluate(([a, b, c]) => window.__mvCard(a, b, c), ['Terre Mer KARTE', scene.title, `音声\n${credit}`]);
    await page.waitForTimeout(2400);
    const end = Date.now() - clock.t0;
    await cdp.send('Page.stopScreencast').catch(() => {});
    await page.waitForTimeout(150);
    await ctx.close();

    // 絵を時刻どおりに並べる（変わらないあいだは、前の絵を出したまま）
    const use = frames.filter((f) => f.at <= end);
    let first = 0;
    for (let i = 0; i < use.length; i += 1) if (use[i].at <= start) first = i;
    const list = use.slice(first);
    const lines = ['ffconcat version 1.0'];
    list.forEach((f, i) => {
        const from = Math.max(f.at, start);
        const to = i + 1 < list.length ? list[i + 1].at : end;
        lines.push(`file '${f.file}'`, `duration ${Math.max(0.001, (to - from) / 1000).toFixed(3)}`);
    });
    lines.push(`file '${list[list.length - 1].file}'`);
    const concat = path.join(work, 'frames.txt');
    fs.writeFileSync(concat, lines.join('\n') + '\n');

    // 字幕の帯を、1枚ずつ絵にする（アプリと同じ字と色で）
    const capFiles = [];
    const band = await browser.newPage({ viewport: { width: VIEW.width, height: BAND }, deviceScaleFactor: SCALE });
    const timeline = s.caps.filter((c) => c.at >= start);
    for (let i = 0; i < timeline.length; i += 1) {
        const c = timeline[i];
        if (!c.text) continue;
        const next = timeline.slice(i + 1).find(() => true);
        const to = Math.min(next ? next.at : end, end);
        await band.setContent(bandHtml(c));
        const file = path.join(work, `cap${i}.png`);
        await band.screenshot({ path: file });
        capFiles.push({ file, from: (c.at - start) / 1000, to: (to - start) / 1000 });
    }
    await band.close();

    // 声を、言った時刻に置いて重ねる
    const dest = process.env.DRY ? path.join(TMP, `dry-${scene.id}.mp4`) : path.join(OUT, `${scene.id}.mp4`);
    const args = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', concat];
    const filters = [];
    const W = VIEW.width * SCALE;
    const H = VIEW.height * SCALE;
    let n = 1;
    filters.push(`[0:v]fps=24,scale=${W}:${H},pad=${W}:${H + BAND * SCALE}:0:0:color=${BG.replace('#', '0x')}[v0]`);
    capFiles.forEach((c, i) => {
        args.push('-i', c.file);
        filters.push(`[v${i}][${n}:v]overlay=0:${H}:enable='between(t,${c.from.toFixed(3)},${c.to.toFixed(3)})'[v${i + 1}]`);
        n += 1;
    });
    filters.push(`[v${capFiles.length}]scale=720:-2,format=yuv420p[vout]`);
    if (process.env.DRY) s.said.length = 0;
    const aStart = n;
    s.said.forEach((l, i) => {
        args.push('-i', path.join(VOICE, `${l.hash}.ogg`));
        const delay = Math.max(0, l.at - start);
        filters.push(`[${aStart + i}:a]adelay=${delay}|${delay},aresample=48000[a${i}]`);
    });
    args.push('-map', '[vout]');
    if (s.said.length) {
        filters.push(`${s.said.map((_, i) => `[a${i}]`).join('')}amix=inputs=${s.said.length}:normalize=0:dropout_transition=0,apad[aout]`);
        args.push('-map', '[aout]');
    }
    args.push('-filter_complex', filters.join(';'));
    args.push('-t', ((end - start) / 1000).toFixed(3),
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30',
        '-c:a', 'aac', '-b:a', '80k', '-ac', '1',
        '-movflags', '+faststart', dest);
    execFileSync(FFMPEG, args, { stdio: 'inherit' });
    fs.rmSync(work, { recursive: true, force: true });

    const kb = Math.round(fs.statSync(dest).size / 1024);
    const sec = Math.round((end - start) / 1000);
    console.log(`  ${ok ? '✅' : '⚠️ '} ${scene.id}  ${scene.title}  ${sec}秒 (${kb}KB)`);
    return { id: scene.id, title: scene.title, file: `docs/videos/${scene.id}.mp4`, sec, kb, ok };
}

(async () => {
    const argv = process.argv.slice(2);
    const mode = argv[0] === 'lines' ? 'lines' : 'record';
    const only = mode === 'lines' ? argv.slice(1) : argv;
    const targets = only.length ? SCENES.filter((s) => only.includes(s.id)) : SCENES;
    if (!targets.length) {
        console.log('その番号の台本がありません:', only.join(', '));
        process.exit(1);
    }

    if (mode === 'lines') {
        await collectLines(targets);
        return;
    }

    const voiceIndex = loadVoiceIndex();
    fs.mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch({
        executablePath: process.env.MV_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
    });
    console.log(`録ります（${targets.length}本）`);
    const made = [];
    for (const scene of targets) {
        made.push(await record(browser, scene, voiceIndex));
    }
    await browser.close();

    if (process.env.DRY) {
        const bad = made.filter((m) => !m.ok).map((m) => m.id);
        console.log(bad.length ? `止まったもの: ${bad.join(', ')}` : '通しは全部とおりました');
        return;
    }
    // 説明書の側から、どの見出しにどれを添えるかを引くための一覧。
    // 説明書そのもの（manual.md）には書かない。AIに渡すのは字だけでよいため。
    const indexPath = path.join(OUT, 'videos.json');
    const prev = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : [];
    const order = SCENES.map((s) => s.id);
    const merged = [...prev.filter((p) => !made.some((m) => m.id === p.id) && order.includes(p.id)), ...made]
        .map(({ id, title, file, sec }) => ({ id, title, file, sec }))
        .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
    fs.writeFileSync(indexPath, JSON.stringify(merged, null, 2) + '\n');

    const total = made.reduce((a, m) => a + m.kb, 0);
    console.log(`\n合わせて ${Math.round(total / 1024 * 10) / 10}MB / ${made.length}本`);
    const bad = made.filter((m) => !m.ok).map((m) => m.id);
    if (bad.length) console.log('途中で止まったもの:', bad.join(', '));
})();
