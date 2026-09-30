// セラピスト向け顧客管理アプリ：データ管理モジュール (Core Logic)

// [ISSUE-018] Soul Color は最大5色まで登録できる（上段3色・下段2色で表示）
export const MAX_SOUL_COLORS = 5;

// 選択可能なソウルカラー（表示順）。UI側のチップ生成もこの定義を正本とする。
export const SOUL_COLOR_DEFS = [
    { key: '1-red', emoji: '🔴', name: '赤', code: '#ef4444' },
    { key: '2-blue', emoji: '🔵', name: '青', code: '#3b82f6' },
    { key: '3-yellow', emoji: '🟡', name: '黄', code: '#facc15' },
    { key: '4-green', emoji: '🟢', name: '緑', code: '#22c55e' },
    { key: '5-turquoise', emoji: '🐬', name: 'ターコイズ', code: '#06b6d4' },
    { key: '6-pink', emoji: '💖', name: 'ピンク', code: '#f472b6' },
    { key: '7-purple', emoji: '🟣', name: '紫', code: '#a855f7' },
    { key: '8-orange', emoji: '🍊', name: 'オレンジ', code: '#f97316' },
    { key: '9-magenta', emoji: '💖', name: 'マゼンタピンク', code: '#d946ef' },
    { key: '11-indigo', emoji: '💙', name: 'インディゴ', code: '#192f76' },
    { key: '22-olive', emoji: '🫒', name: 'オリーブグリーン', code: '#7d8943' },
    { key: '33-evolved-pink', emoji: '💞', name: '進化系pink', code: 'linear-gradient(135deg, #ff66c4 0%, #f43f5e 100%)' },
];

/**
 * 施術の区分。記録に何をしたのかを、一覧やカレンダーでも一目で分かるようにする。
 *
 * 「施術メニュー・内容」は自由記述のままにしてあり、こちらは別に持つ。
 * 文字から推測すると表記ゆれで崩れるので、選ばれたものを記録に残す。
 * 1回の施術で複数を選べる（カウンセリングとアロマ処方を同じ日に行うなど）。
 *
 * これは印ではなく、その区分のカルテを開く入口でもある。選ぶとその区分の
 * 欄が記録の中に開く。残すものは区分ごとに違うので、写真の呼び名も分けた。
 *
 * photoLabel : その区分で撮るもの
 * photoHint  : なぜ写真でないと残らないのか
 * noteHint   : メモ欄の書き出しの目安
 */
// 区分の名前と並びは、サロンのご指定（ISSUE-080）。
// **key は変えないこと。** 既に書かれた記録が key で区分を指しているので、
// 変えるとその記録の区分が黙って消える。変えてよいのは name と並び順だけ。
export const SERVICE_CATEGORY_DEFS = [
    { key: 'monitor', icon: '📈', name: 'monitor',
      photoLabel: '経過の写真・数値',
      photoHint: '見比べられるよう、同じ向きで。',
      noteHint: '前回からの変化、測った数字' },
    { key: 'session', icon: '🫶', name: '施術',
      photoLabel: '施術の記録',
      photoHint: '',
      noteHint: '触れた部位、圧、そのときの反応' },
    { key: 'aroma', icon: '🍀', name: 'item',
      photoLabel: 'お渡ししたもの',
      photoHint: 'お渡ししたブレンドやラベルの控え。',
      noteHint: '精油と比率、基材、希釈' },
    { key: 'phone', icon: '🤙', name: 'TEL',
      photoLabel: '書き取ったもの',
      photoHint: '通話中の手控え。',
      noteHint: '話した内容、次回までの宿題' },
    { key: 'counseling', icon: '🦄', name: 'counseling',
      photoLabel: '描いたもの・書いたもの',
      photoHint: '手で描かれたものは文字になりません。',
      noteHint: '話の流れ、気づき' },
    { key: 'animal', icon: '🐾', name: 'A.C',
      photoLabel: 'その子の写真',
      photoHint: '対象の子を取り違えないために。',
      noteHint: '受け取った内容、飼い主さんへの伝達' },
    { key: 'color', icon: '🌈', name: 'color',
      photoLabel: '並べたボトル・カード',
      photoHint: 'どう並べたかは色名だけでは残りません。',
      noteHint: '並べた順、選んだときの様子' },
    { key: 'reiki', icon: '🦋', name: '靈氣',
      photoLabel: '記録として残すもの',
      photoHint: '',
      noteHint: '手を当てた部位、感じたこと' },
    { key: 'workshop', icon: '📝', name: 'W.S',
      photoLabel: '作ったもの・書いたもの',
      photoHint: '当日の作品や板書。',
      noteHint: '内容、参加の様子' },
    { key: 'lecture', icon: '📙', name: '講座',
      photoLabel: '板書・資料',
      photoHint: '',
      noteHint: '進んだところ、次回の範囲' },
];

/**
 * 押して選ぶ「施術内容」（ISSUE-085）。
 *
 * もとは2か所に分かれていた。金額を持つ「施術内容」（プラン・1つだけ選べる）と、
 * 書く欄を開く「施術の区分」（アイコン・いくつでも）である。
 * 同じもの（A.C・講座・W.S・item）が両方にあり、片方にだけ金額があった。
 * ひと並びにまとめ、**押したものの合計がその日の金額**になるようにした。
 *
 * `field` は、押したときに開く書く欄（＝上の SERVICE_CATEGORY_DEFS の key）。
 * **複数の項目が同じ field を指してよい**（初診・再診・月set はどれも 🫶施術）。
 * 空文字なら、金額だけで書く欄は開かない。
 *
 * `amount` の3通り。
 *   数値   … 決まった額
 *   null   … その都度（押すと金額の欄が出る）
 *   'none' … 金額を持たない（押しても合計は変わらない）
 *
 * **key は変えないこと。** 記録が key でこれを指している。
 */
export const SERVICE_MENU_DEFS = [
    { key: 'm-first',   icon: '🌱',  name: '初診',        amount: 15000,  field: 'session' },
    { key: 'm-repeat',  icon: '🫶',  name: '再診',        amount: 15000,  field: 'session' },
    { key: 'm-month',   icon: '📅',  name: '月set',       amount: 40000,  field: 'session' },
    { key: 'm-extend',  icon: '⏱️', name: '延長',        amount: 2500,   field: '' },
    { key: 'm-reiki-m', icon: '🦋',  name: '靈氣・月',    amount: 15000,  field: 'reiki' },
    { key: 'm-reiki-w', icon: '🕊️', name: '靈氣・週',    amount: 10000,  field: 'reiki' },
    { key: 'm-ac',      icon: '🐾',  name: 'A.C',         amount: 5000,   field: 'animal' },
    { key: 'm-couns',   icon: '🦄',  name: 'counseling',  amount: 0,      field: 'counseling' },
    { key: 'm-volun',   icon: '🤝',  name: 'ボランティア', amount: 0,     field: 'session' },
    { key: 'm-item',    icon: '🍀',  name: 'item',        amount: null,   field: 'aroma' },
    { key: 'm-lecture', icon: '📙',  name: '講座',        amount: null,   field: 'lecture' },
    { key: 'm-ws',      icon: '📝',  name: 'W.S',         amount: null,   field: 'workshop' },
    { key: 'm-other',   icon: '✳️', name: 'その他',      amount: null,   field: '' },
    { key: 'm-monitor', icon: '📈',  name: 'monitor',     amount: 'none', field: 'monitor' },
    { key: 'm-tel',     icon: '🤙',  name: 'TEL',         amount: 'none', field: 'phone' },
    { key: 'm-color',   icon: '🌈',  name: 'color',       amount: 'none', field: 'color' },
];

const SERVICE_MENU_KEY = 'therapist_service_menu';

/**
 * サロンが直したメニュー。無ければ既定を返す。
 *
 * **前に使っていたプランのうち、既定に無い名前のものは拾って足す。**
 * サロンが自分で足したものを、作りの都合で黙って消さないため。
 */
export function getServiceMenu() {
    let saved = null;
    try { saved = localStorage.getItem(SERVICE_MENU_KEY); } catch (e) { /* 読めないだけ */ }
    if (saved) {
        try {
            const items = JSON.parse(saved);
            if (Array.isArray(items) && items.length > 0) return items;
        } catch (e) { /* 壊れていれば既定へ */ }
    }
    const base = SERVICE_MENU_DEFS.map((m) => ({ ...m }));
    const names = new Set(base.map((m) => m.name));
    let carried = [];
    try {
        const plans = JSON.parse(localStorage.getItem('therapist_plans') || '[]');
        carried = (Array.isArray(plans) ? plans : [])
            .filter((p) => p && p.name && !names.has(p.name))
            .map((p, i) => ({
                key: `m-plan-${p.id || i}`,
                icon: '✳️',
                name: p.name,
                amount: (p.amount === null || p.amount === undefined || p.amount === '')
                    ? null : Number(p.amount),
                field: '',
            }));
    } catch (e) { /* プランが無ければ何もしない */ }
    return base.concat(carried);
}

export function saveServiceMenu(items) {
    try {
        localStorage.setItem(SERVICE_MENU_KEY, JSON.stringify(items));
    } catch (e) {
        console.warn('LocalStorage write blocked.', e);
    }
}

/** メニューを1件引く */
export function getMenuItem(key) {
    return getServiceMenu().find((m) => m.key === key) || null;
}

/**
 * 押したものから、その日の金額を出す。
 *
 * `unknown` は「その都度の項目を押したが、まだ金額が入っていない」。
 * これを 0 と同じに扱うと、**入れ忘れが「無料」に化ける**。
 */
export function menuTotal(keys, adhoc = {}) {
    const menu = getServiceMenu();
    let total = 0;
    let unknown = false;
    let priced = false;
    (Array.isArray(keys) ? keys : []).forEach((k) => {
        const m = menu.find((x) => x.key === k);
        if (!m || m.amount === 'none') return;
        // その記録だけの金額（割引・延長など）が入っていれば、定価より優先する
        const over = adhoc[k];
        const hasOver = over !== undefined && over !== null && String(over).trim() !== '' && !Number.isNaN(Number(over));
        if (hasOver && m.amount !== null && m.amount !== undefined) {
            total += Number(over);
            priced = true;
            return;
        }
        if (m.amount === null || m.amount === undefined) {
            const v = adhoc[k];
            if (v === undefined || v === null || String(v).trim() === '' || Number.isNaN(Number(v))) {
                unknown = true;
            } else { total += Number(v); priced = true; }
            return;
        }
        total += Number(m.amount) || 0;
        priced = true;
    });
    return { total, unknown, priced };
}

/** 押したものから、開く書く欄（区分）を出す。並びは区分の定義どおり */
export function categoriesFromMenu(keys) {
    const menu = getServiceMenu();
    const fields = new Set();
    (Array.isArray(keys) ? keys : []).forEach((k) => {
        const m = menu.find((x) => x.key === k);
        if (m && m.field) fields.add(m.field);
    });
    return SERVICE_CATEGORY_DEFS.filter((c) => fields.has(c.key)).map((c) => c.key);
}

/** 押したものの名前を並べる。記録の「施術内容」に入る */
export function menuLabel(keys) {
    const menu = getServiceMenu();
    return (Array.isArray(keys) ? keys : [])
        .map((k) => (menu.find((x) => x.key === k) || {}).name)
        .filter(Boolean)
        .join('・');
}

/** 区分の定義を1件引く */
export function getServiceCategoryDef(key) {
    return SERVICE_CATEGORY_DEFS.find((c) => c.key === key) || null;
}

/** 保存されている区分キーの配列から、定義を並び順どおりに引く */
export function getServiceCategories(record) {
    const keys = (record && Array.isArray(record.categories)) ? record.categories : [];
    return SERVICE_CATEGORY_DEFS.filter((c) => keys.includes(c.key));
}

// TCカラーセラピー（14色ボトル一覧 ＆ キーワード）
export const TC_COLOR_DEFS = [
    { key: 'tc-red', name: 'レッド（赤）', code: '#ef4444', category: '暖色・エネルギー系', keywords: '情熱、行動力、エネルギー、怒り' },
    { key: 'tc-coral', name: 'コーラル（珊瑚色）', code: '#f87171', category: '暖色・エネルギー系', keywords: '繊細さ、受容性、依存、お世話' },
    { key: 'tc-orange', name: 'オレンジ（橙）', code: '#f97316', category: '暖色・エネルギー系', keywords: '社交性、ショックの癒やし、喜び、仲間' },
    { key: 'tc-gold', name: 'ゴールド（金）', code: '#fbbf24', category: '暖色・エネルギー系', keywords: '自信、自己価値、豊かさ、不安' },
    { key: 'tc-yellow', name: 'イエロー（黄）', code: '#facc15', category: '暖色・エネルギー系', keywords: '知性、希望、ユーモア、神経質' },
    { key: 'tc-lime', name: 'ライム（黄緑）', code: '#a3e635', category: '緑・中間色系', keywords: '新鮮、若々しさ、新しい一歩、見習い' },
    { key: 'tc-green', name: 'グリーン（緑）', code: '#22c55e', category: '緑・中間色系', keywords: '調和、バランス、スペース、ハート' },
    { key: 'tc-turquoise', name: 'ターコイズ（青緑）', code: '#06b6d4', category: '緑・中間色系', keywords: '自由、クリエイティブ、表現、心に溜めた感情' },
    { key: 'tc-blue', name: 'ブルー（青）', code: '#3b82f6', category: '冷色・精神系', keywords: '平和、信頼、コミュニケーション、孤独' },
    { key: 'tc-indigo', name: 'インディゴ（藍）', code: '#192f76', category: '冷色・精神系', keywords: '直感、内省、本質、頑固' },
    { key: 'tc-purple', name: 'パープル（紫）', code: '#a855f7', category: '冷色・精神系', keywords: '精神性、癒やし、葛藤、奉仕' },
    { key: 'tc-pink', name: 'ピンク（桃）', code: '#f472b6', category: '冷色・精神系', keywords: '無条件の愛、優しさ、甘え、いたわり' },
    { key: 'tc-dark', name: 'ダーク（茶/麦茶色）', code: '#78350f', category: '特殊ボトル', keywords: '休息、グラウンディング、蓄積、停滞' },
    { key: 'tc-clear', name: 'クリア（透明）', code: 'linear-gradient(135deg, #e2e8f0 0%, #94a3b8 100%)', category: '特殊ボトル', keywords: '浄化、涙、リセット、可能性' }
];

// アドバンスカラーセラピー（基本10色 / 17色フルセット）
export const ADVANCE_COLOR_DEFS = [
    { key: 'adv-red', name: '赤', code: '#ef4444', isBasic: true },
    { key: 'adv-orange', name: 'オレンジ', code: '#f97316', isBasic: true },
    { key: 'adv-yellow', name: '黄色', code: '#facc15', isBasic: true },
    { key: 'adv-green', name: '緑', code: '#22c55e', isBasic: true },
    { key: 'adv-blue', name: '青', code: '#3b82f6', isBasic: true },
    { key: 'adv-indigo', name: 'インディゴ（藍色）', code: '#192f76', isBasic: true },
    { key: 'adv-purple', name: 'パープル（紫）', code: '#a855f7', isBasic: true },
    { key: 'adv-pink', name: 'ピンク', code: '#f472b6', isBasic: true },
    { key: 'adv-white', name: '白', code: '#ffffff', isBasic: true },
    { key: 'adv-black', name: '黒', code: '#1e293b', isBasic: true },
    { key: 'adv-coral', name: 'コーラル', code: '#f87171', isBasic: false },
    { key: 'adv-lime', name: '黄緑', code: '#a3e635', isBasic: false },
    { key: 'adv-turquoise', name: 'ターコイズ', code: '#06b6d4', isBasic: false },
    { key: 'adv-magenta', name: 'マゼンタ', code: '#d946ef', isBasic: false },
    { key: 'adv-brown', name: '茶色', code: '#78350f', isBasic: false },
    { key: 'adv-silver', name: 'シルバー', code: 'linear-gradient(135deg, #e2e8f0 0%, #94a3b8 100%)', isBasic: false },
    { key: 'adv-gold', name: 'ゴールド', code: '#fbbf24', isBasic: false }
];

/**
 * 顧客のソウルカラー配列を取得する（常に配列を返す）。
 * 旧スキーマ（単一 soulColor）のデータにも安全に対応する。
 */
export function getSoulColors(customer) {
    if (!customer) return [];
    if (Array.isArray(customer.soulColors)) return customer.soulColors;
    return customer.soulColor && customer.soulColor !== 'clear' ? [customer.soulColor] : [];
}

/**
 * [ISSUE-020] 施術記録の一意IDを発番する。
 * 記録の編集は配列インデックスではなくこのIDで対象を特定する。
 */
export function generateRecordId() {
    return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * メインカラー（1色目）を返す。
 * 顧客カードの枠色・背景グラデーションおよびカレンダーの日付ドットに使用する。
 */
export function getMainSoulColor(customer) {
    return getSoulColors(customer)[0] || 'clear';
}

// 初期デモデータ
// localStorage が空のときだけ投入される。実データがある環境は上書きしない。
//
// records は **新しい順** に並べること。addRecord() が unshift で先頭に積むため、
// アプリはこの順序を前提に「第N回」を算出している（古い順に置くと回数が逆転する）。
//
// 各顧客の記録は、来店を追うごとに状態が変わっていく流れになっている。
// 訴えの変化と、気付き欄の「前回からの引き継ぎ」で経過が読み取れる。
// デモ用の事前生成スクリプトからも読めるように公開する
export const INITIAL_CUSTOMERS = [
    {
        id: "1",
        customerNo: "C-0001",
        name: "山田 花子",
        kana: "ヤマダ ハナコ",
        phone: "090-1234-5678",
        birthday: "1990-05-15",
        birthMonth: "05",
        soulColor: "8-orange",
        soulColors: ["8-orange", "3-yellow", "1-red", "3-yellow", "6-pink"],
        referrer: "佐藤 健太",
        constitution: {
            flags: { sensitiveSkin: true },
            allergies: [],
            maxDilution: 1
        },
        intake: {
            personal: "体重 52kg。",
            reasonGoal: "",
            family: "",
            history: "過去に大きな病歴はなし。アトピー肌のためキャリアオイルは低刺激のものを使用し、希釈は1%以下とする。柑橘系の光毒性にも留意。",
            medication: ""
        },
        initialConsultation: "",
        memo: "肩こりがひどい。強めの施術を希望。香りはラベンダー系を好まれる。",
        isArchived: false,
        records: [
            {
                id: "r-demo-1-3",
                date: "2026-07-10",
                type: "アロマトリートメント 60分",
                amount: 8000,
                time: "14:00 - 15:00",
                clientComplaint: "呼吸法のおかげで眠れるようになった。ただ繁忙期に入り、また肩が張ってきた。",
                prescription: "ラベンダー・アングスティフォリア 2 : マジョラム・スイート 1。ホホバオイルで1%希釈、首の付け根から肩甲骨へ。就寝前の芳香浴は継続を案内。",
                therapistNote: "初回に比べると筋緊張は明らかに軽い。繁忙期の波はあるが、ご自身で戻せる状態になってきた。",
                colors: ["tc-green", "adv-green"],
                advanceSet: "basic"
            },
            {
                id: "r-demo-1-2",
                date: "2026-06-18",
                type: "アロマトリートメント 90分",
                amount: 12000,
                time: "13:00 - 14:30",
                clientComplaint: "肩の重さは軽くなったが、今度は寝つきが悪く睡眠が浅い。",
                prescription: "ラベンダー・アングスティフォリア 2 : カモミール・ローマン 1 : マンダリン 1。ホホバオイルで1%希釈、背部と頭部を長めに。就寝前のティッシュ芳香浴を案内。",
                therapistNote: "前回ほぐした肩は戻りが少ない。訴えが「凝り」から「睡眠」へ移ってきた。",
                colors: ["tc-blue", "adv-indigo"],
                advanceSet: "basic"
            },
            {
                id: "r-demo-1-1",
                date: "2026-05-12",
                type: "アロマトリートメント 60分",
                amount: 8000,
                time: "14:00 - 15:00",
                clientComplaint: "肩から首にかけて常に重だるい。夕方になると頭が重く、頭痛薬を飲む日もある。",
                prescription: "ラベンダー・アングスティフォリア（Lavandula angustifolia）3 : ゼラニウム・エジプト 1。アトピー肌のためホホバオイルで1%に低希釈し、前腕でパッチテスト後、肩甲骨まわりへ。",
                therapistNote: "初回。全身の緊張が強く、前半は力が抜けにくい。アトピー肌のためオイル量は控えめに調整。",
                colors: ["tc-red", "adv-red"],
                advanceSet: "basic"
            }
        ]
    },
    {
        id: "2",
        customerNo: "C-0002",
        name: "佐藤 健太",
        kana: "サトウ ケンタ",
        phone: "080-9876-5432",
        birthday: "1985-11-20",
        birthMonth: "11",
        soulColor: "7-purple",
        soulColors: ["7-purple", "2-blue", "6-pink", "9-magenta", "2-blue"],
        referrer: "Web検索",
        constitution: {
            flags: {},
            allergies: [],
            maxDilution: null
        },
        intake: {
            personal: "",
            reasonGoal: "デスクワークによる腰痛と背中の張りが主訴。",
            family: "",
            history: "既往歴・アレルギーなし。精油の使用に制限なし。",
            medication: ""
        },
        initialConsultation: "",
        memo: "姿勢改善アドバイスに関心あり。予約は土曜午前を希望されることが多い。",
        isArchived: false,
        records: [
            {
                id: "r-demo-2-2",
                date: "2026-07-15",
                type: "アロマトリートメント（腰背部）60分",
                amount: 9000,
                time: "11:00 - 12:00",
                clientComplaint: "椅子を変えてから少し楽になったが、夕方はまだ腰が重い。",
                prescription: "ジュニパーベリー 2 : ローズマリー・シネオール 1 : ラベンダー 2。スイートアーモンドオイルで2%希釈、腰背部から臀部へ。左右差の確認を継続。",
                therapistNote: "前回指摘した右の骨盤の上がりは残るが幅は縮小。デスク環境の見直しが効いている。",
                colors: ["tc-turquoise", "adv-blue"],
                advanceSet: "basic"
            },
            {
                id: "r-demo-2-1",
                date: "2026-06-20",
                type: "アロマトリートメント（腰背部）60分",
                amount: 9000,
                time: "11:00 - 12:00",
                clientComplaint: "座りっぱなしで腰が固まる感じ。朝起きたときが一番つらい。",
                prescription: "ジュニパーベリー 2 : ラベンダー 2。スイートアーモンドオイルで2%希釈、股関節まわりから腰背部へ。骨盤の傾きを確認しながら実施。",
                therapistNote: "初回。右の骨盤が上がっている。椅子の高さとモニタ位置の見直しを提案。",
                colors: ["tc-dark", "adv-black"],
                advanceSet: "basic"
            }
        ]
    },
    {
        id: "3",
        customerNo: "C-0003",
        name: "鈴木 一郎",
        kana: "スズキ イチロウ",
        phone: "070-1111-2222",
        birthday: "1978-02-03",
        birthMonth: "02",
        soulColor: "8-orange",
        soulColors: ["8-orange", "5-turquoise", "1-red", "3-yellow", "3-yellow"],
        referrer: "山田 花子",
        constitution: {
            flags: { hypertension: true, medication: true },
            allergies: [],
            maxDilution: null
        },
        intake: {
            personal: "",
            reasonGoal: "立ち仕事で脚のむくみと疲労感。",
            family: "",
            history: "高血圧で通院中。",
            medication: "服薬あり。ローズマリー・カンファー、ヒソップ、セージなど血圧に影響しうる精油は使用しない。"
        },
        initialConsultation: "",
        memo: "月1回のペースで継続来店。強めの圧を好まれる。",
        isArchived: false,
        records: [
            {
                // 次回の予約。まだ来店していないので所見は空のまま。
                // 「この日の下ごしらえ」はこういう予約に対して使う。
                id: "r-demo-3-5",
                date: "2026-08-18",
                type: "アロマトリートメント（全身）90分",
                amount: 13000,
                time: "17:30 - 19:00",
                clientComplaint: "",
                prescription: "",
                therapistNote: "",
                colors: [],
                advanceSet: "basic"
            },
            {
                id: "r-demo-3-4",
                date: "2026-07-21",
                type: "アロマトリートメント（全身）90分",
                amount: 13000,
                time: "17:30 - 19:00",
                clientComplaint: "脚は気にならなくなった。今は冷房による冷えのほうが気になる。",
                prescription: "冷えに対しジンジャー 1 を加えた温性ブレンド（サイプレス 2 : ラベンダー 2 : ジンジャー 1／2%）。温熱を併用し腰と下肢を中心に。ジンジャーは皮膚刺激があるため濃度は上げず、自宅では入浴時の芳香浴を案内。",
                therapistNote: "当初の主訴だったむくみは維持できている。季節性の訴えに切り替わり、通院は維持目的の段階へ。",
                colors: ["tc-turquoise", "adv-turquoise"],
                advanceSet: "full"
            },
            {
                id: "r-demo-3-3",
                date: "2026-06-23",
                type: "アロマトリートメント（全身）90分",
                amount: 13000,
                time: "17:30 - 19:00",
                clientComplaint: "脚はだいぶ楽。代わりに肩と腰の重さが気になり出した。",
                prescription: "全身へ変更。サイプレス 2 : ラベンダー・アングスティフォリア 2 : マジョラム・スイート 1、ホホバオイルで2%希釈。脚は従来通り、加えて肩甲骨と腰背部へ。禁忌の除外は継続。",
                therapistNote: "脚の改善が定着したため全身へ移行。ご本人も「他が気になる余裕が出てきた」と。",
                colors: ["tc-yellow", "adv-white"],
                advanceSet: "basic"
            },
            {
                id: "r-demo-3-2",
                date: "2026-05-26",
                type: "アロマリンパトリートメント（下肢）45分",
                amount: 6000,
                time: "18:00 - 18:45",
                clientComplaint: "前回のあと3日ほどは軽かった。週後半になると元に戻る。",
                prescription: "前回と同ブレンド（サイプレス 2 : レモン 1 : ゼラニウム 1／2%）を継続。加えて足首の可動域を広げる調整。",
                therapistNote: "就寝前の足上げを続けられている。ふくらはぎの張りは初回より明らかに軟らかい。",
                colors: ["tc-orange", "adv-orange"],
                advanceSet: "basic"
            },
            {
                id: "r-demo-3-1",
                date: "2026-04-28",
                type: "アロマリンパトリートメント（下肢）45分",
                amount: 6000,
                time: "18:00 - 18:45",
                clientComplaint: "夕方になると脚が重く、靴がきつくなる。ふくらはぎがパンパン。",
                prescription: "サイプレス 2 : レモン 1 : ゼラニウム・エジプト 1。ホホバオイルで2%希釈、下腿を末梢から中枢へ。高血圧の通院中のためローズマリー・カンファーとヒソップは除外。レモンは光毒性があるため施術後12時間は紫外線を避けるよう説明。",
                therapistNote: "初回。ふくらはぎの張りが非常に強い。水分摂取量を確認し、就寝前の足上げを案内。",
                colors: ["tc-gold", "adv-yellow"],
                advanceSet: "basic"
            }
        ]
    },
    {
        id: "4",
        customerNo: "C-0004",
        name: "田中 結衣",
        kana: "タナカ ユイ",
        phone: "090-3333-4444",
        birthday: "1996-09-08",
        birthMonth: "09",
        soulColor: "9-magenta",
        soulColors: ["9-magenta", "7-purple", "9-magenta", "6-pink", "8-orange"],
        referrer: "Instagram",
        constitution: {
            flags: {},
            allergies: [],
            maxDilution: null
        },
        intake: {
            personal: "冷え性の自覚あり。",
            reasonGoal: "",
            family: "",
            history: "妊娠・授乳中ではない。精油の使用に制限なし。",
            medication: ""
        },
        initialConsultation: "",
        memo: "初回来店。カラーセラピーに強い関心を示されている。",
        isArchived: false,
        records: [
            {
                id: "r-demo-4-1",
                date: "2026-07-24",
                type: "カラーセラピー＋アロマヘッドトリートメント 75分",
                amount: 11000,
                time: "15:00 - 16:15",
                clientComplaint: "気持ちの浮き沈みが激しく、自分の軸が分からなくなる時がある。",
                prescription: "ピンク系を選択されたため、自己受容のテーマで対話。精油はローズ・オットー 微量 : ゼラニウム・エジプト 2 : マンダリン 2、ホホバオイルで1%希釈し頭部と肩へ。冷えの自覚があるため室温と保温に配慮。",
                therapistNote: "初回。対話の中で涙ぐまれる場面あり。急がず、次回も傾聴を中心に組み立てたい。",
                colors: ["tc-coral", "adv-pink"],
                advanceSet: "basic"
            }
        ]
    },
    {
        id: "5",
        customerNo: "C-0005",
        name: "渡辺 美咲",
        kana: "ワタナベ ミサキ",
        phone: "080-5555-6666",
        birthday: "1982-12-11",
        birthMonth: "12",
        soulColor: "8-orange",
        soulColors: ["8-orange", "5-turquoise", "9-magenta", "7-purple", "11-indigo"],
        referrer: "紹介（佐藤 健太）",
        constitution: {
            flags: {},
            allergies: [],
            maxDilution: null
        },
        intake: {
            personal: "",
            reasonGoal: "肩の可動域制限。",
            family: "",
            history: "整形外科での治療歴あり。担当医の了承のもと、可動域を広げる操作は行わない範囲で実施。",
            medication: ""
        },
        initialConsultation: "",
        memo: "転居に伴い来店終了。アーカイブ表示のサンプル。",
        isArchived: true,
        records: [
            {
                id: "r-demo-5-2",
                date: "2026-01-17",
                type: "アロマトリートメント（肩関節周囲）45分",
                amount: 6500,
                time: "10:00 - 10:45",
                clientComplaint: "以前より腕が上がるようになった。日常生活で困る場面が減った。",
                prescription: "前回と同ブレンド（ラベンダー 2 : カモミール・ローマン 1 : ジンジャー 1／2%）を継続。自宅でできる体操を追加で案内。",
                therapistNote: "経過良好。転居のため今回で最終となる旨を伺った。",
                colors: ["tc-clear", "adv-white"],
                advanceSet: "basic"
            },
            {
                id: "r-demo-5-1",
                date: "2025-11-08",
                type: "アロマトリートメント（肩関節周囲）45分",
                amount: 6500,
                time: "10:00 - 10:45",
                clientComplaint: "腕が肩より上に上がりにくい。着替えの動作がつらい。",
                prescription: "ラベンダー・アングスティフォリア 2 : カモミール・ローマン 1 : ジンジャー 1。スイートアーモンドオイルで2%希釈、肩関節周囲へ。医療機関の指導範囲内で、無理に可動域を広げず筋緊張の緩和を優先。",
                therapistNote: "初回。医療機関の指導内容を確認のうえ実施。",
                colors: ["tc-purple", "adv-purple"],
                advanceSet: "basic"
            }
        ]
    }
];

/**
 * サンプルデータの版。INITIAL_CUSTOMERS を更新したらこの数字を上げる。
 *
 * localStorage に古いサンプルが残っているブラウザでは、
 * 「まだ一度も自分のデータを入れていない」場合に限り新しいサンプルへ入れ替える。
 * 自分で顧客や記録を追加していれば入れ替えない。
 */
const SEED_VERSION = 4;
const SEED_VERSION_KEY = 'therapist_seed_version';

/** 保存済みデータが手つかずのサンプルかどうか（追加・変更があれば false） */
function isUntouchedSampleData(customers) {
    const sampleIds = INITIAL_CUSTOMERS.map((c) => String(c.id));
    return customers.every((c) =>
        sampleIds.includes(String(c.id))
        && (c.records || []).every((r) => typeof r.id === 'string' && r.id.startsWith('r-demo-'))
    );
}

/** サンプルデータを書き込む。呼び出し側が書き換えても定数が壊れないよう複製を返す。 */
function seedSampleData() {
    const fresh = JSON.parse(JSON.stringify(INITIAL_CUSTOMERS));
    saveCustomers(fresh);
    try {
        localStorage.setItem(SEED_VERSION_KEY, String(SEED_VERSION));
    } catch (e) {
        /* localStorage が使えない環境では版数を残せないが、表示自体は成立する */
    }
    return fresh;
}

/**
 * 保存に失敗した最後の理由。画面に出すために持っておく。
 *
 * 失敗を黙って握りつぶすと、「保存しました」と出ているのに何も
 * 残っていない、という一番たちの悪い状態になる。
 */
let lastSaveError = null;

export function getLastSaveError() { return lastSaveError; }

/** 保存できる場所かどうかを、実際に書いて確かめる */
export function isStorageWritable() {
    try {
        const probe = '__therapist_probe__';
        localStorage.setItem(probe, '1');
        localStorage.removeItem(probe);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * 顧客データを保存する。
 * @returns 成功したかどうか。呼び出し側は、失敗を必ず画面に出すこと。
 */
/**
 * 中身が変わったときに呼ばれる先。
 *
 * 「書けたら置き場へも送る」を、書き込みの呼び出し元ひとつひとつに足すと
 * 必ず付け忘れる。実際、端末をまたぐ同期は「開いたとき」しか走っておらず、
 * 書いた直後には送られていなかった。書けた場所は1か所しかないので、
 * ここから知らせる。
 */
const dataChangeListeners = [];

export function onDataChanged(listener) {
    if (typeof listener === 'function') dataChangeListeners.push(listener);
}

export function saveCustomers(customers) {
    try {
        localStorage.setItem('therapist_customers', JSON.stringify(customers));
        lastSaveError = null;
        dataChangeListeners.forEach((fn) => {
            // 知らせる相手がしくじっても、保存そのものは成立させる
            try { fn(); } catch (e) { console.warn('データ変更の通知に失敗:', e); }
        });
        return true;
    } catch (e) {
        // 容量切れと、そもそも書けない場所とで、打つ手が違う
        const quota = e && (e.name === 'QuotaExceededError'
            || e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
            || e.code === 22);
        lastSaveError = {
            kind: quota ? 'quota' : 'blocked',
            message: quota
                ? '端末の空きが足りず保存できませんでした。古い記録の写真を減らすか、書き出して整理してください。'
                : 'この画面ではデータを保存できません。保存できる場所で開き直してください。',
            at: Date.now()
        };
        console.warn('LocalStorage write failed.', e);
        return false;
    }
}

export function getCustomers() {
    let data = null;
    try {
        data = localStorage.getItem('therapist_customers');
    } catch (e) {
        console.warn('LocalStorage read blocked.', e);
    }
    if (!data) {
        return seedSampleData();
    }
    try {
        const customers = JSON.parse(data);
        let updated = false;
        if (!Array.isArray(customers) || customers.length === 0) {
            return seedSampleData();
        }

        // 以前のサンプルが残っているだけなら、最新のサンプルへ入れ替える。
        // 自分でデータを入れている場合はここを通らない。
        let storedSeedVersion = null;
        try {
            storedSeedVersion = localStorage.getItem(SEED_VERSION_KEY);
        } catch (e) {
            /* 読めない場合は入れ替えない */
        }
        if (storedSeedVersion !== String(SEED_VERSION) && isUntouchedSampleData(customers)) {
            return seedSampleData();
        }
        customers.forEach(c => {
            if (c.isArchived === undefined) {
                c.isArchived = false;
                updated = true;
            }
            if (c.records) {
                c.records.forEach(r => {
                    if (!r.id) {
                        r.id = generateRecordId();
                        updated = true;
                    }
                    // その日選んだ色。旧データには無いので空配列で補う
                    if (!Array.isArray(r.colors)) {
                        r.colors = [];
                        updated = true;
                    }
                });
            }
        });
        if (updated) {
            saveCustomers(customers);
        }
        return customers;
    } catch (e) {
        return INITIAL_CUSTOMERS;
    }
}

/**
 * 次の顧客No。
 *
 * 人数から数えると、消したときに番号が戻る。5人いて C-0005 まで出ている
 * ところで1人消すと、次の人も C-0005 になり、二人が同じ番号を持つ。
 * すでに出ている番号のいちばん大きいものの次にすれば、戻らない。
 *
 * 端末をまたぐと、同時に登録した2人が同じ番号を持つことはありうる。
 * 顧客そのものの見分けは別のID（重ならない）で行っているので、
 * 記録が混ざることはない。番号の重なりは、あとから直せる。
 */
export function nextCustomerNo(customers = getCustomers()) {
    let max = 0;
    customers.forEach((c) => {
        const hit = /^C-(\d+)$/.exec(String(c.customerNo || ''));
        if (hit) max = Math.max(max, Number(hit[1]));
    });
    return `C-${String(max + 1).padStart(4, '0')}`;
}

/**
 * 顧客No. を見比べるための形。前後の空白を落とし、全角を半角に、
 * 英字を大文字にそろえる。「ｃ－０００６」と「C-0006」を同じ番号と見る。
 */
export function normalizeCustomerNo(value) {
    return String(value == null ? '' : value)
        .normalize('NFKC')
        .replace(/[‐‑‒–—―ー−]/g, '-')
        .trim()
        .toUpperCase();
}

/**
 * その番号をすでに持っている顧客を返す。いなければ null。
 * 保管（アーカイブ）中の顧客も数える。戻したときに重なるため。
 * exceptId には、いま編集している本人のIDを渡す。
 */
export function findCustomerNoOwner(customerNo, exceptId = null, customers = getCustomers()) {
    const key = normalizeCustomerNo(customerNo);
    if (!key) return null;
    return customers.find((c) => c.id !== exceptId
        && normalizeCustomerNo(c.customerNo) === key) || null;
}

export function addCustomer(name, kana = '', phone = '', memo = '', customerNo = '', birthday = '', soulColors = [], referrer = '', initialConsultation = '', birthMonth = '') {
    const customers = getCustomers();
    const newCustomer = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        // 手で決めた番号が、書き込む直前に埋まっていたら（別の端末で先に
        // 使われたなど）、重ねずに次の空き番号にする。
        customerNo: (customerNo && !findCustomerNoOwner(customerNo, null, customers))
            ? normalizeCustomerNo(customerNo) : nextCustomerNo(customers),
        name,
        kana,
        phone,
        birthday,
        birthMonth: birthMonth || (birthday ? birthday.split('-')[1] : ''),
        soulColor: soulColors[0] || 'clear',
        soulColors: Array.isArray(soulColors) ? soulColors : [],
        referrer,
        initialConsultation,
        memo,
        isArchived: false,
        records: []
    };
    customers.unshift(newCustomer);
    saveCustomers(customers);
    return newCustomer;
}

export function updateCustomer(id, updatedFields) {
    const customers = getCustomers();
    const index = customers.findIndex(c => c.id === id);
    if (index !== -1) {
        customers[index] = {
            ...customers[index],
            ...updatedFields,
            updatedAtISO: new Date().toISOString()
        };
        saveCustomers(customers);
        return customers[index];
    }
    return null;
}

export function archiveCustomer(id) {
    return updateCustomer(id, { isArchived: true });
}

export function unarchiveCustomer(id) {
    return updateCustomer(id, { isArchived: false });
}

export function deleteCustomer(id) {
    const customers = getCustomers();
    const filtered = customers.filter(c => String(c.id) !== String(id));
    markDeleted('customers', id);
    saveCustomers(filtered);
    return true;
}

// ------------------------------------------------------------------
// 消したことの控え（tombstone）
//
// 突き合わせは「置き場にあって手元に無いものは足す」という規則で動く。
// これだけだと、
//   ・別の端末で新しく書かれた記録
//   ・自分がさっき消した記録
// の区別が付かず、消したものが必ず足し戻されてしまう。
//
// そこで「この id を、この時刻に消した」という控えだけを残す。
// 中身は持たない。控えのほうが新しければ、足し戻さない。
//
// 迷ったときは「残す」に倒す。消し損ねは直せるが、消しすぎは直せない。
// ------------------------------------------------------------------
const DELETIONS_KEY = 'therapist_deletions';
/** 控えを持っておく期間。これを過ぎたものは捨てる（際限なく増やさないため） */
const DELETIONS_KEEP_DAYS = 180;

export function getDeletions() {
    try {
        const raw = JSON.parse(localStorage.getItem(DELETIONS_KEY) || '{}');
        return {
            customers: (raw && raw.customers) || {},
            records: (raw && raw.records) || {}
        };
    } catch (e) {
        return { customers: {}, records: {} };
    }
}

export function saveDeletions(map) {
    try {
        localStorage.setItem(DELETIONS_KEY, JSON.stringify(pruneDeletions(map)));
    } catch (e) {
        console.warn('LocalStorage write blocked.', e);
    }
}

/** 古い控えを落とす。消してから半年も経てば、どの端末も追いついている */
export function pruneDeletions(map) {
    const limit = new Date(Date.now() - DELETIONS_KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const out = { customers: {}, records: {} };
    ['customers', 'records'].forEach((kind) => {
        Object.entries((map && map[kind]) || {}).forEach(([id, iso]) => {
            if (String(iso) >= limit) out[kind][id] = iso;
        });
    });
    return out;
}

/** 消したことを控える */
export function markDeleted(kind, id) {
    const map = getDeletions();
    map[kind][String(id)] = new Date().toISOString();
    saveDeletions(map);
}

/**
 * 施術記録を追加する。
 *
 * extras でその日にクライアントが選んだ色を渡せる。
 *   colors     : カラーキーの配列（TC・アドバンスを混ぜてよい）
 *   advanceSet : アドバンスカラーを 'basic'（10色）と 'full'（17色）の
 *                どちらから選んだか。10色の青と17色の青は意味が違うため、
 *                後から読み返せるように選択肢の範囲も残しておく。
 */
/**
 * 金額の入れかた。空欄は空欄のまま残す。
 *
 * 合計を出す側は `Number(r.amount) || 0` で読んでいるので、空でも壊れない。
 * 逆に 0 を入れてしまうと、**無料の施術と区別が付かなくなる**。
 */
function normalizeAmount(amount) {
    if (amount === null || amount === undefined) return '';
    const t = String(amount).trim();
    if (t === '') return '';
    const n = parseInt(t, 10);
    return Number.isNaN(n) ? '' : n;
}

export function addRecord(customerId, date, type, amount, time = '', clientComplaint = '', prescription = '', therapistNote = '', extras = {}) {
    const customers = getCustomers();
    const customer = customers.find(c => String(c.id) === String(customerId));
    if (!customer) return null;
    if (!customer.records) customer.records = [];
    const newRecord = {
        id: generateRecordId(),
        date,
        type,
        // 未入力は 0 にしない。予約の時点では金額がまだ決まっておらず、
        // 0 にすると「無料だった」のか「まだ決めていない」のかが
        // 見分けられなくなる（ISSUE-063）。
        amount: normalizeAmount(amount),
        time,
        clientComplaint,
        prescription,
        therapistNote,
        colors: Array.isArray(extras.colors) ? extras.colors : [],
        advanceSet: extras.advanceSet || null,
        categories: Array.isArray(extras.categories) ? extras.categories : [],
        // 押した施術内容と、その都度の金額（ISSUE-085）。
        // categories はここから引いたものだが、両方持つ。
        // categories だけだと、初診・再診・月set のどれだったかが分からない。
        menu: Array.isArray(extras.menu) ? extras.menu : [],
        menuAmounts: (extras.menuAmounts && typeof extras.menuAmounts === 'object')
            ? extras.menuAmounts : {},
        // 写真そのものは IndexedDB にある。ここには控えだけを持つ。
        photos: Array.isArray(extras.photos) ? extras.photos : [],
        // 区分ごとのカルテ。{ color: { note }, aroma: { note }, ... }
        kartes: (extras.kartes && typeof extras.kartes === 'object') ? extras.kartes : {},
        // いつ書き換えたか。別の端末のものと突き合わせるときに、
        // どちらが新しいかを決める材料になる。
        updatedAtISO: new Date().toISOString(),
        // 項目ごとに書いた時刻。別々の項目を別の端末で書いても、
        // 両方残すために使う。作った時点で入っているものにも刻んでおく。
        fieldsAtISO: {}
    };
    RECORD_FIELDS.forEach((k) => {
        if (isFilledField(newRecord[k])) newRecord.fieldsAtISO[k] = newRecord.updatedAtISO;
    });
    customer.records.unshift(newRecord);
    saveCustomers(customers);
    return newRecord;
}

/**
 * 突き合わせのときに、項目ごとに新旧を見る対象。
 *
 * 記録まるごとで新旧を決めると、パソコンで訴えを書き、スマホでメモを
 * 書いただけで、あとに書いたほうが記録ごと差し替わり、片方が消える。
 * 項目ごとに見れば、別々の項目を書いたぶんは両方残る。
 */
export const RECORD_FIELDS = [
    'date', 'time', 'type', 'amount',
    'clientComplaint', 'prescription', 'therapistNote',
    'colors', 'advanceSet', 'categories', 'photos', 'kartes', 'prepAdvice',
    // 押した施術内容と、その都度の金額（ISSUE-085）。
    // ここを入れ忘れると、片方の端末で選び直しても、もう片方に渡らない
    'menu', 'menuAmounts'
];

/**
 * 押しのけられた控えを、何日持っておくか（ISSUE-076）。
 *
 * **ずっと持つのは一般的ではない。** 版の履歴を持つ仕組みは、どれも
 * 期限を切っている（Dropbox・Google ドライブ・「最近削除した項目」は30日、
 * git の reflog も既定90日で切れる）。持ちっぱなしにすると、
 * **要るか要らないか誰も判断しないまま増え続ける。**
 *
 * 回数ではなく日数で切るのは、同期の回数が端末で桁違いのため。
 * スマホは1日に何十回も走るので、回数だと**端末ごとに残る期間がばらばら**になる。
 */
export const OVERWRITTEN_KEEP_DAYS = 30;

/**
 * 期限を過ぎた控えを落とす。
 *
 * 時刻を読めないものも落とす。読めないものを残すと、そこだけ期限が
 * 効かず、**ずっと残る抜け道**になるため。積むときは必ず時刻を入れている。
 */
export function pruneOverwrittenList(list, now = new Date()) {
    if (!Array.isArray(list) || !list.length) return [];
    const limit = now.getTime() - OVERWRITTEN_KEEP_DAYS * 24 * 60 * 60 * 1000;
    return list.filter((o) => {
        const t = Date.parse((o && o.atISO) || '');
        return Number.isFinite(t) && t >= limit;
    });
}

/**
 * 端末ぜんぶを見て、期限切れの控えを落とす。
 *
 * **変わったときだけ書き戻す。** いつも書き戻すと、開くたびに同期が走る。
 *
 * @returns 落とした件数
 */
export function sweepOverwritten(now = new Date()) {
    const customers = getCustomers();
    let dropped = 0;
    customers.forEach((c) => {
        (c.records || []).forEach((r) => {
            if (!Array.isArray(r.overwritten) || !r.overwritten.length) return;
            const kept = pruneOverwrittenList(r.overwritten, now);
            if (kept.length === r.overwritten.length) return;
            dropped += r.overwritten.length - kept.length;
            // 空になったら鍵ごと外す。空配列が残ると、控えを持っているように見える
            if (kept.length) r.overwritten = kept;
            else delete r.overwritten;
        });
    });
    if (dropped) saveCustomers(customers);
    return dropped;
}

/** 何か書いてあるか。空文字・空配列・空オブジェクトは「書いていない」 */
export function isFilledField(v) {
    if (v == null) return false;
    if (typeof v === 'string') return v.trim() !== '';
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return true;
}

/** 中身が同じか。配列やオブジェクトも見るので、書いていないのに時刻だけ進むことがない */
function sameValue(a, b) {
    if (a === b) return true;
    if (a == null && b == null) return true;
    try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; }
}

export function updateRecord(customerId, recordId, updatedFields) {
    const customers = getCustomers();
    const customer = customers.find(c => String(c.id) === String(customerId));
    if (!customer || !customer.records) return null;
    const recordIndex = customer.records.findIndex(r => String(r.id) === String(recordId));
    if (recordIndex !== -1) {
        const before = customer.records[recordIndex];
        const now = new Date().toISOString();

        // 項目ごとの時刻をまだ持っていない記録なら、いま入っている中身に
        // 「記録ぜんぶの時刻」を敷いておく。敷かずに始めると、書いてある
        // 項目が「いつ書いたか分からないもの」になり、別の端末の空欄に
        // 負けてしまう。
        const fieldsAtISO = { ...(before.fieldsAtISO || {}) };
        if (!before.fieldsAtISO) {
            RECORD_FIELDS.forEach((k) => {
                if (isFilledField(before[k])) fieldsAtISO[k] = before.updatedAtISO || '';
            });
        }
        RECORD_FIELDS.forEach((k) => {
            if (k in updatedFields && !sameValue(before[k], updatedFields[k])) {
                fieldsAtISO[k] = now;
            }
        });

        customer.records[recordIndex] = {
            ...before,
            ...updatedFields,
            fieldsAtISO,
            updatedAtISO: now
        };
        saveCustomers(customers);
        return customer.records[recordIndex];
    }
    return null;
}

export function deleteRecord(customerId, recordId) {
    const customers = getCustomers();
    const customer = customers.find(c => String(c.id) === String(customerId));
    if (!customer || !customer.records) return false;
    const initialLen = customer.records.length;
    customer.records = customer.records.filter(r => String(r.id) !== String(recordId));
    if (customer.records.length !== initialLen) {
        markDeleted('records', recordId);
        saveCustomers(customers);
        return true;
    }
    return false;
}

// プラン管理
/**
 * 施術内容と金額。
 *
 * amount が null のものは、その場で決まるもの。選んでも金額欄は空のまま
 * にして、手で入れてもらう。0 を入れてしまうと「無料だった」のか
 * 「まだ決めていない」のか、あとから見分けがつかない。
 */
const INITIAL_PLANS = [
    { id: 'p-free',     name: '無料カウンセリング', amount: 0,     description: '30分' },
    { id: 'p-volunteer', name: 'ボランティア',      amount: 0,     description: '' },
    { id: 'p-first',    name: '初診',              amount: 15000, description: '' },
    { id: 'p-repeat',   name: '再診',              amount: 15000, description: '' },
    { id: 'p-month',    name: '月set',             amount: 40000, description: '①②③＝3回施術' },
    { id: 'p-month-reiki', name: '月靈氣set',      amount: 15000, description: '①②③＝3回Full施術' },
    { id: 'p-week-reiki',  name: '週靈氣set',      amount: 10000, description: '初日Full、6日連日short施術' },
    { id: 'p-extend',   name: '延長',              amount: 2500,  description: '15分単位' },
    { id: 'p-ac',       name: 'A.C',               amount: 5000,  description: '簡易靈氣Healing付き' },
    { id: 'p-lecture',  name: '講座',              amount: null,  description: '未定' },
    { id: 'p-ws',       name: 'ＷＳ',              amount: null,  description: '未定' },
    { id: 'p-other',    name: 'その他',            amount: null,  description: '個別入力' },
    { id: 'p-item',     name: 'item',              amount: null,  description: '個別入力' },
];

export function getPlans() {
    let data = null;
    try {
        data = localStorage.getItem('therapist_plans');
    } catch (e) {
        console.warn('LocalStorage read blocked.', e);
    }

    if (!data) {
        return INITIAL_PLANS;
    }
    try {
        const plans = JSON.parse(data);
        return Array.isArray(plans) && plans.length > 0 ? plans : INITIAL_PLANS;
    } catch (e) {
        return INITIAL_PLANS;
    }
}

export function savePlans(plans) {
    try {
        localStorage.setItem('therapist_plans', JSON.stringify(plans));
    } catch (e) {
        console.warn('LocalStorage write blocked.', e);
    }
}

export function addPlan(name, amount, description = '') {
    const plans = getPlans();
    const newPlan = {
        id: `p-${Date.now().toString(36)}`,
        name,
        amount: parseInt(amount, 10) || 0,
        description
    };
    plans.push(newPlan);
    savePlans(plans);
    return newPlan;
}

export function updatePlan(id, name, amount, description) {
    const plans = getPlans();
    const index = plans.findIndex(p => p.id === id);
    if (index !== -1) {
        plans[index] = { 
            ...plans[index], 
            name, 
            amount: parseInt(amount, 10) || 0,
            description: description !== undefined ? description : plans[index].description
        };
        savePlans(plans);
        return plans[index];
    }
    return null;
}

export function deletePlan(id) {
    const plans = getPlans();
    const filtered = plans.filter(p => p.id !== id);
    savePlans(filtered);
    return filtered;
}

// -------------------------------------------------------------------
// [ISSUE-NEW] カラーマスター設定（サロン/セラピスト独自定義カラー）管理
// -------------------------------------------------------------------
export const INITIAL_COLOR_MASTERS = [
    { id: 'cm-1-red', name: '赤', code: '#ef4444' },
    { id: 'cm-2-blue', name: '青', code: '#3b82f6' },
    { id: 'cm-3-yellow', name: '黄', code: '#facc15' },
    { id: 'cm-4-green', name: '緑', code: '#22c55e' },
    { id: 'cm-5-turquoise', name: 'ターコイズ', code: '#06b6d4' },
    { id: 'cm-6-pink', name: 'ピンク', code: '#f472b6' },
    { id: 'cm-7-purple', name: '紫', code: '#a855f7' },
    { id: 'cm-8-orange', name: 'オレンジ', code: '#f97316' },
    { id: 'cm-9-magenta', name: 'マゼンタピンク', code: '#d946ef' },
    { id: 'cm-11-indigo', name: 'インディゴ', code: '#192f76' },
    { id: 'cm-22-olive', name: 'オリーブグリーン', code: '#7d8943' },
    { id: 'cm-33-evolved-pink', name: '進化系pink', code: 'linear-gradient(135deg, #ff66c4 0%, #f43f5e 100%)' }
];

/**
 * アドバンスカラーを既定で何色出すか。
 *
 * 10色は1stコース、17色は2ndコースで使うカードセット。
 * サロンとして普段使う側をここで決めておき、記録の入力画面では
 * その場で切り替えられるようにする（色に慣れた方には17色に開く等）。
 */
const ADVANCE_SET_KEY = 'therapist_advance_set';
const NAME_PREF_KEY = 'therapist_name_preference';

/**
 * 一覧やカレンダーに、ニックネームと氏名のどちらを先に出すか。
 *
 * カルテの頭は、この設定にかかわらず氏名が主のまま。
 * カルテとして残すのは氏名のほうだから。
 */
export function getNamePreference() {
    try {
        return localStorage.getItem(NAME_PREF_KEY) === 'name' ? 'name' : 'nickname';
    } catch (e) {
        return 'nickname';
    }
}

export function saveNamePreference(pref) {
    try {
        localStorage.setItem(NAME_PREF_KEY, pref === 'name' ? 'name' : 'nickname');
    } catch (e) {
        console.warn('LocalStorage write blocked.', e);
    }
}

export function getAdvanceSetPreference() {
    try {
        const v = localStorage.getItem(ADVANCE_SET_KEY);
        return v === 'full' ? 'full' : 'basic';
    } catch (e) {
        return 'basic';
    }
}

export function saveAdvanceSetPreference(set) {
    try {
        localStorage.setItem(ADVANCE_SET_KEY, set === 'full' ? 'full' : 'basic');
    } catch (e) {
        console.warn('LocalStorage write blocked.', e);
    }
}

/**
 * 登録済みのカラー。
 *
 * 独自カラーを登録する画面は外した（使われていなかった）。ここを残して
 * あるのは、過去の記録で使われた色の名前を引くため。消すと、その記録の
 * 色名がコード（#a1b2c3 など）のまま出てしまう。
 */
export function getColorMasters() {
    const data = localStorage.getItem('therapist_color_masters');
    if (!data) {
        return INITIAL_COLOR_MASTERS;
    }
    try {
        const colors = JSON.parse(data);
        return Array.isArray(colors) && colors.length > 0 ? colors : INITIAL_COLOR_MASTERS;
    } catch (e) {
        return INITIAL_COLOR_MASTERS;
    }
}



// ------------------------------------------------------------------
// 控え（バックアップ）を、最後に取った日
// ------------------------------------------------------------------
//
// 置き場が壊れたときに残るのは、端末の中のぶんだけ。
// 悪意より事故のほうが確率は高いので、忘れていることを知らせる。
//
// 「取ってください」と毎回言うと読まなくなるので、日数が空いたときだけ出す。

const LAST_BACKUP_KEY = 'therapist_last_backup_at';
/** これだけ空いたら知らせる。営業していれば2週間で記録はそれなりに増える */
export const BACKUP_REMIND_DAYS = 14;

/** 最後に控えを取った日時。まだ一度も取っていなければ空文字 */
export function getLastBackupAt() {
    try {
        return localStorage.getItem(LAST_BACKUP_KEY) || '';
    } catch (e) {
        return '';
    }
}

export function markBackupDone(atISO) {
    try {
        localStorage.setItem(LAST_BACKUP_KEY, atISO || new Date().toISOString());
    } catch (e) {
        console.warn('LocalStorage write blocked.', e);
    }
}

/**
 * 控えが要る状態か。要るなら理由も返す。
 *
 * 中身が何も無いうちは知らせない。守るものが無いのに急かしても仕方がない。
 */
export function getBackupReminder() {
    const customers = getCustomers();
    const records = customers.reduce((n, c) => n + ((c.records || []).length), 0);
    if (customers.length === 0 && records === 0) return null;

    const last = getLastBackupAt();
    if (!last) return { kind: 'never', days: null, customers: customers.length, records };

    const days = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
    if (!Number.isFinite(days) || days < BACKUP_REMIND_DAYS) return null;
    return { kind: 'stale', days, customers: customers.length, records };
}
