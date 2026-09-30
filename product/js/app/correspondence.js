// セラピスト向け顧客管理アプリ：色と星の対応表
//
// 顧客のソウルカラーから「担当する天体」と「チャクラ（施術部位）」を引くための表。
// 星詠み（server/advice.js）が計算した天体の位置と組み合わせて、
// その顧客向けの読みものをセラピスト側に提示するために使う。
//
// ── 2本の対応を独立に持っている ──
//   色 → 天体   : 今その天体がどのサインにいるか／その天体系の精油
//   色 → チャクラ: 施術部位
// この2本は起源の違う体系なので、互いに整合していなくてよい（例：青は
// 天体では月だが、チャクラでは第5=喉。チャクラ側の伝統的な天体対応では
// 第5は水星）。無理に揃えるとどちらかが壊れるため、あえて分けている。
//
// ── 数秘の番号は使っていない ──
// ソウルカラーのキーは `1-red` `7-purple` のように数秘の番号を持つが、
// 「番号→天体→色」で辿ると12色中6番しか色が合わない。数秘の色体系と
// 天体の色体系は起源が別物なので、番号を経由せず色相そのもので対応させる。
//
// ── この表の直し方 ──
// COLOR_CORRESPONDENCE の該当する色相の1行だけを書き換える。
// 3つのカラー体系（ソウル12色／TC14色／アドバンス17色、計43キー）は
// すべて keys でこの20色相のいずれかに紐づいているので、1行直せば全体に効く。
// confidence は根拠の強さ。'high' は複数の伝統資料が一致、
// 'medium' は主要資料が支持、'low' はこちらで補完した箇所（要レビュー）。

/**
 * 天体の定義。
 * astronomy-engine の Body 名（server/advice.js が返すキー）と対応させている。
 */
export const PLANET_DEFS = {
    sun: {
        name: '太陽',
        symbol: '☉',
        dataKey: 'sunSign',
        theme: '生命力・自己表現・中心',
        // Culpeper 系。金色・大輪の花、温める性質
        oils: ['ローズマリー', 'カモミール・ローマン', 'シナモン', 'フランキンセンス'],
        modern: false
    },
    moon: {
        name: '月',
        symbol: '☽',
        dataKey: 'moonSign',
        theme: '感情・受容・周期',
        // 白い花・夜咲きの花・体液に働くもの
        oils: ['ジャスミン', 'ネロリ', 'メリッサ'],
        modern: false
    },
    mercury: {
        name: '水星',
        symbol: '☿',
        dataKey: 'mercurySign',
        theme: '思考・伝達・学び',
        // 揮発の速いトップノート。Culpeper は「ハーブ全般は水星が司る」とする
        oils: ['ラベンダー', 'マージョラム', 'ペパーミント', 'フェンネル'],
        modern: false
    },
    venus: {
        name: '金星',
        symbol: '♀',
        dataKey: 'venusSign',
        theme: '調和・快・関係性',
        oils: ['ローズ', 'ゼラニウム', 'イランイラン', 'パルマローザ'],
        modern: false
    },
    mars: {
        name: '火星',
        symbol: '♂',
        dataKey: 'marsSign',
        theme: '意志・行動・熱',
        // 辛味・刺激・とげのあるもの
        oils: ['ジンジャー', 'ブラックペッパー', 'バジル'],
        modern: false
    },
    jupiter: {
        name: '木星',
        symbol: '♃',
        dataKey: 'jupiterSign',
        theme: '拡大・寛容・意味づけ',
        oils: ['クラリセージ', 'セージ', 'ナツメグ'],
        modern: false
    },
    saturn: {
        name: '土星',
        symbol: '♄',
        dataKey: 'saturnSign',
        theme: '構造・境界・持続',
        // 樹木・根・樹脂。骨格や皮膚に対応する
        oils: ['サイプレス', 'ベチバー', 'シダーウッド', 'ミルラ'],
        modern: false
    },
    // ── 以下は近代に発見された天体。伝統的な精油の割当が存在しない。
    //    占星術で標準的な「高次オクターブ」の考え方（天王星=水星の高次、
    //    海王星=金星の高次、冥王星=火星の高次）に沿って、実務で定番の
    //    精油を借用している。伝統資料の裏付けはない。
    uranus: {
        name: '天王星',
        symbol: '♅',
        dataKey: 'uranusSign',
        theme: '刷新・解放・ひらめき',
        oils: ['ペパーミント', 'ユーカリ'],
        modern: true,
        octaveOf: 'mercury'
    },
    neptune: {
        name: '海王星',
        symbol: '♆',
        dataKey: 'neptuneSign',
        theme: '融解・直感・境界のゆるみ',
        oils: ['サンダルウッド', 'ミルラ'],
        modern: true,
        octaveOf: 'venus'
    },
    pluto: {
        name: '冥王星',
        symbol: '♇',
        dataKey: 'plutoSign',
        theme: '変容・再生・深層',
        oils: ['パチュリ', 'ベチバー'],
        modern: true,
        octaveOf: 'mars'
    }
};

/**
 * チャクラの定義。施術部位を引くために使う。
 * 部位はアロマトリートメントで実際に触れる範囲の言い方に寄せている。
 */
export const CHAKRA_DEFS = {
    1: { name: '第1（ルート）', color: '赤', area: '仙骨・臀部・脚・足裏', theme: '安心感・地に足をつける' },
    2: { name: '第2（仙骨）', name2: 'セイクラル', color: 'オレンジ', area: '下腹部・腰・骨盤まわり', theme: '感情の流れ・快' },
    3: { name: '第3（太陽神経叢）', color: '黄', area: 'みぞおち・上腹部・肋骨下', theme: '自信・消化・境界' },
    4: { name: '第4（ハート）', color: '緑', area: '胸部・上背部・肩', theme: '受容・呼吸・つながり' },
    5: { name: '第5（喉）', color: '青', area: '首・喉・肩甲帯・後頸部', theme: '表現・伝える' },
    6: { name: '第6（第三の眼）', color: '藍', area: '眉間・側頭部・目のまわり', theme: '直感・内省' },
    7: { name: '第7（クラウン）', color: '紫', area: '頭頂・頭部全体', theme: '全体性・静けさ' },
    0: { name: '全体', color: '透明', area: '全身（部位を限定しない）', theme: '浄化・リセット' }
};

/**
 * 医療占星術（メロテジア）の星座 → 身体部位。
 *
 * 頭（牡羊座）から足（魚座）へ、体を上から順に12サインが対応する古典的な配当。
 * チャクラ由来の「その人固定の部位」に対して、こちらは担当天体がいまいる
 * 星座から引く「時期で動く部位」として使う。
 */
export const SIGN_BODY_PARTS = {
    牡羊座: '頭部・顔・目',
    牡牛座: '首・喉・甲状腺',
    双子座: '肺・腕・手・肩',
    蟹座: '胸部・胃',
    獅子座: '心臓・背中',
    乙女座: '腹部・腸',
    天秤座: '腰・腎臓',
    蠍座: '骨盤内・排泄器',
    射手座: '大腿・肝臓',
    山羊座: '膝・骨・皮膚',
    水瓶座: '脛・足首・循環',
    魚座: '足・リンパ'
};

/**
 * 色相ごとの対応表。これが正本。
 *
 * keys: 3つのカラー体系のキー。ここに列挙されていないキーは存在しない
 *       （ソウル12 + TC14 + アドバンス17 = 43キーがすべてどこかに入る）。
 * planet: PLANET_DEFS のキー。
 * chakra: CHAKRA_DEFS のキー。
 * confidence: 'high' | 'medium' | 'low'
 * note: なぜその天体にしたかの根拠。レビュー時に判断材料になるよう残している。
 */
export const COLOR_CORRESPONDENCE = [
    {
        hue: '赤',
        keys: ['1-red', 'tc-red', 'adv-red'],
        planet: 'mars', chakra: 1, confidence: 'high',
        note: '火星=赤は伝統資料がほぼ一致する。チャクラも赤=第1で直結。'
    },
    {
        hue: 'コーラル',
        keys: ['tc-coral', 'adv-coral'],
        planet: 'venus', chakra: 2, confidence: 'low',
        note: '赤とピンクの中間。TCの「繊細さ・受容性・お世話」は火星より金星の受容性に近い。'
    },
    {
        hue: 'オレンジ',
        keys: ['8-orange', 'tc-orange', 'adv-orange'],
        planet: 'sun', chakra: 2, confidence: 'medium',
        note: '太陽=金・橙。チャクラはオレンジ=第2。'
    },
    {
        hue: 'ゴールド',
        keys: ['tc-gold', 'adv-gold'],
        planet: 'sun', chakra: 3, confidence: 'high',
        note: '太陽=金は一致。TCゴールドの「自信・自己価値」は第3チャクラそのもの。'
    },
    {
        hue: '黄',
        keys: ['3-yellow', 'tc-yellow', 'adv-yellow'],
        planet: 'mercury', chakra: 3, confidence: 'medium',
        note: '水星=黄。太陽とする資料もあるが、太陽にはゴールド・オレンジを当てている。'
    },
    {
        hue: 'ライム（黄緑）',
        keys: ['tc-lime', 'adv-lime'],
        planet: 'mercury', chakra: 3, confidence: 'low',
        note: 'TCの「新鮮・若々しさ・新しい一歩・見習い」は水星（学び・初学者）と読んだ。'
    },
    {
        hue: '緑',
        keys: ['4-green', 'tc-green', 'adv-green'],
        planet: 'venus', chakra: 4, confidence: 'high',
        note: '金星=エメラルドグリーンは一致。チャクラも緑=第4で直結。'
    },
    {
        hue: 'オリーブグリーン',
        keys: ['22-olive'],
        planet: 'saturn', chakra: 4, confidence: 'low',
        note: '金星の緑が土星で沈んだ色と読んだ。チャクラは色相どおり第4。'
    },
    {
        hue: 'ターコイズ',
        keys: ['5-turquoise', 'tc-turquoise', 'adv-turquoise'],
        planet: 'uranus', chakra: 5, confidence: 'medium',
        note: '天王星=ターコイズは複数資料が挙げる。チャクラは青緑なので第5。'
    },
    {
        hue: '青',
        keys: ['2-blue', 'tc-blue', 'adv-blue'],
        planet: 'moon', chakra: 5, confidence: 'medium',
        note: '伝統色で月=淡青。星座のシンボルカラーでは水瓶座=スカイブルーとする説もある。'
    },
    {
        hue: 'インディゴ（藍）',
        keys: ['11-indigo', 'tc-indigo', 'adv-indigo'],
        planet: 'neptune', chakra: 6, confidence: 'low',
        note: 'TCの「直感・内省・本質」は海王星と読んだ。土星とする資料もある。チャクラは藍=第6。'
    },
    {
        hue: '紫',
        keys: ['7-purple', 'tc-purple', 'adv-purple'],
        planet: 'jupiter', chakra: 7, confidence: 'high',
        note: '木星=紫・ロイヤルブルーは一致。チャクラも紫=第7で直結。'
    },
    {
        hue: 'マゼンタ',
        keys: ['9-magenta', 'adv-magenta'],
        planet: 'pluto', chakra: 7, confidence: 'low',
        note: '変容の色として冥王星に当てた。近代天体のため伝統資料の裏付けはない。'
    },
    {
        hue: 'ピンク',
        keys: ['6-pink', 'tc-pink', 'adv-pink'],
        planet: 'venus', chakra: 4, confidence: 'high',
        note: '金星=ピンクは一致。ハートチャクラのピンクとしても定着している。'
    },
    {
        hue: '進化系ピンク',
        keys: ['33-evolved-pink'],
        planet: 'venus', chakra: 4, confidence: 'low',
        note: 'ピンクの高次として金星のまま。マスターナンバー33=無条件の愛に対応。'
    },
    {
        hue: '茶／ダーク',
        keys: ['tc-dark', 'adv-brown'],
        planet: 'saturn', chakra: 1, confidence: 'medium',
        note: '土星=暗色。TCダークの「休息・グラウンディング」は第1チャクラと完全に一致。'
    },
    {
        hue: '白',
        keys: ['adv-white'],
        planet: 'moon', chakra: 7, confidence: 'high',
        note: '月=白・銀は一致。'
    },
    {
        hue: 'シルバー',
        keys: ['adv-silver'],
        planet: 'moon', chakra: 6, confidence: 'high',
        note: '月=銀は一致。'
    },
    {
        hue: '黒',
        keys: ['adv-black'],
        planet: 'saturn', chakra: 1, confidence: 'high',
        note: '土星=黒・灰は一致。'
    },
    {
        hue: 'クリア（透明）',
        keys: ['tc-clear'],
        planet: 'moon', chakra: 0, confidence: 'low',
        note: 'TCの「浄化・涙・リセット」を月の周期と読んだ。部位は限定しない。'
    }
];

/** キー → 色相エントリ の逆引き表（起動時に1度だけ組み立てる） */
const KEY_TO_ENTRY = (() => {
    const map = new Map();
    COLOR_CORRESPONDENCE.forEach((entry) => {
        entry.keys.forEach((k) => map.set(k, entry));
    });
    return map;
})();

/**
 * カラーキーから対応情報を引く。
 * 顧客が独自に登録したカラー（カラー設定で追加したもの）は表に無いので null。
 */
export function getCorrespondence(colorKey) {
    if (!colorKey) return null;
    const entry = KEY_TO_ENTRY.get(colorKey);
    if (!entry) return null;
    return {
        hue: entry.hue,
        confidence: entry.confidence,
        note: entry.note,
        planetKey: entry.planet,
        planet: PLANET_DEFS[entry.planet],
        chakraKey: entry.chakra,
        chakra: CHAKRA_DEFS[entry.chakra]
    };
}

/** 表に載っているキーの総数（テストで取りこぼしを検出するために使う） */
export function getMappedKeys() {
    return Array.from(KEY_TO_ENTRY.keys());
}
