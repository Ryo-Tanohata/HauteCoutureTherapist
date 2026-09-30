// 取扱説明書に添える、短い動画を作る。
//
// 文字だけだと「どこのことか」が分からない、という声から。
// 実物のアプリを本当に動かして、そのまま録る。絵で描いた作り物ではないので、
// アプリを変えれば録り直すだけで、説明とずれない。
//
// ── 使い方 ──
//   node management/09_Verification/serve-with-headers.js   （別の窓で）
//   node scripts/build-manual-videos.js                     （全部録る）
//   node scripts/build-manual-videos.js 2-1 2-6             （番号を指定して録り直す）
//
// ── 気をつけたこと ──
// ・出てくるのは、アプリに元から入っている見本のお客様だけ。
//   本物のカルテは一切映さない
// ・指の代わりに丸を出し、次にどこを押すかが分かるようにしている
// ・字幕を焼き込むので、音は要らない（施術中でも見られる）

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.MANUAL_BASE || 'http://127.0.0.1:8900/product/';
const OUT = path.resolve(__dirname, '..', 'product', 'docs', 'videos');
const SIZE = { width: 1024, height: 760 };

// ------------------------------------------------------------------
// 画面に重ねるもの（丸い印と、字幕）
// ------------------------------------------------------------------
const overlayCss = `
#mv-dot {
    position: fixed; z-index: 2147483000; width: 26px; height: 26px; margin: -13px 0 0 -13px;
    border-radius: 50%; background: rgba(0,242,254,0.35); border: 2px solid #00f2fe;
    box-shadow: 0 0 18px rgba(0,242,254,0.9); pointer-events: none;
    transition: left .28s ease, top .28s ease, transform .15s ease;
    left: -100px; top: -100px;
}
#mv-dot.tap { transform: scale(0.6); background: rgba(0,242,254,0.75); }
#mv-cap {
    position: fixed; z-index: 2147483000; left: 50%; bottom: 26px; transform: translateX(-50%);
    max-width: min(88%, 780px); padding: 12px 22px; border-radius: 14px;
    background: rgba(8,13,26,0.93); border: 1px solid rgba(0,242,254,0.45);
    color: #fff; font-size: 19px; font-weight: 700; line-height: 1.55; text-align: center;
    font-family: 'Noto Sans JP', system-ui, sans-serif; pointer-events: none;
    box-shadow: 0 12px 34px rgba(0,0,0,0.55); opacity: 0; transition: opacity .25s ease;
    white-space: pre-wrap;
}
#mv-cap.on { opacity: 1; }
#mv-ring {
    position: fixed; z-index: 2147482999; border: 3px solid #00f2fe; border-radius: 12px;
    box-shadow: 0 0 0 4px rgba(0,242,254,0.18); pointer-events: none; opacity: 0;
    transition: opacity .2s ease, all .28s ease;
}
#mv-ring.on { opacity: 1; }
`;

const installOverlay = (css) => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    ['mv-dot', 'mv-cap', 'mv-ring'].forEach((id) => {
        if (document.getElementById(id)) return;
        const el = document.createElement('div');
        el.id = id;
        document.body.appendChild(el);
    });
    window.__mvCap = (text) => {
        const c = document.getElementById('mv-cap');
        if (!c) return;
        c.textContent = text || '';
        c.classList.toggle('on', Boolean(text));
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
function makeStage(page) {
    const wait = (ms) => page.waitForTimeout(ms);

    /** 字幕を出して、読む時間だけ置く。長い字ほど長く置く */
    const say = async (text, ms) => {
        await page.evaluate((t) => window.__mvCap(t), text);
        await wait(ms || Math.max(1900, Math.min(5200, 320 + text.length * 105)));
    };

    const clear = () => page.evaluate(() => { window.__mvCap(''); window.__mvRing(null); });

    /** そこへ丸を動かし、囲って見せてから押す */
    const tap = async (selector, { ring = true, nth = 0, settle = 900 } = {}) => {
        const el = page.locator(selector).nth(nth);
        await el.waitFor({ state: 'visible', timeout: 8000 });
        await el.scrollIntoViewIfNeeded();
        await wait(250);
        const box = await el.boundingBox();
        if (!box) throw new Error(`場所が取れない: ${selector}`);
        if (ring) await page.evaluate((b) => window.__mvRing(b), box);
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        await page.evaluate(([x2, y2]) => window.__mvDot(x2, y2, false), [x, y]);
        await wait(560);
        await page.evaluate(([x2, y2]) => window.__mvDot(x2, y2, true), [x, y]);
        await wait(180);
        // 丸を動かしている間に描き直されて、画面の外へ出ていることがある。
        // それでも届かないときは、要素そのものを押す（見た目は同じ）
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
        await wait(500);
        await page.evaluate(() => window.__mvRing(null));
    };

    /** 押さずに、そこを見せるだけ */
    const look = async (selector, { nth = 0, ms = 1500 } = {}) => {
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
        await page.evaluate(() => window.__mvRing(null));
    };

    const has = async (selector) => (await page.locator(selector).count()) > 0;

    return { page, wait, say, clear, tap, type, look, has };
}

// ------------------------------------------------------------------
// 台本
// ------------------------------------------------------------------
const SCENES = [
    {
        id: '2-1',
        title: '予約の電話が入ったとき',
        run: async (s) => {
            await s.say('予約の電話が入ったときの入れ方です');
            await s.say('まず「📅 カレンダー」を開きます');
            await s.tap('#btn-view-calendar');
            await s.say('予約したい日のマスを押します');
            await s.tap('.calendar-day:not(.empty):not(.other-month)', { nth: 8 });
            await s.say('下に「この日の記録を追加」が出ます');
            if (await s.has('#inline-record-customer-id')) {
                await s.look('#inline-record-customer-id', { ms: 1200 });
                await s.say('お客様を選び、時間と施術内容を入れます');
                await s.type('#inline-record-type', 'アロマ 60分');
                if (await s.has('#inline-record-amount')) await s.type('#inline-record-amount', '9000');
                await s.say('金額や訴えは、あとから書き足せます');
                await s.look('#btn-inline-submit-record', { ms: 1400 });
                await s.say('「この記録を保存する」で予約が入ります');
            }
            await s.say('カレンダーのマスに、その方の札が出ます');
        }
    },
    {
        id: '2-2',
        title: 'はじめてのお客様を登録する',
        run: async (s) => {
            await s.say('新しいお客様を登録します');
            await s.tap('#btn-view-list');
            await s.say('「＋ 顧客登録」を押します');
            await s.tap('#btn-add-customer');
            await s.say('必ず要るのは「氏名」だけです');
            await s.type('#input-name', '青木 みどり');
            await s.say('ニックネームは任意。呼んでいる名前があれば');
            await s.type('#input-nickname', 'みどりさん');
            await s.say('よみがなは、名前を打つと自動で入ります');
            await s.look('#input-kana', { ms: 1600 });
            await s.say('Soul Color を選びます。1色目がその方の色になります');
            if (await s.has('.soul-slot')) await s.look('.soul-slot', { ms: 1800 });
            await s.say('初診の6つの枠は、あとからでも書けます');
            await s.say('最後に「登録する」を押します');
            await s.look('#btn-submit-customer', { ms: 1600 });
        }
    },
    {
        id: '2-3',
        title: '今日は誰が来るか見る',
        run: async (s) => {
            await s.say('その日に誰が来るかを見ます');
            await s.tap('#btn-view-calendar');
            await s.say('マスの中に、名前の札が最大2枚出ます');
            if (await s.has('.calendar-name-card')) {
                await s.look('.calendar-name-card', { ms: 2000 });
            }
            await s.say('3人以上のときは「他◯人」とまとまります');
            await s.say('マスを押すと、その日の全員が下に出ます');
            await s.tap('.calendar-day.has-record', { nth: 0 }).catch(async () => {
                await s.tap('.calendar-day:not(.empty):not(.other-month)', { nth: 9 });
            });
            await s.say('ここから、その方の記録を開けます');
        }
    },
    {
        id: '2-4',
        title: '前回どうだったか見る',
        run: async (s) => {
            await s.say('施術の前に、前回の記録を見ます');
            await s.tap('#btn-view-list');
            await s.say('お客様のカードを押します');
            await s.tap('.customer-card-grid-item', { nth: 0 });
            await s.say('「カルテ」のタブを押します');
            await s.tap('.detail-subtab-btn[data-tab="visit-type"]');
            await s.say('来店ごとの記録が、新しい順に並びます');
            await s.say('見たい回を押すと、中身が開きます');
            if (await s.has('.history-summary')) {
                await s.tap('.history-summary', { nth: 0 });
                await s.say('訴え・処方・メモ・選んだ色が出ます');
                await s.wait(1500);
            }
        }
    },
    {
        id: '2-6',
        title: '施術のあと、記録を書く',
        run: async (s) => {
            await s.say('施術のあと、記録を書き足します');
            await s.say('大事なこと：新しく作り直さないでください');
            await s.say('予約のときに作った記録を、そのまま開きます');
            await s.tap('#btn-view-list');
            await s.tap('.customer-card-grid-item', { nth: 0 });
            await s.tap('.detail-subtab-btn[data-tab="visit-type"]');
            if (await s.has('.history-summary')) {
                await s.tap('.history-summary', { nth: 0 });
                await s.say('記録の下にある「✏️ 変更」を押します');
                if (await s.has('.btn-edit-record')) {
                    await s.tap('.btn-edit-record', { nth: 0 });
                    // 開いた直後は読むだけ。ここを押してはじめて手が入る
                    if (await s.has('#btn-toggle-edit-record')) {
                        await s.say('「編集を有効にする」を押します');
                        await s.tap('#btn-toggle-edit-record');
                    }
                    await s.say('訴え・処方・メモを書き足します');
                    if (await s.has('#input-client-complaint')) {
                        await s.type('#input-client-complaint', '右肩の重だるさ');
                    }
                    if (await s.has('#input-prescription')) {
                        await s.type('#input-prescription', '肩甲骨まわりをゆるめる');
                    }
                    await s.say('最後に「記録する」で保存します');
                    if (await s.has('#btn-submit-record')) await s.look('#btn-submit-record', { ms: 1600 });
                }
            }
            await s.say('保存すれば、他の端末にも自動で届きます');
        }
    },
    {
        id: '2-5',
        title: '施術の前に、組み立てを考える',
        run: async (s) => {
            await s.say('施術の前に、組み立ての案を出せます');
            await s.tap('#btn-view-list');
            await s.tap('.customer-card-grid-item', { nth: 0 });
            await s.tap('.detail-subtab-btn[data-tab="visit-type"]');
            if (await s.has('.history-summary')) {
                await s.tap('.history-summary', { nth: 0 });
                await s.say('記録を開き、「✏️ 変更」を押します');
                if (await s.has('.btn-edit-record')) await s.tap('.btn-edit-record', { nth: 0 });
            }
            await s.say('ここに「下ごしらえを作る」があります');
            if (await s.has('#btn-record-session-advice')) {
                await s.look('#btn-record-session-advice', { ms: 2400 });
            }
            await s.say('経過と、その日の星を踏まえた案が出ます');
            await s.say('訴えを先に書くと「訴えを反映して作り直す」に変わります');
            await s.say('出るのは案です。そのまま使わず、手で直してください');
        }
    },
    {
        id: '2-7',
        title: '前に使った精油を調べる',
        run: async (s) => {
            await s.say('「前に使った精油は？」と聞かれたときです');
            await s.tap('#btn-view-list');
            await s.say('上の検索欄に、名前を打ちます');
            if (await s.has('#search-input')) {
                await s.type('#search-input', '山田');
                await s.say('名前・よみがな・顧客No. で絞れます');
            }
            await s.tap('.customer-card-grid-item', { nth: 0 });
            await s.tap('.detail-subtab-btn[data-tab="visit-type"]');
            await s.say('「カルテ」を開き、その回を押します');
            if (await s.has('.history-summary')) {
                await s.tap('.history-summary', { nth: 0 });
                await s.say('「処方」の欄に、使ったものが書いてあります');
                await s.wait(2000);
            }
        }
    },
    {
        id: '2-8',
        title: 'しばらく来ていない方を探す',
        run: async (s) => {
            await s.say('前回からどれだけ空いたかを見ます');
            await s.tap('#btn-view-list');
            await s.tap('.customer-card-grid-item', { nth: 0 });
            await s.say('「カルテ」のタブを押します');
            await s.tap('.detail-subtab-btn[data-tab="visit-type"]');
            await s.say('来店の日と、その間隔が出ます');
            await s.wait(2600);
            await s.say('声をかける目安になります');
        }
    },
    {
        id: '2-9',
        title: '金額を見る',
        run: async (s) => {
            await s.say('その方の金額を見ます');
            await s.tap('#btn-view-list');
            await s.tap('.customer-card-grid-item', { nth: 0 });
            await s.say('「売上・金額合計」のタブを押します');
            await s.tap('.detail-subtab-btn[data-tab="visit-amount"]');
            await s.say('これまでの合計が出ます');
            await s.wait(2600);
        }
    },
    {
        id: '2-11',
        title: '施術メニューを増やす',
        run: async (s) => {
            await s.say('よく使うメニューは、登録しておけます');
            await s.tap('#btn-view-calendar');
            await s.tap('.calendar-day:not(.empty):not(.other-month)', { nth: 8 });
            await s.say('施術内容の欄のそばに「施術内容を編集」があります');
            if (await s.has('.btn-manage-plans')) {
                await s.tap('.btn-manage-plans', { nth: 0 });
                await s.say('ここで足したり、消したりできます');
                await s.wait(1800);
                if (await s.has('#btn-add-new-plan')) {
                    await s.look('#btn-add-new-plan', { ms: 2000 });
                }
                await s.say('次からは、選ぶだけになります');
                if (await s.has('#btn-close-plan-modal')) await s.tap('#btn-close-plan-modal');
            }
        }
    },
    {
        id: '2-12',
        title: '使い方を人に教える',
        run: async (s) => {
            await s.say('新しく入った方に、使い方を見せるときです');
            await s.tap('#btn-view-list');
            await s.say('「使い方」を押します');
            await s.tap('#btn-demo-guide');
            await s.say('画面が実際に動いて、手順を見せてくれます');
            await s.wait(2200);
            await s.say('登録・問診・予約・カルテ・星詠みが入っています');
            await s.wait(2000);
            await s.say('読むより早いので、まずこちらを勧めてください');
            if (await s.has('#btn-close-demo-modal')) await s.tap('#btn-close-demo-modal');
        }
    },
    {
        id: '1-4',
        title: '名前の出し方を決める',
        run: async (s) => {
            await s.say('一覧やカレンダーに出す呼び名を選べます');
            await s.tap('#btn-view-color-settings');
            await s.say('設定は、たたまれた見出しに分かれています');
            await s.wait(1200);
            // 「📝 記録の設定」は畳まれている。開かないと中は見えない
            await s.say('「📝 記録の設定」を押して開きます');
            await s.tap('details.settings-group summary:has-text("記録の設定")');
            await s.wait(800);
            await s.page.evaluate(() => {
                const el = document.getElementById('name-preference');
                if (el) el.scrollIntoView({ block: 'center' });
            });
            await s.wait(900);
            if (await s.has('#name-preference')) {
                await s.look('#name-preference', { ms: 2200 });
                await s.say('ニックネーム優先か、氏名優先かを選びます');
                const btns = '#name-preference button, #name-preference label';
                if (await s.has(btns)) await s.tap(btns, { nth: 1 });
                await s.wait(1200);
            }
            await s.say('ニックネームが無い方は、どちらでも氏名で出ます');
        }
    },
    {
        id: '2-10',
        title: 'アーカイブと削除のちがい',
        run: async (s) => {
            await s.say('もう来られない方がいるときの扱いです');
            await s.tap('#btn-view-list');
            await s.tap('.customer-card-grid-item', { nth: 0 });
            await s.say('「アーカイブ」は、通常の一覧から外すだけです');
            if (await s.has('#btn-detail-archive')) await s.look('#btn-detail-archive', { ms: 2000 });
            await s.say('消えてはいません。いつでも戻せます');
            await s.say('「削除」は、他の端末からも消えます');
            if (await s.has('#btn-delete-customer')) await s.look('#btn-delete-customer', { ms: 2000 });
            await s.say('本当に要らないときだけにしてください');
        }
    },
    {
        id: '1-1',
        title: 'サロンの置き場につなぐ',
        run: async (s) => {
            await s.say('端末をまたいで同じものを見るための設定です');
            await s.say('「⚙️ 設定」を開きます');
            await s.tap('#btn-view-color-settings');
            await s.say('合言葉の欄に、サロンで決めた合言葉を入れます');
            if (await s.has('#input-salon-pass')) {
                await s.type('#input-salon-pass', '（ここにサロンの合言葉）');
                await s.say('12文字以上。すべての端末で同じものを使います');
                await s.look('#btn-salon-connect', { ms: 1800 });
            }
            await s.say('つなぐと、置き場にあるものが降りてきます');
            await s.say('合言葉を忘れると、誰にも読めません。控えてください');
        }
    },
    {
        id: '6',
        title: '控え（バックアップ）を取る',
        run: async (s) => {
            await s.say('月に1回、控えを取ってください');
            await s.say('「⚙️ 設定」を開きます');
            await s.tap('#btn-view-color-settings');
            await s.say('「📤 書き出す」を押すだけです');
            if (await s.has('#btn-export-data')) await s.look('#btn-export-data', { ms: 2200 });
            await s.say('ファイルが1つ落ちてきます');
            await s.say('この控えは暗号化されていません。そのまま読めます');
            await s.say('メール添付や共有フォルダは避けてください');
        }
    }
];

// ------------------------------------------------------------------
// 録る
// ------------------------------------------------------------------
async function record(browser, scene) {
    const ctx = await browser.newContext({
        viewport: SIZE,
        recordVideo: { dir: OUT, size: SIZE },
        deviceScaleFactor: 1
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(`    [${scene.id}] 画面のエラー:`, e.message.slice(0, 120)));

    await page.goto(BASE + 'index.html');
    await page.waitForTimeout(3200);
    await page.evaluate(installOverlay, overlayCss);
    await page.waitForTimeout(400);

    const s = makeStage(page);
    await s.say(scene.title, 2400);
    try {
        await scene.run(s);
    } catch (e) {
        console.log(`    [${scene.id}] 途中で止まった:`,
            e.message.split('\n').slice(0, 3).join(' / ').slice(0, 260));
    }
    await s.clear();
    await page.waitForTimeout(700);

    const video = page.video();
    await ctx.close();                      // 閉じてから、はじめて出来上がる
    const tmp = await video.path();
    const dest = path.join(OUT, `${scene.id}.webm`);
    fs.renameSync(tmp, dest);
    const kb = Math.round(fs.statSync(dest).size / 1024);
    console.log(`  ✅ ${scene.id}  ${scene.title}  (${kb}KB)`);
    return { id: scene.id, title: scene.title, file: `docs/videos/${scene.id}.webm`, kb };
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const only = process.argv.slice(2);
    const targets = only.length ? SCENES.filter((s) => only.includes(s.id)) : SCENES;
    if (!targets.length) {
        console.log('その番号の台本がありません:', only.join(', '));
        process.exit(1);
    }

    const browser = await chromium.launch({
        executablePath: process.env.MV_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
    });
    console.log(`録ります（${targets.length}本）`);
    const made = [];
    for (const scene of targets) {
        made.push(await record(browser, scene));
    }
    await browser.close();

    // 説明書の側から、どの見出しにどれを添えるかを引くための一覧。
    // 説明書そのもの（manual.md）には書かない。AIに渡すのは字だけでよいため。
    const indexPath = path.join(OUT, 'videos.json');
    const prev = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : [];
    const merged = [...prev.filter((p) => !made.some((m) => m.id === p.id)), ...made]
        .map(({ id, title, file }) => ({ id, title, file }))
        .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
    fs.writeFileSync(indexPath, JSON.stringify(merged, null, 2) + '\n');

    const total = made.reduce((a, m) => a + m.kb, 0);
    console.log(`\n合わせて ${Math.round(total / 1024 * 10) / 10}MB / ${made.length}本`);
    console.log(`一覧: ${indexPath}`);
})();
