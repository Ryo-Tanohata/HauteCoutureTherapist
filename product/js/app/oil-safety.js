// セラピスト向け顧客管理アプリ：精油の安全性データと、体質による絞り込み
//
// 目的は「提案から機械的に除外すること」。
// AIに禁忌の判断はさせない。除外はここのデータで確定させ、AIには
// 残った候補だけを渡す。そうしないと、もっともらしい理由をつけて
// 禁忌の精油を提案してしまう危険がある。
//
// ── このデータは確定版ではない ──
// 一般に流通しているアロマテラピーの安全性情報をまとめたもので、
// 資格を持つセラピストの確認を受けていない。実務と食い違う場合は
// 実務側を正とする。修正は OIL_SAFETY の該当行1つを直せばよい。
//
// ── 注意の強さは2段階 ──
//   avoid : 使わない（提案から除外する）
//   care  : 使えるが条件付き（提案には残し、注意文を添える）

/** 体質フラグの定義。顧客カードの入力UIもこの定義を正本とする。 */
export const CONSTITUTION_FLAGS = [
    { key: 'pregnancy', label: '妊娠中', hint: '通経作用・子宮収縮作用のある精油を除外します' },
    { key: 'breastfeeding', label: '授乳中', hint: '母乳への移行が懸念される精油を除外します' },
    { key: 'hypertension', label: '高血圧', hint: '血圧を上げる方向の精油を除外します' },
    { key: 'hypotension', label: '低血圧', hint: '血圧を下げる方向の精油に注意を出します' },
    { key: 'epilepsy', label: 'てんかん', hint: 'ケトン類（カンファー・ツヨン）を含む精油を除外します' },
    { key: 'sensitiveSkin', label: '敏感肌・アトピー', hint: '皮膚刺激のある精油に注意を出します' },
    { key: 'kidney', label: '腎疾患', hint: '腎臓に負担のかかる精油を除外します' },
    { key: 'estrogenSensitive', label: 'エストロゲン依存性疾患', hint: 'エストロゲン様作用のある精油を除外します' },
    { key: 'medication', label: '服薬中', hint: '相互作用の可能性を注意として出します' },
    { key: 'child', label: '乳幼児', hint: '小児に禁忌の精油を除外します' }
];

/** アレルギーの選択肢（科名）。精油・キャリアオイル側の family と突き合わせる。 */
export const ALLERGY_FAMILIES = [
    { key: 'asteraceae', label: 'キク科' },
    { key: 'lamiaceae', label: 'シソ科' },
    { key: 'apiaceae', label: 'セリ科' },
    { key: 'rutaceae', label: 'ミカン科' },
    { key: 'treeNut', label: 'ナッツ（木の実）' },
    { key: 'peanut', label: 'ピーナッツ' },
    { key: 'sesame', label: 'ゴマ' },
    { key: 'latex', label: 'ラテックス' }
];

/**
 * キャリアオイル（希釈に使う植物油）。
 *
 * 精油ばかり見ていても、実際に肌へ多く触れるのはこちら。ナッツや
 * ゴマのアレルギーは、精油ではなくキャリアオイルで問題になる。
 *
 *   family : アレルギーの突き合わせ用
 *   note   : 選ぶときに添える一言
 *
 * ── このデータは確定版ではない ──
 * 一般に流通している情報をまとめたもので、資格を持つセラピストの
 * 確認を受けていない。実務と食い違う場合は実務側を正とする。
 */
export const CARRIER_OILS = {
    'ホホバ': { family: null, note: '液状ワックス。酸化しにくく、幅広い肌質に使われます。' },
    'グレープシード': { family: null, note: '軽い使用感。酸化は早めです。' },
    'オリーブスクワラン': { family: null, note: '伸びがよく、乾燥した肌に使われます。' },
    'ライスブラン（米ぬか）': { family: null, note: '和精油との相性で選ばれます。' },
    'カメリア（椿）': { family: null, note: '重めの質感。頭皮や毛先にも使われます。' },
    'スイートアーモンド': { family: 'treeNut', note: 'ナッツアレルギーの方には使いません。' },
    'マカダミアナッツ': { family: 'treeNut', note: 'ナッツアレルギーの方には使いません。' },
    'ヘーゼルナッツ': { family: 'treeNut', note: 'ナッツアレルギーの方には使いません。' },
    'アルガン': { family: 'treeNut', note: '核を搾るため、ナッツアレルギーでは避けるのが一般的です。' },
    'ピーナッツ': { family: 'peanut', note: 'ピーナッツアレルギーの方には使いません。' },
    'セサミ（ごま）': { family: 'sesame', note: 'ゴマアレルギーの方には使いません。' },
    'ヒマワリ': { family: 'asteraceae', note: 'キク科です。キク科アレルギーの方には使いません。' },
    'カレンデュラ浸出油': { family: 'asteraceae', note: 'キク科です。キク科アレルギーの方には使いません。' }
};

/**
 * キャリアオイルを、その顧客が使えるかどうか。
 * 判定はアレルギーの科名のみで行う（体質フラグは精油側で見ている）。
 */
export function checkCarrierOil(name, customer) {
    const info = CARRIER_OILS[name];
    if (!info) return { oil: name, status: 'unknown', reasons: [], notes: ['データが未登録です'] };

    const { allergies } = getConstitution(customer);
    const reasons = [];
    if (info.family && allergies.includes(info.family)) {
        reasons.push(`${ALLERGY_LABEL[info.family] || info.family}アレルギー`);
    }
    return {
        oil: name,
        status: reasons.length > 0 ? 'avoid' : 'ok',
        reasons,
        notes: info.note ? [info.note] : []
    };
}

/** 顧客が使えるキャリアオイルと、外したものを返す */
export function filterCarrierOils(customer) {
    const allowed = [];
    const excluded = [];
    Object.keys(CARRIER_OILS).forEach((name) => {
        const r = checkCarrierOil(name, customer);
        if (r.status === 'avoid') excluded.push({ oil: name, reasons: r.reasons });
        else allowed.push({ oil: name, notes: r.notes });
    });
    return { allowed, excluded };
}

/**
 * 精油ごとの安全性。
 *   avoid       : この体質フラグが立っていたら除外する
 *   care        : 除外しないが注意を添える
 *   family      : 植物の科（アレルギーの突き合わせ用）
 *   phototoxic  : 光毒性。体質によらず、塗布後の日光に注意
 *   maxDilution : この精油の希釈上限（%）。顧客側の上限と厳しいほうを採る
 *   note        : 注意文
 */
export const OIL_SAFETY = {
    'ラベンダー': { family: 'lamiaceae', avoid: [], care: [] },
    'ラベンダー・アングスティフォリア': { family: 'lamiaceae', avoid: [], care: [] },
    'フランキンセンス': { family: 'burseraceae', avoid: [], care: [] },
    'サンダルウッド': { family: 'santalaceae', avoid: [], care: [] },
    'ベチバー': { family: 'poaceae', avoid: [], care: [] },
    'パチュリ': { family: 'lamiaceae', avoid: [], care: [] },
    'ネロリ': { family: 'rutaceae', avoid: [], care: [] },

    'ローズマリー': {
        family: 'lamiaceae',
        avoid: ['hypertension', 'epilepsy', 'pregnancy', 'breastfeeding', 'child'],
        care: [],
        note: 'カンファーを含むケモタイプは血圧・神経系への影響が知られています。'
    },
    'セージ': {
        family: 'lamiaceae',
        avoid: ['hypertension', 'epilepsy', 'pregnancy', 'breastfeeding', 'child'],
        care: [],
        note: 'ツヨンを含みます。'
    },
    'クラリセージ': {
        family: 'lamiaceae',
        avoid: ['pregnancy', 'estrogenSensitive'],
        care: ['medication'],
        note: '飲酒時は避けます。分娩時を除き妊娠中は使いません。'
    },
    'ペパーミント': {
        family: 'lamiaceae',
        avoid: ['pregnancy', 'breastfeeding', 'epilepsy', 'hypertension', 'child'],
        care: ['sensitiveSkin'],
        note: 'メントールに血圧を上げる方向の作用があります。'
    },
    'ユーカリ': {
        family: 'myrtaceae',
        avoid: ['epilepsy', 'child'],
        care: ['pregnancy'],
        note: '1,8-シネオールを高濃度に含みます。'
    },
    'フェンネル': {
        family: 'apiaceae',
        avoid: ['pregnancy', 'breastfeeding', 'epilepsy', 'estrogenSensitive', 'child'],
        care: []
    },
    'バジル': {
        family: 'lamiaceae',
        avoid: ['pregnancy', 'epilepsy'],
        care: ['sensitiveSkin']
    },
    'ナツメグ': {
        family: 'myristicaceae',
        avoid: ['pregnancy', 'epilepsy'],
        care: [],
        maxDilution: 1,
        note: '高用量で神経系への影響があるため低濃度で用います。'
    },
    'マージョラム': {
        family: 'lamiaceae',
        avoid: ['pregnancy'],
        care: ['hypotension', 'medication'],
        note: '血圧を下げる方向に働くため、降圧薬との併用は確認が必要です。'
    },
    'マジョラム・スイート': {
        family: 'lamiaceae',
        avoid: ['pregnancy'],
        care: ['hypotension', 'medication'],
        note: '血圧を下げる方向に働くため、降圧薬との併用は確認が必要です。'
    },
    'メリッサ': {
        family: 'lamiaceae',
        avoid: ['pregnancy'],
        care: ['sensitiveSkin'],
        maxDilution: 1
    },
    'サイプレス': {
        family: 'cupressaceae',
        avoid: ['pregnancy', 'estrogenSensitive'],
        care: []
    },
    'シダーウッド': { family: 'cupressaceae', avoid: ['pregnancy'], care: [] },
    'ジュニパー': { family: 'cupressaceae', avoid: ['pregnancy', 'kidney'], care: [] },
    'ミルラ': { family: 'burseraceae', avoid: ['pregnancy', 'breastfeeding'], care: [] },
    'ジャスミン': { family: 'oleaceae', avoid: ['pregnancy'], care: [], note: '分娩時を除き妊娠中は使いません。' },
    'ローズ': { family: 'rosaceae', avoid: ['pregnancy'], care: [] },
    'ローズ・オットー': { family: 'rosaceae', avoid: ['pregnancy'], care: [] },
    'ゼラニウム': { family: 'geraniaceae', avoid: [], care: ['pregnancy', 'estrogenSensitive'] },
    'ゼラニウム・エジプト': { family: 'geraniaceae', avoid: [], care: ['pregnancy', 'estrogenSensitive'] },
    'パルマローザ': { family: 'poaceae', avoid: [], care: ['pregnancy'] },
    'イランイラン': {
        family: 'annonaceae',
        avoid: [],
        care: ['sensitiveSkin', 'hypotension', 'pregnancy'],
        maxDilution: 1,
        note: '高濃度で頭痛・吐き気を起こすことがあります。'
    },
    'ベンゾイン': {
        family: 'styracaceae',
        avoid: [],
        care: ['sensitiveSkin'],
        note: '樹脂の精油です。感作を起こすことがあります。'
    },
    'パイン': {
        family: 'pinaceae',
        avoid: [],
        care: ['sensitiveSkin'],
        note: '酸化すると刺激が強くなります。古いものは使いません。'
    },
    'プチグレン': {
        family: 'rutaceae',
        avoid: [],
        care: [],
        note: '葉から水蒸気蒸留するため、光毒性はありません。'
    },
    'ローズウッド': {
        family: 'lauraceae',
        avoid: [],
        care: [],
        note: 'リナロールが主体で穏やかです。原木の保護状況から、入手先の確認を。'
    },
    'カモミール・ローマン': {
        family: 'asteraceae',
        avoid: [],
        care: ['pregnancy'],
        note: 'キク科アレルギーの方には使いません。'
    },
    'カモミール・ジャーマン': {
        family: 'asteraceae',
        avoid: [],
        care: ['pregnancy'],
        note: 'キク科アレルギーの方には使いません。'
    },

    // 皮膚刺激が強い精油
    'クローブ': {
        family: 'myrtaceae',
        avoid: ['pregnancy', 'sensitiveSkin', 'child'],
        care: ['medication'],
        maxDilution: 0.5,
        note: 'オイゲノールが多く、皮膚と粘膜への刺激が強い精油です。'
            + '血液を固まりにくくする薬との併用は確認が必要です。'
    },
    'シナモン': {
        family: 'lauraceae',
        avoid: ['pregnancy', 'sensitiveSkin', 'child'],
        care: [],
        maxDilution: 0.5,
        note: '皮膚刺激が強く、低濃度でも反応が出ることがあります。'
    },
    'ジンジャー': {
        family: 'zingiberaceae',
        avoid: [],
        care: ['sensitiveSkin'],
        maxDilution: 1,
        note: '皮膚刺激があるため低濃度で用います。'
    },
    'ブラックペッパー': {
        family: 'piperaceae',
        avoid: ['sensitiveSkin'],
        care: [],
        maxDilution: 1,
        note: '皮膚刺激が強い精油です。'
    },

    // 光毒性のある柑橘系
    'ベルガモット': {
        family: 'rutaceae', avoid: [], care: [], phototoxic: true,
        note: '塗布後12時間は直射日光を避けます（フロクマリンフリーを除く）。'
    },
    'レモン': { family: 'rutaceae', avoid: [], care: [], phototoxic: true, note: '塗布後12時間は直射日光を避けます。' },
    'グレープフルーツ': { family: 'rutaceae', avoid: [], care: [], phototoxic: true, note: '塗布後12時間は直射日光を避けます。' },
    'マンダリン': { family: 'rutaceae', avoid: [], care: [], phototoxic: false, note: '柑橘系ですが光毒性は低いとされます。' },
    'オレンジ・スイート': { family: 'rutaceae', avoid: [], care: [], phototoxic: false }
};

/**
 * 自由入力の表記を揃える。
 *
 * 「そば」「ソバ」「　そば 」が別物として溜まると、あとで数えられない。
 * 全角/半角・大文字小文字・前後の空白を揃えてから比べる。
 * 画面に出すのは入力されたそのままの文字で、これは突き合わせ用。
 */
export function normalizeFreeText(text) {
    return String(text == null ? '' : text)
        .normalize('NFKC')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

/**
 * 顧客の体質。未設定の顧客でも安全に扱えるよう既定値を返す。
 *
 * otherAllergies / otherFlags は選択肢に無いものの自由入力。
 * どの精油が該当するかはアプリには判断できないため、機械的な除外には
 * 使わない。セラピストへの申し送りとして表示し、AIにも注意として渡す。
 */
export function getConstitution(customer) {
    const c = (customer && customer.constitution) || {};
    const list = (v) => (Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean) : []);
    return {
        flags: c.flags && typeof c.flags === 'object' ? c.flags : {},
        allergies: Array.isArray(c.allergies) ? c.allergies : [],
        maxDilution: typeof c.maxDilution === 'number' ? c.maxDilution : null,
        otherAllergies: list(c.otherAllergies),
        otherFlags: list(c.otherFlags)
    };
}

/** 自由入力をまとめて取り出す（申し送りの表示・AIへの受け渡し用） */
export function getFreeTextCautions(customer) {
    const { otherAllergies, otherFlags } = getConstitution(customer);
    return [
        ...otherAllergies.map((t) => ({ kind: 'allergy', label: 'アレルギー', text: t })),
        ...otherFlags.map((t) => ({ kind: 'flag', label: '体質', text: t }))
    ];
}

/** 体質が1つでも登録されているか（未入力の顧客に「制限なし」と誤表示しないため） */
export function hasConstitutionData(customer) {
    return Boolean(customer && customer.constitution);
}

const FLAG_LABEL = Object.fromEntries(CONSTITUTION_FLAGS.map((f) => [f.key, f.label]));
const ALLERGY_LABEL = Object.fromEntries(ALLERGY_FAMILIES.map((f) => [f.key, f.label]));

/**
 * 1つの精油を、その顧客が使えるかどうか判定する。
 * 戻り値の status は 'ok' | 'care' | 'avoid'。
 */
export function checkOil(oilName, customer) {
    const safety = OIL_SAFETY[oilName];
    const { flags, allergies, maxDilution } = getConstitution(customer);

    if (!safety) {
        return { oil: oilName, status: 'unknown', reasons: [], notes: ['安全性データが未登録の精油です'] };
    }

    const reasons = [];
    const notes = [];

    // アレルギー（科名）はもっとも強い除外
    if (safety.family && allergies.includes(safety.family)) {
        reasons.push(`${ALLERGY_LABEL[safety.family] || safety.family}アレルギー`);
    }

    (safety.avoid || []).forEach((key) => {
        if (flags[key]) reasons.push(FLAG_LABEL[key] || key);
    });

    const cares = [];
    (safety.care || []).forEach((key) => {
        if (flags[key]) cares.push(FLAG_LABEL[key] || key);
    });

    if (safety.phototoxic) notes.push('光毒性あり');
    if (safety.note) notes.push(safety.note);

    // 希釈上限は精油側と顧客側の厳しいほう
    const limits = [safety.maxDilution, maxDilution].filter((v) => typeof v === 'number');
    const dilution = limits.length > 0 ? Math.min(...limits) : null;

    return {
        oil: oilName,
        status: reasons.length > 0 ? 'avoid' : (cares.length > 0 || safety.phototoxic ? 'care' : 'ok'),
        reasons,
        cares,
        notes,
        maxDilution: dilution
    };
}

/**
 * 精油の候補リストを、使えるもの・条件付き・除外の3つに仕分ける。
 * 除外したものも理由つきで返す（なぜ消えたのかが分からないと使えないため）。
 */
export function filterOils(oilNames, customer) {
    const checked = (oilNames || []).map((n) => checkOil(n, customer));
    return {
        ok: checked.filter((c) => c.status === 'ok'),
        care: checked.filter((c) => c.status === 'care'),
        avoid: checked.filter((c) => c.status === 'avoid'),
        unknown: checked.filter((c) => c.status === 'unknown')
    };
}
