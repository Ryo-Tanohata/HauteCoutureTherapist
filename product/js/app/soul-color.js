// セラピスト向け顧客管理アプリ：ソウルカラー（5色）の算出
//
// 5色は「上段3色 = 名前の画数」「下段2色 = 生年月日」で決まる。
//
//   上段3色  姓名判断の三才   天格・人格・地格   ← 名前の画数
//   下段2色  数秘術           運命数・誕生数     ← 生年月日
//
// ── なぜ計算元を分けているか ──
// 11・22・33（マスターナンバー）は生年月日側からだけ出す。
// 名前側は数字根を1桁まで縮め切るのでマスターにならず、両側からマスターが
// 出て衝突することがない。
//
// ── 流派によって変わるところ ──
// 下の CALC_OPTIONS にまとめてある。既定値は一般的なものを採っているが、
// 流派に合わせて変える場合はここだけを触ればよい。

import { getStrokes } from './kanji-strokes.js';

/** 数秘の番号 → ソウルカラーのキー */
const NUMBER_TO_COLOR = {
    1: '1-red',
    2: '2-blue',
    3: '3-yellow',
    4: '4-green',
    5: '5-turquoise',
    6: '6-pink',
    7: '7-purple',
    8: '8-orange',
    9: '9-magenta',
    11: '11-indigo',
    22: '22-olive',
    33: '33-evolved-pink'
};

/** 流派によって変わる設定 */
export const CALC_OPTIONS = {
    // 姓か名が1文字のとき、天格・地格・外格に「霊数」1を足す（五格剖象法の一般的な作法）
    useReisu: true,
    // 名前側でもマスターナンバー（11・22・33）を出すか。
    // false のままだと名前側は必ず1〜9になり、マスターは生年月日側の専任になる。
    masterOnName: false
};

/** マスターナンバー */
const MASTERS = [11, 22, 33];

/**
 * 数字根を求める。1桁になるまで各桁を足す。
 * keepMaster が true なら、途中で 11・22・33 になった時点で止める。
 */
function digitalRoot(n, keepMaster) {
    let value = Math.abs(Math.trunc(n));
    while (value > 9) {
        if (keepMaster && MASTERS.includes(value)) return value;
        value = String(value).split('').reduce((sum, d) => sum + Number(d), 0);
    }
    return value;
}

/** 氏名を姓と名に分ける。空白区切りが無い場合は分けられないので null を返す。 */
export function splitName(name) {
    if (!name) return null;
    const parts = String(name).trim().split(/[\s　]+/).filter(Boolean);
    if (parts.length < 2) return null;
    // 3つ以上に分かれている場合は、先頭を姓・残りを名とみなす
    return { sei: parts[0], mei: parts.slice(1).join('') };
}

/**
 * 名前の画数から五格を求める。
 * 画数を引けない文字が1つでもあれば null（誤った数字を出すより出さない）。
 */
export function calcGokaku(name, options = CALC_OPTIONS) {
    const split = splitName(name);
    if (!split) return null;

    const seiStrokes = getStrokes(split.sei);
    const meiStrokes = getStrokes(split.mei);
    if (seiStrokes.length === 0 || meiStrokes.length === 0) return null;

    const unknown = [...seiStrokes, ...meiStrokes].filter((s) => s.strokes == null);
    if (unknown.length > 0) {
        return { error: 'unknown-char', unknownChars: unknown.map((u) => u.char) };
    }

    const sei = seiStrokes.map((s) => s.strokes);
    const mei = meiStrokes.map((s) => s.strokes);
    const sum = (arr) => arr.reduce((a, b) => a + b, 0);

    // 霊数：姓または名が1文字のとき、その側に1を補う
    const reisuSei = options.useReisu && sei.length === 1 ? 1 : 0;
    const reisuMei = options.useReisu && mei.length === 1 ? 1 : 0;

    const tenkaku = sum(sei) + reisuSei;                       // 天格：姓の合計
    const jinkaku = sei[sei.length - 1] + mei[0];              // 人格：姓の最後＋名の最初
    const chikaku = sum(mei) + reisuMei;                       // 地格：名の合計
    const soukaku = sum(sei) + sum(mei);                       // 総格：全部（霊数は入れない）
    const gaikaku = tenkaku + chikaku - jinkaku;               // 外格：天格＋地格−人格

    return {
        sei: split.sei,
        mei: split.mei,
        seiStrokes,
        meiStrokes,
        reisu: { sei: reisuSei, mei: reisuMei },
        tenkaku,
        jinkaku,
        chikaku,
        gaikaku,
        soukaku
    };
}

/**
 * 生年月日から数秘の2つの数を求める。
 * 運命数：生年月日の全桁 ／ 誕生数：日にちだけ。どちらもマスターで止める。
 */
export function calcNumerology(birthday) {
    if (!birthday) return null;
    const m = String(birthday).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;

    const [, y, mo, d] = m;
    const allDigits = (y + mo + d).split('').reduce((sum, ch) => sum + Number(ch), 0);

    return {
        // 運命数（ライフパス）：生年月日をすべて足す
        destiny: digitalRoot(allDigits, true),
        destinyRaw: allDigits,
        // 誕生数（バースデー）：日にちを縮める
        birth: digitalRoot(Number(d), true),
        birthRaw: Number(d)
    };
}

/**
 * ソウルカラー5色を算出する。
 *
 * 返り値の colors は上段3色（天格・人格・地格）＋下段2色（運命数・誕生数）の順。
 * アプリの soulColors 配列にそのまま入る並びになっている。
 *
 * 名前か生年月日が足りない場合は、出せる分だけ slots に入り colors は空になる。
 */
export function calcSoulColors(customer, options = CALC_OPTIONS) {
    const gokaku = calcGokaku(customer && customer.name, options);
    const numero = calcNumerology(customer && customer.birthday);

    const slots = [];
    const toSlot = (label, source, raw) => {
        if (raw == null) return { label, source, raw: null, number: null, color: null };
        const keepMaster = source === 'birthday' ? true : options.masterOnName;
        const number = digitalRoot(raw, keepMaster);
        return { label, source, raw, number, color: NUMBER_TO_COLOR[number] || null };
    };

    const valid = gokaku && !gokaku.error;
    slots.push(toSlot('天格', 'name', valid ? gokaku.tenkaku : null));
    slots.push(toSlot('人格', 'name', valid ? gokaku.jinkaku : null));
    slots.push(toSlot('地格', 'name', valid ? gokaku.chikaku : null));
    // 下段2色はすでにマスター判定済みの値なので、そのまま色に引き当てる
    slots.push({
        label: '運命数', source: 'birthday',
        raw: numero ? numero.destinyRaw : null,
        number: numero ? numero.destiny : null,
        color: numero ? NUMBER_TO_COLOR[numero.destiny] || null : null
    });
    slots.push({
        label: '誕生数', source: 'birthday',
        raw: numero ? numero.birthRaw : null,
        number: numero ? numero.birth : null,
        color: numero ? NUMBER_TO_COLOR[numero.birth] || null : null
    });

    const complete = slots.every((s) => s.color);

    return {
        slots,
        // 5色そろったときだけ配列を返す。欠けたまま保存すると並びがずれるため。
        colors: complete ? slots.map((s) => s.color) : [],
        complete,
        gokaku,
        numerology: numero,
        // 計算できなかった理由を呼び出し側に伝える
        reason: complete ? null : buildReason(customer, gokaku, numero)
    };
}

function buildReason(customer, gokaku, numero) {
    if (!customer || !customer.name) return '氏名が未登録です。';
    if (!gokaku) return '氏名が「姓 名」の形（間に空白）で登録されていないため、姓と名を分けられません。';
    if (gokaku.error === 'unknown-char') {
        return `画数を引けない文字があります：${gokaku.unknownChars.join('、')}`;
    }
    if (!numero) return '生年月日が未登録です。';
    return '計算できませんでした。';
}
