// 取扱説明書の動画の台本。番号は manual.md の見出しの番号と同じ。
//
// 話す人
//   tsumugi … 春日部つむぎ。セラピスト役。「こういうとき、どうする？」と場面を持ち込む
//   himari  … 冥鳴ひまり。案内役。落ち着いて手順を説明する
//   zunda   … ずんだもん。ときどき確かめたり、まとめたりする
//
// 台詞は字幕にそのまま出し、読み上げは build-manual-videos.js の READINGS で読みに直す
// （顧客No. → こきゃくナンバー、絵文字は読まない、など）。
// 読みを直に決めたいときは ['字幕', 'よみ'] と書く。
//
// 説明書（manual.md）に書いていないことは言わない。
// 出てくるのは、アプリに元から入っている見本のお客様だけ。

// ── よく使う動き ─────────────────────────────────────────────
const openList = (s) => s.tap('#btn-view-list', { settle: 600 });

const openCustomer = async (s, nth = 0) => {
    await openList(s);
    await s.tap('.customer-card-grid-item', { nth, settle: 1000 });
};

const openKarteTab = (s) => s.tap('.detail-subtab-btn[data-tab="visit-type"]', { settle: 800 });

const openSettings = (s) => s.tap('#btn-view-color-settings', { settle: 900 });

/** カレンダーを、見本の記録がある7月まで戻す（今月には見本の予約がないため） */
const calendarToJuly = async (s) => {
    await s.tap('#btn-view-calendar', { settle: 800 });
    for (let i = 0; i < 12; i += 1) {
        const title = await s.page.textContent('#calendar-month-title').catch(() => '');
        if (!title || /7月|July|07/.test(title)) break;
        await s.page.click('#calendar-prev-btn');
        await s.wait(250);
    }
    await s.wait(500);
};

/** マスを押したあと、下に出たその日の一覧が見えるところまで送る */
const showDayList = async (s) => {
    await s.page.evaluate(() => { window.__mvDot(-100, -100, false); window.__mvRing(null); });
    await s.page.evaluate(() => {
        const el = document.querySelector('#calendar-visits-container .calendar-visit-item')
            || document.getElementById('calendar-day-details');
        if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    await s.wait(700);
};

/** 開いた記録の中身が見えるところまで送る */
const showOpenedRecord = async (s) => {
    await s.page.evaluate(() => { window.__mvDot(-100, -100, false); window.__mvRing(null); });
    await s.page.evaluate(() => {
        const el = document.querySelector('.history-summary');
        const box = el && (el.closest('details, .history-item, .visit-card') || el.parentElement);
        if (box) box.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    await s.wait(700);
};

/** 予約のない日のマスを押して、記録を書く画面を開く */
const openWriteFromCalendar = async (s, { talk = true } = {}) => {
    await s.tap('#btn-view-calendar', { settle: 800 });
    await s.tap('.calendar-day:not(.empty):not(.other-month)', { nth: 8 });
    await s.tap('#btn-open-booking', { settle: 900 });
    if (talk) await s.look('#btn-booking-write', { ms: 200, keep: true });
    await s.tap('#btn-booking-write', { settle: 1000 });
};

/** 🐬 の「＋ 施術を追加」から施術を選ぶ */
const addMenu = async (s, name) => {
    const open = await s.page.locator('.dol-picker-chips').isVisible().catch(() => false);
    if (!open) await s.tap('#btn-dol-toggle', { settle: 500 });
    await s.tap(`[data-dol-add]:has-text("${name}")`, { settle: 700 });
};

/** 見本の方の、いちばん新しい記録を開いて編集できるようにする */
const openLatestRecordForEdit = async (s) => {
    await openCustomer(s, 0);
    await openKarteTab(s);
    await s.tap('.history-summary', { nth: 0, settle: 700 });
    await s.tap('.btn-edit-record', { nth: 0, settle: 1000 });
    if (await s.has('#btn-toggle-edit-record')) await s.tap('#btn-toggle-edit-record', { settle: 700 });
};

module.exports = [
    // ================================================================
    // 1. 最初にすること
    // ================================================================
    {
        id: '1-1',
        title: 'サロンの置き場につなぐ',
        run: async (s) => {
            await s.say('tsumugi', '新しいタブレットでも、同じカルテを見たいんです。');
            await s.say('himari', 'サロンの置き場につなぎましょう。まず「⚙️ 設定」を開きます。');
            await openSettings(s);
            await s.look('#input-salon-pass', { ms: 200, keep: true });
            await s.say('himari', '合言葉の欄に、サロンで決めた合言葉を入れます。12文字以上です。');
            await s.unring();
            await s.type('#input-salon-pass', 'sample-pass-0000');
            await s.look('#btn-salon-connect', { ms: 200, keep: true });
            await s.say('himari', '「つなぐ」を押すと、置き場にあるものが降りてきます。');
            await s.unring();
            await s.say('zunda', '合言葉は、どの端末でも同じにするのだ。');
            await s.say('himari', '合言葉を忘れると、置いてあるものは誰にも読めません。必ず控えておいてください。');
        }
    },
    {
        id: '1-2',
        title: '2台目・3台目',
        run: async (s) => {
            await s.say('tsumugi', 'スマホとパソコンでも使いたいです。台数に決まりはありますか？');
            await s.say('himari', '上限はありません。パソコン・スマホ・タブレットを混ぜても大丈夫です。');
            await openSettings(s);
            await s.look('#input-salon-pass', { ms: 200, keep: true });
            await s.say('himari', 'やることは1台目と同じです。同じ合言葉を入れて、つなぐだけです。');
            await s.unring();
            await s.say('zunda', '合言葉が1文字でも違うと、別の置き場になって揃わないのだ。');
        }
    },
    {
        id: '1-4',
        title: '名前の出し方を決める',
        run: async (s) => {
            await s.say('tsumugi', 'カレンダーに、ニックネームではなくお名前で出したいです。');
            await s.say('himari', '「⚙️ 設定」の「📝 記録の設定」で選べます。');
            await openSettings(s);
            await s.tap('details.settings-group summary:has-text("記録の設定")', { settle: 700 });
            await s.page.evaluate(() => {
                const el = document.getElementById('name-preference');
                if (el) el.scrollIntoView({ block: 'center' });
            });
            await s.look('#name-preference', { ms: 200, keep: true });
            await s.say('himari', '「一覧に出す呼び名」で、ニックネーム優先か、氏名優先かを選びます。');
            await s.unring();
            const btns = '#name-preference button, #name-preference label';
            if (await s.has(btns)) await s.tap(btns, { nth: 1, settle: 600 });
            await s.say('himari', '氏名優先にすると「山田 花子」のように出ます。');
            await s.say('zunda', 'ニックネームが無い方は、どちらでも氏名で出るのだ。');
        }
    },

    // ================================================================
    // 2. こういうときは
    // ================================================================
    {
        id: '2-1',
        title: '予約の電話が入った',
        run: async (s) => {
            await s.say('tsumugi', 'あ、予約のお電話です。どこに入れればいいですか？');
            await s.say('himari', '「📅 カレンダー」を開いて、その日のマスを押します。');
            await s.tap('#btn-view-calendar', { settle: 800 });
            await s.tap('.calendar-day:not(.empty):not(.other-month)', { nth: 8 });
            await s.look('#btn-open-booking', { ms: 200, keep: true });
            await s.say('himari', 'カレンダーの上の「予約・施術記録を追加」を押します。');
            await s.tap('#btn-open-booking', { settle: 900 });
            await s.look('#btn-booking-write', { ms: 200, keep: true });
            await s.say('himari', 'その日の予約が出ます。「✍️ この日の記録を書く」を押します。');
            await s.tap('#btn-booking-write', { settle: 1000 });
            await s.look('#input-record-customer-id', { ms: 200, keep: true });
            await s.say('himari', 'お客様を選び、時間を選びます。');
            await s.page.selectOption('#input-record-customer-id', { index: 1 }).catch(() => {});
            await s.page.selectOption('#input-time', { index: 20 }).catch(() => {});
            await s.look('#input-time', { ms: 700 });
            await s.say('himari', '🐬 の「＋ 施術を追加」から、施術を選びます。あとで変えられます。');
            await addMenu(s, '再診');
            await s.say('tsumugi', '訴えやメモは、まだ空でいいですか？');
            await s.say('himari', 'はい。施術のあとで書き足せます。');
            await s.look('#btn-submit-record', { ms: 200, keep: true });
            await s.say('himari', '最後に「記録する」。カレンダーのマスに、その方の札が出ます。');
            await s.unring();
        }
    },
    {
        id: '2-2',
        title: 'はじめてのお客様を登録する',
        run: async (s) => {
            await s.say('tsumugi', 'はじめてのお客様がいらっしゃいました。');
            await s.say('himari', '「👥 顧客一覧」の「＋ 顧客登録」から登録します。');
            await openList(s);
            await s.tap('#btn-add-customer', { settle: 900 });
            await s.look('#input-customer-no', { ms: 200, keep: true });
            await s.say('himari', '顧客No. は、次の番号が自動で入っています。書き換えてもかまいません。');
            await s.unring();
            await s.say('zunda', 'でも、ほかの方と同じ番号にはできないのだ。');
            await s.say('himari', '必ず要るのは、氏名だけです。');
            await s.type('#input-name', '青木 みどり');
            await s.look('#input-kana', { ms: 200, keep: true });
            await s.say('himari', 'よみがなは、氏名を打つと自動で入ります。違っていれば直してください。');
            await s.unring();
            await s.type('#input-nickname', 'みどりさん');
            await s.say('himari', '生年月日は、星の見立てに使います。');
            await s.look('#input-birthday', { ms: 900 });
            await s.say('tsumugi', '問診の途中で、全部埋まらなかったら？');
            await s.say('himari', '初診の6つの枠は、あとから「👤 お客様の情報」で書き足せます。');
            await s.look('#btn-submit-customer', { ms: 200, keep: true });
            await s.say('himari', '最後に「登録する」を押します。');
            await s.unring();
        }
    },
    {
        id: '2-3',
        title: '今日は誰が来るか見たい',
        run: async (s) => {
            await s.say('tsumugi', '今日は、どなたがいらっしゃるんでしたっけ？');
            await s.say('himari', '「📅 カレンダー」を開いて、その日のマスを見ます。');
            await calendarToJuly(s);
            await s.look('.calendar-day:has(.calendar-name-card)', { ms: 200, keep: true });
            await s.say('himari', 'マスの中に、名前の札が最大2枚出ます。3人以上は「他◯人」とまとまります。');
            await s.unring();
            await s.tap('.calendar-day:has(.calendar-name-card)', { nth: 0, settle: 900 });
            await showDayList(s);
            await s.wait(500);
            await s.say('himari', 'マスを押すと、その日の全員が下に出ます。');
            await s.say('zunda', '字が小さくても、押せば読みやすい大きさで出るのだ。');
        }
    },
    {
        id: '2-4',
        title: '施術の前に、前回どうだったか見たい',
        run: async (s) => {
            await s.say('tsumugi', 'もうすぐ山田さんの番。前回どうだったかな。');
            await s.say('himari', '顧客一覧で、その方のカードを押します。');
            await openCustomer(s, 0);
            await s.look('.detail-subtab-btn[data-tab="visit-type"]', { ms: 200, keep: true });
            await s.say('himari', '📋 のタブに、来店ごとの記録が新しい順に並びます。');
            await openKarteTab(s);
            await s.say('himari', '見たい回を押すと、訴えやメモ、施術と写真が開きます。');
            await s.tap('.history-summary', { nth: 0, settle: 800 });
            await showOpenedRecord(s);
            await s.say('zunda', '書いたものだけが出るのだ。空の欄は出てこないのだ。');
        }
    },
    {
        id: '2-5',
        title: '施術の前に、組み立てを考えたい',
        run: async (s) => {
            await s.say('tsumugi', '今日の施術、どう組み立てようかな。');
            await s.say('himari', '「📋 カルテ」のタブを上から見てください。前回、前々回の訴えとメモが並んでいます。');
            await openCustomer(s, 0);
            await openKarteTab(s);
            await s.wait(600);
            await s.look('.detail-subtab-btn[data-tab="color-star"]', { ms: 200, keep: true });
            await s.say('himari', '✨ のタブには、体質から絞り込んだ「⛔ 使わない精油」が出ます。');
            await s.tap('.detail-subtab-btn[data-tab="color-star"]', { settle: 1200 });
            await s.wait(600);
            await s.say('zunda', 'AIの組み立て案「下ごしらえ」は、いまは使わない設定なのだ。');
            await s.say('himari', '使うときは、設定の「🤖 AI の設定」で切り替えます。');
        }
    },
    {
        id: '2-6',
        title: '施術のあと、記録を書く',
        run: async (s) => {
            await s.say('tsumugi', '施術が終わりました。記録を書きます。');
            await s.say('himari', '予約のときに作った記録を、そのまま開いて書き足します。新しく作り直さないでくださいね。');
            await openCustomer(s, 0);
            await openKarteTab(s);
            await s.tap('.history-summary', { nth: 0, settle: 700 });
            await s.look('.btn-edit-record', { ms: 200, keep: true });
            await s.say('himari', '記録の下の「✏️」を押します。');
            await s.tap('.btn-edit-record', { nth: 0, settle: 1000 });
            if (await s.has('#btn-toggle-edit-record')) {
                await s.look('#btn-toggle-edit-record', { ms: 200, keep: true });
                await s.say('himari', '開いた直後は、読むだけです。「編集を有効にする」を押します。');
                await s.tap('#btn-toggle-edit-record', { settle: 700 });
            }
            await s.say('himari', '🌸 には、お客様が言ったことを書きます。');
            await s.type('#input-client-complaint', '右肩の重だるさ');
            await s.say('himari', '🐬 の「＋ 施術を追加」で、した施術を足します。施術ごとにカードができます。');
            await addMenu(s, '延長');
            await s.look('[data-dol-amount] >> nth=-1', { ms: 200, keep: true });
            await s.say('himari', '金額は定価が入っています。割引などは書き換えてください。その日だけの金額になります。');
            await s.unring();
            await s.type('[data-dol-memo] >> nth=-1', '首まわりを追加で15分');
            await s.say('himari', 'メモには、その施術で気づいたことを。📷 で写真も付けられます。');
            await s.look('#record-dolphin-total', { ms: 200, keep: true });
            await s.say('zunda', '合計は、カードの金額を足したものなのだ。');
            await s.look('#btn-submit-record', { ms: 200, keep: true });
            await s.say('himari', '最後に「記録する」で保存します。');
            await s.unring();
        }
    },
    {
        id: '2-7',
        title: '「前に使った精油は？」と聞かれた',
        run: async (s) => {
            await s.say('tsumugi', '「前に使った精油、なんでしたっけ？」って聞かれました。');
            await s.say('himari', '急ぐときは、顧客一覧の検索で名前を打ちます。');
            await openList(s);
            await s.type('#search-input', '山田');
            await s.tap('.customer-card-grid-item', { nth: 0, settle: 1000 });
            await s.say('himari', '「📋 カルテ」のタブを開き、その回の記録を押します。');
            await openKarteTab(s);
            await s.tap('.history-summary', { nth: 0, settle: 800 });
            await showOpenedRecord(s);
            await s.say('himari', 'その回に使ったもの、お渡ししたものは、処方や 🍀 item の欄に書いてあります。');
            await s.wait(600);
            await s.say('zunda', '上から順に見ていけば、すぐ見つかるのだ。');
        }
    },
    {
        id: '2-8',
        title: 'しばらく来ていない方を探したい',
        run: async (s) => {
            await s.say('tsumugi', '最近いらしてない方に、お声がけしたいな。');
            await openCustomer(s, 0);
            await openKarteTab(s);
            await s.look('.history-summary', { nth: 0, ms: 10 });
            await s.page.evaluate(() => window.scrollTo(0, 0));
            await s.say('himari', '📋 タブの頭に、通算回数・最終施術日・平均ペースが出ます。');
            await s.wait(600);
            await s.say('himari', '記録ごとにも「前回来店から◯日ぶり」が付きます。');
            await s.say('zunda', '平均ペースより空いていたら、声をかける目安なのだ。');
        }
    },
    {
        id: '2-9',
        title: '今月いくらになったか見たい',
        run: async (s) => {
            await s.say('tsumugi', 'この方の金額を、まとめて見られますか？');
            await openCustomer(s, 0);
            await s.look('.detail-subtab-btn[data-tab="visit-amount"]', { ms: 200, keep: true });
            await s.say('himari', 'カルテの「💴 金額」タブを押します。');
            await s.tap('.detail-subtab-btn[data-tab="visit-amount"]', { settle: 1200 });
            await s.say('himari', 'その方の合計が出ます。');
            await s.wait(1200);
        }
    },
    {
        id: '2-10',
        title: 'もう来られなくなった方がいる',
        run: async (s) => {
            await s.say('tsumugi', '遠くへお引っ越しされた方がいて…。');
            await openCustomer(s, 0);
            await s.look('#btn-detail-archive', { ms: 200, keep: true });
            await s.say('himari', '名前の行の右にある「📦」を押すと、通常の一覧から外れます。');
            await s.say('himari', '消えたわけではありません。アーカイブから、いつでも戻せます。');
            await s.unring();
            await s.look('#btn-delete-customer', { ms: 200, keep: true });
            await s.say('zunda', '「🗑️ 削除」は、ほかの端末からも消えるのだ。');
            await s.say('himari', '削除は、本当に要らないときだけにしてください。');
            await s.unring();
        }
    },
    {
        id: '2-11',
        title: '施術メニューを増やしたい',
        run: async (s) => {
            await s.say('tsumugi', 'ペア施術を始めたので、メニューに足したいです。');
            await s.say('himari', '記録を書く画面の、🐬「＋ 施術を追加」から足せます。');
            await openWriteFromCalendar(s, { talk: false });
            await s.tap('#btn-dol-toggle', { settle: 600 });
            await s.look('#btn-dol-menu-edit', { ms: 200, keep: true });
            await s.say('himari', '横に出る「⚙️ メニューを編集」を押します。');
            await s.tap('#btn-dol-menu-edit', { settle: 1000 });
            await s.say('himari', '決めるのは、アイコン・名前・金額・開く書く欄の4つです。');
            if (await s.has('#new-plan-name')) await s.type('#new-plan-name', 'ペア施術');
            await s.say('zunda', '金額は「決まった額」「その都度」「持たない」から選べるのだ。');
            if (await s.has('#new-plan-kind')) await s.look('#new-plan-kind', { ms: 900 });
            await s.say('himari', '次からは、選ぶだけになります。');
        }
    },
    {
        id: '2-12',
        title: '使い方を人に教えたい',
        run: async (s) => {
            await s.say('tsumugi', '新しく入ったスタッフに、使い方を教えたいです。');
            await openList(s);
            await s.look('#btn-demo-guide', { ms: 200, keep: true });
            await s.say('himari', '一覧の「📖 使い方」を押します。');
            await s.tap('#btn-demo-guide', { settle: 1200 });
            await s.say('himari', '画面が実際に動いて、手順を見せてくれる案内が入っています。');
            await s.say('himari', '登録、問診、予約、カルテ、星詠み、AIキーの登録です。');
            await s.say('zunda', '読むより早いから、まずこれを見てもらうのだ。');
            if (await s.has('#btn-close-demo-modal')) await s.tap('#btn-close-demo-modal');
        }
    },
    {
        id: '2-13',
        title: 'お客様の情報を直したい',
        run: async (s) => {
            await s.say('tsumugi', 'お客様のアレルギーが増えたので、直したいです。');
            await openCustomer(s, 0);
            await s.look('#detail-name-open', { ms: 200, keep: true });
            await s.say('himari', 'カルテの名前を押すと、👤 お客様の情報が開きます。');
            await s.tap('#detail-name-open', { settle: 1000 });
            await s.say('himari', '開いた直後は、読むだけです。');
            await s.look('#btn-personal-edit', { ms: 200, keep: true });
            await s.say('himari', '「✏️ 編集する」を押すと、全部の欄がまとめて入力できる形になります。');
            await s.tap('#btn-personal-edit', { settle: 1000 });
            await s.look('#pe-customer-no', { ms: 200, keep: true });
            await s.say('himari', '顧客No.、電話、生年月日、体質やアレルギー、初診の枠もここで直せます。');
            await s.unring();
            if (await s.has('#constitution-editor details')) await s.look('#constitution-editor details', { ms: 900 });
            await s.type('#pe-memo', 'お茶は温かいほうじ茶');
            await s.look('#btn-pe-save', { ms: 200, keep: true });
            await s.say('himari', '最後に「💾 保存する」を1回押せば、全部まとめて保存されます。');
            await s.say('zunda', ['保存するまでは、何も書き換わらないのだ。やめるときは「やめる」なのだ。', '保存するまでは、何も書き換わらないのだ。やめるときは、やめるボタンなのだ。']);
            await s.unring();
        }
    },
    {
        id: '2-14',
        title: '開発者にサンプルを見せたい',
        run: async (s) => {
            await s.say('tsumugi', '開発の方に、画面を見てもらいたいです。');
            await s.say('himari', '見せるのは、サンプルの方だけにします。「⚙️ 設定」を開きます。');
            await openSettings(s);
            await s.look('#btn-export-sample', { ms: 200, keep: true });
            await s.say('himari', '「🧪 サンプル（C-0000）だけ書き出す」を押します。');
            await s.say('himari', '顧客No. C-0000 の方だけが入ったファイルができます。ほかの方は1人も入りません。');
            await s.unring();
            await s.say('zunda', '受け取った側は「📥 読み込む」で取り込むのだ。');
        }
    },

    // ================================================================
    // 3. 画面ごとの説明
    // ================================================================
    {
        id: '3-1',
        title: '👥 顧客一覧',
        run: async (s) => {
            await s.say('tsumugi', 'お客様がたくさんになってきて、探すのが大変なんです。');
            await s.say('himari', 'では、顧客一覧の見方をご案内しますね。');
            await openList(s);
            await s.look('#search-input', { ms: 200, keep: true });
            await s.say('himari', '上の検索欄に、名前・よみがな・顧客No. を入れると絞り込めます。');
            await s.unring();
            await s.type('#search-input', 'やまだ');
            await s.say('zunda', 'よみがなでも出てきたのだ！');
            await s.type('#search-input', '');
            await s.look('.customer-card-grid-item', { ms: 200, keep: true });
            await s.say('himari', 'カードの枠の色は、その方の Soul Color の1色目です。');
            await s.unring();
            await s.say('tsumugi', 'カードを押すと、どうなりますか？');
            await s.tap('.customer-card-grid-item', { nth: 0, settle: 1100 });
            await s.say('himari', 'その方のカルテが開きます。');
            await openList(s);
            await s.look('#btn-add-customer', { ms: 200, keep: true });
            await s.say('himari', '新しい方は「顧客登録」から登録します。');
            await s.look('label[for="check-show-archived"]', { ms: 200, keep: true });
            await s.say('himari', ['「📦 アーカイブ」を押すと、一覧から外した方も見られます。',
                'アーカイブをおすと、一覧から外したかたも見られます。']);
            await s.unring();
            await s.say('zunda', '探す、開く、増やす。一覧でするのは、この3つなのだ。');
        }
    },
    {
        id: '3-2',
        title: '📅 カレンダー',
        run: async (s) => {
            await s.say('tsumugi', 'カレンダーの見方を教えてください。');
            await calendarToJuly(s);
            await s.look('#calendar-prev-btn', { ms: 200, keep: true });
            await s.say('himari', '「◀」「▶」で月を移動します。');
            await s.look('.calendar-day:has(.calendar-name-card)', { ms: 200, keep: true });
            await s.say('himari', 'マスの札は、その日に来る方です。スマホでは、札は姓だけで出ます。');
            await s.unring();
            await s.tap('.calendar-day:has(.calendar-name-card)', { nth: 0, settle: 900 });
            await showDayList(s);
            await s.wait(400);
            await s.say('himari', 'マスを押すと、その日の全員が下に出ます。');
            await s.say('himari', '行を押すと、未来なら予約の内容、過去ならカルテが開きます。');
            await s.page.evaluate(() => window.scrollTo(0, 0));
            await s.look('#btn-open-booking', { ms: 200, keep: true });
            await s.say('zunda', '予約を入れるときは、上の「予約・施術記録を追加」なのだ。');
            await s.unring();
        }
    },
    {
        id: '3-3',
        title: '📋 カルテ（お客様の詳細）',
        run: async (s) => {
            await s.say('tsumugi', 'カルテの画面、タブがいくつかありますね。');
            await openCustomer(s, 0);
            await s.say('himari', '上の帯に、タブが4つあります。');
            await s.look('.detail-subtab-btn[data-tab="visit-type"]', { ms: 200, keep: true });
            await s.say('himari', '📋 カルテは、来店ごとの記録。いちばん使うところです。');
            await s.tap('.detail-subtab-btn[data-tab="visit-calendar"]', { settle: 900 });
            await s.say('himari', '🗓️ は、その方の来店だけを月で表示します。');
            await s.tap('.detail-subtab-btn[data-tab="visit-amount"]', { settle: 900 });
            await s.say('himari', '💴 は、同じ記録を金額の側から見たものです。');
            await s.tap('.detail-subtab-btn[data-tab="color-star"]', { settle: 1100 });
            await s.say('himari', '✨ は、色と星の見立てと、使わない精油です。');
            await s.page.evaluate(() => window.scrollTo(0, 0));
            await s.look('#detail-name-open', { ms: 200, keep: true });
            await s.say('zunda', '名前を押すと、👤 お客様の情報が開くのだ。');
            await s.unring();
            await s.look('#btn-detail-archive', { ms: 200, keep: true });
            await s.say('himari', '📦 アーカイブと 🗑️ 削除は、名前の行の右側にあります。');
            await s.unring();
        }
    },
    {
        id: '3-4',
        title: '✨ 星詠みメッセージ',
        run: async (s) => {
            await s.say('tsumugi', '星詠みメッセージって、いつ変わるんですか？');
            await s.tap('#btn-view-advice', { settle: 1500 });
            await s.say('himari', '毎朝5時台に、自動で書き直されます。ウェブで暦や天気を調べてから書いています。');
            await s.look('#advice-period-tabs', { ms: 200, keep: true });
            await s.say('himari', '上のタブで、今日・1週間・1か月などを切り替えます。');
            await s.unring();
            await s.look('#advice-content', { ms: 200, keep: true });
            await s.say('himari', 'いちばん上の「今日の空と体調」に、空の出来事と、天気から見た体の状態が出ます。');
            await s.unring();
            await s.page.evaluate(() => {
                const el = Array.from(document.querySelectorAll('#advice-view-container *'))
                    .find((n) => n.children.length === 0 && /参考にしたページ/.test(n.textContent));
                if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
            });
            await s.wait(900);
            await s.say('himari', '本文の下には「🔎 参考にしたページ」が出ます。');
            await s.say('zunda', ['体調のことは「〜しやすい」まで。診断ではないのだ。', '体調のことは、しやすい、というところまで。診断ではないのだ。']);
        }
    },
    {
        id: '3-5',
        title: '🌿 星とアロマ',
        run: async (s) => {
            await s.say('tsumugi', '「🌿 星とアロマ」は何の画面ですか？');
            await s.tap('#btn-view-astro-aroma', { settle: 1500 });
            await s.say('himari', '色・星・チャクラ・アロマの対応表です。見立ての参考にしてください。');
            await s.page.mouse.wheel(0, 500);
            await s.wait(900);
            await s.say('zunda', 'お客様のデータは使わない、読むだけの表なのだ。');
        }
    },
    {
        id: '3-6',
        title: '⚙️ 設定',
        run: async (s) => {
            await s.say('tsumugi', '設定の画面、どこに何があるか分からなくて…。');
            await openSettings(s);
            await s.look('#salon-panel', { ms: 200, keep: true });
            await s.say('himari', 'いちばん上が、置き場につなぐ合言葉の欄です。');
            await s.unring();
            await s.look('#btn-export-data', { ms: 200, keep: true });
            await s.say('himari', 'その下に、控えの「📤 書き出す」と「📥 読み込む」があります。');
            await s.unring();
            await s.look('details.settings-group summary:has-text("記録の設定")', { ms: 200, keep: true });
            await s.say('himari', 'その下は、たたまれた見出しです。押して開かないと、中が見えません。');
            await s.unring();
            await s.say('zunda', '探しているものが無いときは、たたまれていないか見るのだ。');
        }
    },

    // ================================================================
    // 4. カルテの中身
    // ================================================================
    {
        id: '4-1',
        title: '2つの層（その人のこと・その日のこと）',
        run: async (s) => {
            await s.say('tsumugi', 'アレルギーは、どこに書けばいいんでしたっけ？');
            await s.say('himari', 'カルテは「その人のこと」と「その日のこと」に分かれています。');
            await openCustomer(s, 0);
            await s.look('#detail-name-open', { ms: 200, keep: true });
            await s.say('himari', 'その人のことは、名前を押すと開く 👤 に。変わらない情報です。');
            await s.tap('#detail-name-open', { settle: 1000 });
            await s.say('himari', '体質とアレルギーはここです。✨ の「使わない精油」に、そのまま効きます。');
            await s.page.evaluate(() => window.scrollTo(0, 0));
            await openKarteTab(s);
            await s.say('himari', 'その日のことは、📋 の中の1件ずつ。訴えや施術、金額はこちらです。');
            await s.tap('.history-summary', { nth: 0, settle: 900 });
            await s.say('zunda', '変わらないことは 👤、その日のことは 📋 なのだ。');
        }
    },
    {
        id: '4-2',
        title: 'その日のこと（1件の記録）',
        run: async (s) => {
            await s.say('tsumugi', '1回の記録には、何を書けばいいですか？');
            await openLatestRecordForEdit(s);
            await s.look('#input-date', { ms: 200, keep: true });
            await s.say('himari', '来店日で、予約かカルテかが決まります。これだけは空にできません。');
            await s.unring();
            await s.look('#input-client-complaint', { ms: 200, keep: true });
            await s.say('himari', '🌸 訴えには、お客様が言ったことを書きます。');
            await s.unring();
            await s.look('#record-dolphin', { ms: 200, keep: true });
            await s.say('himari', '🐬 には施術ごとに、金額・メモ・写真を。これは、あなたが気づいたことです。');
            await s.unring();
            await s.say('zunda', '言われたことと、見て取ったことは、分けて書くのだ。');
            await s.look('#input-therapist-note', { ms: 200, keep: true });
            await s.say('himari', '全体の気付きには、施術をまたいだ気づきや、次回への申し送りを書きます。');
            await s.unring();
        }
    },
    {
        id: '4-3',
        title: '施術は 🐬 の中で選びます',
        run: async (s) => {
            await s.say('tsumugi', '施術の選び方が変わったと聞きました。');
            await openWriteFromCalendar(s, { talk: false });
            await s.look('#btn-dol-toggle', { ms: 200, keep: true });
            await s.say('himari', '施術は、🐬 の中の「＋ 施術を追加」から選びます。');
            await s.unring();
            await addMenu(s, '月set');
            await s.say('himari', '選ぶと、施術ごとにカードが1枚できます。金額は定価から始まります。');
            await s.page.fill('[data-dol-amount] >> nth=-1', '').catch(() => {});
            await s.type('[data-dol-amount] >> nth=-1', '32000');
            await s.page.keyboard.press('Tab').catch(() => {});
            await s.wait(500);
            await s.look('.dol-price-note >> nth=-1', { ms: 200, keep: true });
            await s.say('himari', '書き換えると「定価から変更（今回だけ）」と出ます。空にすると定価に戻ります。');
            await s.unring();
            await addMenu(s, 'color');
            await s.say('zunda', '🌈 color を足したときだけ、選んだ色の欄が開くのだ。');
            await s.look('#record-dolphin-total', { ms: 200, keep: true });
            await s.say('himari', '合計は、カードの金額を足したものです。');
            await s.unring();
        }
    },
    {
        id: '4-5',
        title: 'メニューを足す・直す',
        run: async (s) => {
            await s.say('tsumugi', 'メニューの金額を、変えることはできますか？');
            await openWriteFromCalendar(s, { talk: false });
            await s.tap('#btn-dol-toggle', { settle: 600 });
            await s.look('#btn-dol-menu-edit', { ms: 200, keep: true });
            await s.say('himari', '🐬「＋ 施術を追加」の横の「⚙️ メニューを編集」からです。');
            await s.tap('#btn-dol-menu-edit', { settle: 1000 });
            await s.say('himari', '決めるのは、アイコン・名前・金額・開く書く欄の4つです。');
            if (await s.has('#new-plan-icon')) await s.look('#new-plan-icon', { ms: 700 });
            await s.say('himari', '足せるのは、押すものだけです。書く欄そのものは増やせません。');
            await s.say('zunda', 'メニューを消しても、もう書いた記録は消えないのだ。');
        }
    },

    // ================================================================
    // 6. 控えを取る
    // ================================================================
    {
        id: '6-2',
        title: '控えを取る（やり方）',
        run: async (s) => {
            await s.say('tsumugi', '控えは、どうやって取るんですか？');
            await openSettings(s);
            await s.look('#btn-export-data', { ms: 200, keep: true });
            await s.say('himari', '「⚙️ 設定」の「📤 書き出す」を押すだけです。ファイルが1つできます。');
            await s.say('himari', 'iPhone・iPad では共有メニューが開くので、「"ファイル"に保存」を選んでください。');
            await s.unring();
            await s.say('zunda', '月に1回が目安なのだ。');
            await s.say('himari', '書き出したファイルは暗号化されていません。メールや共有フォルダは避けてください。');
        }
    },
    {
        id: '6-5',
        title: '控えから戻す',
        run: async (s) => {
            await s.say('tsumugi', '間違えて消してしまいました…！');
            await s.say('himari', '控えがあれば戻せます。「⚙️ 設定」を開きます。');
            await openSettings(s);
            await s.look('label:has(#input-import-data)', { ms: 200, keep: true });
            await s.say('himari', '「📥 読み込む」を押して、控えのファイルを選びます。');
            await s.unring();
            await s.say('zunda', '控えが無いと戻せないのだ。だから、控えを取っておくのだ。');
        }
    },

    // ================================================================
    // 7. 困ったとき
    // ================================================================
    {
        id: '7-1',
        title: '他の端末に反映されない',
        run: async (s) => {
            await s.say('tsumugi', 'スマホで書いたのに、パソコンに出てこないんです。');
            await s.say('himari', 'まず「⚙️ 設定」で、つながっているか確かめます。');
            await openSettings(s);
            await s.look('#salon-panel', { ms: 200, keep: true });
            await s.say('himari', '合言葉が、他の端末と同じかも確かめてください。1文字違うだけで揃いません。');
            await s.unring();
            await s.say('himari', '電波も確かめて、それでも駄目なら「🔄 いま同期する」を押します。');
            await s.say('zunda', 'つながっているときだけ、そのボタンが出るのだ。');
        }
    },
    {
        id: '7-8',
        title: '金額が「未定」のまま',
        run: async (s) => {
            await s.say('tsumugi', '合計に「未入力」と出ています。');
            await openWriteFromCalendar(s, { talk: false });
            await addMenu(s, 'item');
            await s.look('#record-dolphin-total', { ms: 200, keep: true });
            await s.say('himari', 'item・講座・W.S・その他のカードは、金額が空から始まります。');
            await s.say('himari', '空のままだと、合計に「＋ 未入力」と出ます。入れ忘れを「無料」と見分けるためです。');
            await s.unring();
            await s.type('[data-dol-amount] >> nth=-1', '3000');
            await s.page.keyboard.press('Tab').catch(() => {});
            await s.wait(400);
            await s.look('#record-dolphin-total', { ms: 200, keep: true });
            await s.say('zunda', '金額を入れれば、合計に入るのだ。');
            await s.unring();
        }
    }
];
