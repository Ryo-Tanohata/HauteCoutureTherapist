// 星とアロマの見立て表。
//
// 施術の前に「この方はどこに出やすいか」「何を軸に組むか」を思い出すための
// 参照もの。顧客には紐づかない。
//
// ── 位置づけ ──
// ここにあるのは象徴の対応づけと、一般に共有されている臨床の考え方であって、
// 効能の保証ではない。組み立ての切り口として使い、根拠として断定しない。
// これは AI 提案に課しているのと同じ約束（session-prompt.js）で、
// 人が読む頁でも同じにしておく。
//
// ── 安全の扱い ──
// 精油ごとの禁忌はここには持たない。oil-safety.js が正本で、こちらは
// 名前を挙げるだけ。2か所に持つと必ず食い違い、どちらが正しいのか
// 分からなくなる。画面では oil-safety.js に問い合わせて印を付ける。

/**
 * 4元素。体質・気質の偏りと、そこから来る負担の出やすさで束ねる。
 */
export const ELEMENTS = [
    {
        key: 'fire',
        icon: '🔥',
        name: '火',
        signs: ['牡羊座', '獅子座', '射手座'],
        qualities: '熱・乾',
        wuxing: 'fire',
        tendency: 'エネルギー過多。炎症、交感神経が優位になりやすい。頭痛や心血管系への負担。',
        approach: '鎮静。こもった熱を逃がし、緊張をゆるめる方向で組む。'
    },
    {
        key: 'earth',
        icon: '🌏',
        name: '地',
        signs: ['牡牛座', '乙女座', '山羊座'],
        qualities: '冷・乾',
        wuxing: 'earth',
        tendency: '緊張の蓄積。筋の硬直、消化器の停滞、骨や関節への負担。',
        approach: '循環を促す。温めて、地に足のつく感覚を戻す方向で組む。'
    },
    {
        key: 'air',
        icon: '🌬️',
        name: '風',
        signs: ['双子座', '天秤座', '水瓶座'],
        qualities: '熱・湿',
        wuxing: 'wood',
        tendency: '神経疲労。思考が止まらない、呼吸が浅い、腰や腎の疲れ。',
        approach: '自律神経を整える。中枢を鎮め、呼吸を深める方向で組む。'
    },
    {
        key: 'water',
        icon: '💧',
        name: '水',
        signs: ['蟹座', '蠍座', '魚座'],
        qualities: '冷・湿',
        wuxing: 'water',
        tendency: '感情の溜め込み。消化器・生殖器の不調、体液の停滞（むくみ）、免疫の低下。',
        approach: '温める。リンパを流し、感情の境界線を保つ方向で組む。'
    }
];

/**
 * 陰陽（2分類）。西洋占星術では男性星座・女性星座と呼ぶ配当で、
 * 火と風が陽、地と水が陰。牡羊座から順に陽陰陽陰…と交互に並ぶ。
 */
export const POLARITIES = [
    {
        key: 'yang', mark: '☯', name: '陽', alias: '男性星座',
        elements: ['fire', 'air'],
        nature: '外へ向かう。発する、動く、伝える。',
        care: '出しすぎたあとの消耗を見る。鎮める手を用意しておく。'
    },
    {
        key: 'yin', mark: '☯', name: '陰', alias: '女性星座',
        elements: ['earth', 'water'],
        nature: '内へ向かう。受ける、蓄える、育てる。',
        care: '溜め込んだものを見る。出す・流す手を用意しておく。'
    }
];

/**
 * 3分類（クオリティ／三区分）。季節のどこに位置するかで分ける。
 * 施術では「変化への構え方」の違いとして読む。
 */
export const MODALITIES = [
    {
        key: 'cardinal', name: '活動宮', signs: ['牡羊座', '蟹座', '天秤座', '山羊座'],
        nature: '季節の始まり。自分から動き出す。',
        care: '走り出したあとの息切れ。始めたことを手放せない張り。'
    },
    {
        key: 'fixed', name: '不動宮', signs: ['牡牛座', '獅子座', '蠍座', '水瓶座'],
        nature: '季節の盛り。持続させ、深める。',
        care: '同じ姿勢・同じ緊張が長く続く。凝りが固まりやすい。'
    },
    {
        key: 'mutable', name: '柔軟宮', signs: ['双子座', '乙女座', '射手座', '魚座'],
        nature: '季節の変わり目。合わせて変える。',
        care: '周りに合わせすぎての疲れ。自律神経の揺れ。'
    }
];

/**
 * 五行。
 *
 * ここは西洋占星術の一部ではない。中国の医学・思想の体系で、
 * 出どころが違う。混ぜて「星座の五行」と言い切るのは正しくないので、
 * 別の軸として置いてある。
 *
 * 12星座と五行を1対1で当てる決まった配当は存在しない。四元素との
 * 橋渡し（火→火、地→土、風→木、水→水）は目安として付けてあるが、
 * 金だけは対応する元素が無い。無理に埋めていないのはそのため。
 *
 * 一方、五行そのものは臓腑・感情・季節・色・味が体系として揃っていて、
 * とくに色を扱うこのアプリとは相性がよい。切り口として使う。
 */
export const WU_XING = [
    {
        key: 'wood', icon: '🌳', name: '木', color: '青・緑', season: '春',
        zang: '肝', fu: '胆', organ: '肝・胆', emotion: '怒り', sense: '目', taste: '酸',
        nature: 'のびやかに広がる。滞ると気が張る。',
        strain: '目の疲れ、脇や肋の張り、イライラ、寝つけない。',
        oils: ['ラベンダー', 'ベルガモット', 'グレープフルーツ'],
        bridge: 'air'
    },
    {
        key: 'fire', icon: '🔥', name: '火', color: '赤', season: '夏',
        zang: '心', fu: '小腸', organ: '心・小腸',
        // 火だけ2組ある。心・小腸を君火、心包・三焦を相火と呼び分ける。
        extra: { zang: '心包', fu: '三焦', label: '相火' }, emotion: '喜び', sense: '舌', taste: '苦',
        nature: '上に昇り、照らす。過ぎると落ち着かない。',
        strain: '動悸、のぼせ、眠りが浅い、話が止まらない。',
        oils: ['ローズ・オットー', 'ジャスミン', 'メリッサ'],
        bridge: 'fire'
    },
    {
        key: 'earth', icon: '🌏', name: '土', color: '黄', season: '長夏（梅雨）',
        zang: '脾', fu: '胃', organ: '脾・胃', emotion: '思い悩み', sense: '口', taste: '甘',
        nature: '受けて、養う。滞ると重くなる。',
        strain: '食欲の波、腹の張り、重だるさ、考えが堂々巡り。',
        oils: ['フェンネル', 'カモミール・ローマン', 'マージョラム'],
        bridge: 'earth'
    },
    {
        key: 'metal', icon: '⚪', name: '金', color: '白', season: '秋',
        zang: '肺', fu: '大腸', organ: '肺・大腸', emotion: '悲しみ', sense: '鼻', taste: '辛',
        nature: '引き締め、内に収める。過ぎると乾く。',
        strain: '浅い呼吸、皮膚の乾き、便通の乱れ、気持ちが沈む。',
        oils: ['ユーカリ', 'サイプレス', 'フランキンセンス'],
        bridge: null
    },
    {
        key: 'water', icon: '💧', name: '水', color: '黒・紺', season: '冬',
        zang: '腎', fu: '膀胱', organ: '腎・膀胱', emotion: '恐れ', sense: '耳', taste: '鹹（塩からい）',
        nature: '蓄え、静まる。減ると芯から冷える。',
        strain: '腰の重さ、冷え、耳鳴り、根を詰めたあとの消耗。',
        oils: ['ジュニパー', 'ベチバー', 'サンダルウッド'],
        bridge: 'water'
    }
];

/**
 * 五臓六腑。
 *
 * 五行に1対ずつ当てると5対にしかならず、六腑のうち三焦が余る。
 * 三焦は特定の臓器を指さず、水と熱の通り道を表す働きの名前で、
 * 心包と対になる。火だけが2組（君火＝心・小腸／相火＝心包・三焦）
 * を持つのはそのため。
 *
 * 数が合わないところを黙って削ると、五臓六腑という言葉と表が
 * 食い違ってしまう。合わない理由ごと残しておく。
 */
export const ZANG_FU = {
    zang: ['肝', '心', '脾', '肺', '腎'],
    fu: ['胆', '小腸', '胃', '大腸', '膀胱', '三焦'],
    note: '五臓は蓄える働き、六腑は通し出す働き。'
        + '六腑のうち三焦だけは特定の臓器を指さず、水と熱の通り道を表します。'
        + '心包と対になり、五行では火に属します（心・小腸＝君火、心包・三焦＝相火）。'
};

export function getWuXing(key) {
    return WU_XING.find((w) => w.key === key) || null;
}

export function getPolarityOfSign(sign) {
    const el = getElementOfSign(sign);
    if (!el) return null;
    return POLARITIES.find((p) => p.elements.indexOf(el.key) > -1) || null;
}

export function getModalityOfSign(sign) {
    return MODALITIES.find((m) => m.signs.indexOf(sign) > -1) || null;
}

export function getElement(key) {
    return ELEMENTS.find((e) => e.key === key) || null;
}

export function getElementOfSign(sign) {
    return ELEMENTS.find((e) => e.signs.indexOf(sign) > -1) || null;
}

/**
 * 12星座ごとの見立て。
 *
 * body    : 医療占星術（メロテジア）の担当部位。correspondence.js と同じ配当。
 * theme   : その星座の持ち味。カウンセリングで言葉にするときの取っかかり。
 * strain  : ストレスが出やすいところ。訴えと突き合わせる。
 * oils    : 主軸に置く候補。禁忌は oil-safety.js が判定する。
 * work    : 合いやすい手技。
 */
export const SIGN_PROFILES = [
    {
        sign: '牡羊座', symbol: '♈', element: 'fire',
        ruler: '火星', rulerSymbol: '♂',
        body: '頭部・顔・目',
        theme: '始める力。まっすぐで、勢いがある。',
        strain: '頭痛、目の疲れ、食いしばり。急いで走り出したあとの息切れ。',
        oils: ['ローズマリー', 'ブラックペッパー', 'フランキンセンス'],
        work: '頭部と首まわり。急な緊張には吸入から入る。'
    },
    {
        sign: '牡牛座', symbol: '♉', element: 'earth',
        ruler: '金星', rulerSymbol: '♀',
        body: '首・喉・甲状腺',
        theme: '味わう力。腰を据えて、積み上げる。',
        strain: '首肩のこり、喉の詰まり、飲み込みにくさ。',
        oils: ['ローズ・オットー', 'サンダルウッド', 'イランイラン'],
        work: '首から肩へ。温めながらゆっくり。'
    },
    {
        sign: '双子座', symbol: '♊', element: 'air',
        ruler: '水星', rulerSymbol: '☿',
        body: '肺・腕・手・肩',
        theme: '伝える力。切り替えが速い。',
        strain: '浅い呼吸、肩や腕の張り、考えが止まらず眠れない。',
        oils: ['バジル', 'ペパーミント', 'ラベンダー'],
        work: '胸郭と腕。吸入で呼吸を深めてから触れる。'
    },
    {
        sign: '蟹座', symbol: '♋', element: 'water',
        ruler: '月', rulerSymbol: '☽',
        body: '胸部・胃',
        theme: '守る力。人の機微に敏い。',
        strain: '胃の重さ、胸のつかえ、むくみ。抱え込んだあとの疲れ。',
        oils: ['カモミール・ジャーマン', 'オレンジ・スイート', 'ベルガモット'],
        work: '低い濃度でリンパを流す。腹部は手を当てるところから。'
    },
    {
        sign: '獅子座', symbol: '♌', element: 'fire',
        ruler: '太陽', rulerSymbol: '☉',
        body: '心臓・背中',
        theme: '照らす力。まっすぐに表現する。',
        strain: '背中の張り、動悸、のぼせ。張り切ったあとの落ち込み。',
        oils: ['ジャスミン', 'イランイラン', 'ベンゾイン'],
        work: '背面。熱を逃がす方向に、長いストロークで。'
    },
    {
        sign: '乙女座', symbol: '♍', element: 'earth',
        ruler: '水星', rulerSymbol: '☿',
        body: '腹部・腸',
        theme: '整える力。細やかに見て、直す。',
        strain: '胃腸の不調、緊張性の便通の乱れ。気になり出すと止まらない。',
        oils: ['ラベンダー', 'フェンネル', 'クラリセージ'],
        work: '腹部と背中を対で。脳と腸の両方をゆるめる組み立て。'
    },
    {
        sign: '天秤座', symbol: '♎', element: 'air',
        ruler: '金星', rulerSymbol: '♀',
        body: '腰・腎臓',
        theme: '釣り合わせる力。人との間合いを取る。',
        strain: '腰の重さ、むくみ、決めきれない疲れ。',
        oils: ['ゼラニウム', 'パルマローザ', 'マージョラム'],
        work: '腰部。左右の差を見ながら整える。'
    },
    {
        sign: '蠍座', symbol: '♏', element: 'water',
        ruler: '冥王星（古典では火星）', rulerSymbol: '♇',
        body: '骨盤内・排泄器',
        theme: '深く関わる力。ひとつに集中する。',
        strain: '骨盤内のうっ滞、周期の乱れ、抱えたまま出せない重さ。',
        oils: ['パチュリ', 'サンダルウッド', 'ベルガモット'],
        work: '骨盤まわり。触れる前に必ず断りを入れる部位。'
    },
    {
        sign: '射手座', symbol: '♐', element: 'fire',
        ruler: '木星', rulerSymbol: '♃',
        body: '大腿・肝臓',
        theme: '広げる力。遠くを見て動く。',
        strain: '大腿と殿部の疲れ、動きすぎた反動、肝の重さ。',
        oils: ['ブラックペッパー', 'ジンジャー', 'パイン'],
        work: '大腿から殿部。しっかりした圧で。'
    },
    {
        sign: '山羊座', symbol: '♑', element: 'earth',
        ruler: '土星', rulerSymbol: '♄',
        body: '膝・骨・皮膚',
        theme: '積み上げる力。責任を引き受ける。',
        strain: '膝や関節のこわばり、皮膚の乾き、休めない。',
        oils: ['ベチバー', 'サイプレス', 'シダーウッド'],
        work: '関節まわりを温めてから。局所に絞って丁寧に。'
    },
    {
        sign: '水瓶座', symbol: '♒', element: 'air',
        ruler: '天王星（古典では土星）', rulerSymbol: '♅',
        body: '脛・足首・循環',
        theme: '離れて見る力。独自の道を行く。',
        strain: '足首や脛の冷え、末梢の巡り、神経の高ぶり。',
        oils: ['ネロリ', 'プチグレン', 'ユーカリ'],
        work: '下腿の巡り。吸入と組み合わせて頭も静める。'
    },
    {
        sign: '魚座', symbol: '♓', element: 'water',
        ruler: '海王星（古典では木星）', rulerSymbol: '♆',
        body: '足・リンパ',
        theme: '溶け合う力。境目がやわらかい。',
        strain: 'むくみ、だるさ、人の影響を受けすぎた疲れ。',
        oils: ['メリッサ', 'ローズウッド', 'パルマローザ'],
        work: '低い濃度でリンパドレナージュ。足元から。'
    }
];

export function getSignProfile(sign) {
    return SIGN_PROFILES.find((s) => s.sign === sign) || null;
}

/**
 * ブレンドの組み立て方。3つの役割で考える。
 * 象徴だけでも、成分だけでも組めない。
 */
export const BLEND_ROLES = [
    {
        key: 'core', name: '主軸', short: '象徴',
        what: 'その方の元素・星座を象徴する、核になる1本。',
        why: '精神的なテーマと、根っこにある体質へ。'
    },
    {
        key: 'support', name: '補完', short: '部位',
        what: '主訴や、担当する部位に対応する1本。',
        why: '呼吸器・消化器・関節など、いま出ているところへ。'
    },
    {
        key: 'harmony', name: '調和', short: '調律',
        what: '自律神経を整え、香り全体をまとめる1本。',
        why: '嗅覚から中枢へ。角の立った香りを丸くする役目も。'
    }
];

/**
 * 手技の選び方。星座の担当部位と、その日の状態で決める。
 * dilution は上限の目安。顧客ごとの上限（体質）が優先される。
 */
export const TECHNIQUES = [
    {
        key: 'inhalation', icon: '🌬️', name: '吸入・芳香浴',
        target: '思考が止まらない、神経が疲れている（双子座・水瓶座）。急な頭部の緊張（牡羊座）。',
        how: '個人用の吸入器か芳香浴。嗅覚から素早く届くので、触れる前の切り替えに向く。',
        dilution: null
    },
    {
        key: 'local', icon: '💆', name: '局所・ボディワーク',
        target: '関節のこわばり（山羊座）、腰の緊張（天秤座）、大腿と殿部の疲れ（射手座）。',
        how: 'キャリアオイルで希釈し、温めながら軽擦・軽撫法を組み合わせる。',
        dilution: '2〜3%'
    },
    {
        key: 'lymph', icon: '💧', name: 'リンパドレナージュ',
        target: 'むくみ、体液の停滞、感覚の繊細な方（魚座・蟹座）。',
        how: '末梢から中枢へ、軽い圧で。濃度は低く抑える。',
        dilution: '0.5〜1%'
    }
];

/**
 * 施術そのもの以外で気をつけること。
 *
 * 精油ごとの禁忌はここに書かない（oil-safety.js が正本）。
 * ここに置くのは、精油の一覧では表せないもの。
 */
export const SAFETY_NOTES = [
    {
        key: 'cat', icon: '🐈', title: '猫と暮らしている方へのホームケア',
        body: '猫は肝臓での代謝（グルクロン酸抱合）が弱く、テルペン類・フェノール類を'
            + '排出しにくいことが知られています。芳香浴や、体に付いた精油から'
            + '影響が及ぶことがあります。お持ち帰りの案内をするときは、'
            + '猫のいる部屋での使用を避けるようお伝えしてください。'
    },
    {
        key: 'diffuser', icon: '⏱️', title: 'ディフューザーの使い方',
        body: '連続して焚き続けず、30〜60分を目安に区切って換気します。'
            + '香りに慣れて分からなくなること（感覚適応）と、気道への刺激を避けるためです。'
    },
    {
        key: 'photo', icon: '☀️', title: '光毒性',
        body: '圧搾法の柑橘（ベルガモットなど）は、塗ったあとの日光で皮膚トラブルを'
            + '起こすことがあります。塗布後12時間は直射日光を避けてください。'
            + '該当する精油には、精油の一覧で印が付きます。'
    }
];

/** どこから来た知見か。参照元は隠さない */
export const SOURCE_NOTE = {
    text: '占星術とアロマテラピーの対応は、Culpeper 以来の古典と、'
        + '現代の臨床アロマテラピーの考え方を突き合わせて整理したものです。'
        + '象徴の対応づけであって、効能を保証するものではありません。'
        + '禁忌の判定は「精油の安全性」データが行い、この頁は参照のためのものです。',
    ref: 'https://www.timeless-edition.com/signs-aromatherapy/',
    refLabel: '参考：占星術とアロマテラピー（timeless-edition.com）'
};
