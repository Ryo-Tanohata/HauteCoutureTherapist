// 自由入力（体質・アレルギーの「その他」）の棚卸し
//
// 自由に書ける欄は必ず散らかる。「そば」「ソバ」「蕎麦」が別々に溜まり、
// 気づいたときには数えられなくなっている。
//
// ここでやることは3つ。
//   1. 全顧客から自由入力を集めて数える
//   2. 表記が揺れているだけのものを寄せる（そば/ソバ/蕎麦）
//   3. よく出るものを「正式な選択肢にしませんか」と挙げる
//
// 昇格そのものは自動ではできない。正式な選択肢にするには、どの精油・
// キャリアオイルが該当するかの対応表が要る。ここが出すのは候補まで。

import { getConstitution, normalizeFreeText } from './oil-safety.js';

/** 昇格を提案しはじめる件数。1人だけの事情を選択肢にしても仕方がない */
export const PROMOTE_THRESHOLD = 3;

/** カタカナ→ひらがな。「ソバ」と「そば」を同じものとして扱うため */
function kanaToHira(text) {
    return String(text).replace(/[ァ-ヶ]/g, (ch) =>
        String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

/**
 * 比較用のかたち。表記の違いを削って、意味だけを残す。
 *
 * 「アレルギー」を先に落としてから記号を消す。順番を逆にすると
 * 長音符が消えたあとで接尾辞に一致しなくなる。
 *
 * 漢字と仮名（蕎麦／そば）はここでは寄らない。読みを知らないと
 * 判断できないため。そちらは画面から手で寄せて、その対応を覚える。
 */
export function comparisonKey(text) {
    const hira = kanaToHira(normalizeFreeText(text)).replace(/あれるぎー$/, '');
    return hira.replace(/[ー・\s]/g, '');
}

/** 編集距離。1文字の違いまでを「揺れ」とみなすために使う */
function editDistance(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) {
            cur[j] = Math.min(
                prev[j] + 1,
                cur[j - 1] + 1,
                prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
        }
        prev = cur;
    }
    return prev[b.length];
}

/** 短い語ほど1文字の違いが致命的なので、長さに応じて許容を変える */
function looksLikeSameThing(a, b) {
    if (a === b) return true;
    const short = Math.min(a.length, b.length);
    if (short <= 2) return false;                    // 2文字以下は別物として扱う
    const allowed = short <= 4 ? 1 : 2;
    return editDistance(a, b) <= allowed;
}

// ------------------------------------------------------------------
// 手で寄せた対応（蕎麦＝そば のように、機械では判断できないもの）
// ------------------------------------------------------------------

const MERGE_KEY = 'therapist_freetext_merges';

/** { 比較キー: 代表の表記 } の形で覚える */
export function getMergeMap() {
    try {
        const raw = JSON.parse(localStorage.getItem(MERGE_KEY) || '{}');
        return raw && typeof raw === 'object' ? raw : {};
    } catch (e) {
        return {};
    }
}

function saveMergeMap(map) {
    try { localStorage.setItem(MERGE_KEY, JSON.stringify(map)); } catch (e) { /* noop */ }
}

/** 「これとこれは同じ」を覚える。以後の集計で自動的に寄る */
export function mergeFreeText(kind, canonicalText, aliasTexts) {
    const map = getMergeMap();
    [canonicalText, ...(aliasTexts || [])].forEach((t) => {
        map[`${kind}:${comparisonKey(t)}`] = canonicalText;
    });
    saveMergeMap(map);
    return map;
}

/**
 * 寄せた対応を解く。
 *
 * 代表の表記を渡されたら、そこへ寄せていたものも全部外す。
 * 自分の分だけ消すと、別表記だけが代表を指したまま残ってしまう。
 */
export function unmergeFreeText(kind, text) {
    const map = getMergeMap();
    const prefix = `${kind}:`;
    delete map[`${prefix}${comparisonKey(text)}`];
    Object.keys(map).forEach((key) => {
        if (key.indexOf(prefix) === 0 && map[key] === text) delete map[key];
    });
    saveMergeMap(map);
    return map;
}

/**
 * 全顧客の自由入力を集めて数える。
 *
 * @returns [{ text, kind, count, customers, variants }]
 *   text     : 代表の表記（いちばん多く使われたもの）
 *   variants : 同じものとして寄せた別表記
 */
export function collectFreeTextEntries(customers, mergeMap = getMergeMap()) {
    const seen = new Map();   // 比較キー → 集計

    (customers || []).forEach((customer) => {
        const { otherAllergies, otherFlags } = getConstitution(customer);
        const add = (text, kind) => {
            // 手で寄せてあれば、その代表の表記で数える
            const canonical = mergeMap[`${kind}:${comparisonKey(text)}`] || text;
            const key = kind + ':' + comparisonKey(canonical);
            if (!key.endsWith(':')) {
                const hit = seen.get(key) || { kind, forms: new Map(), customers: new Set() };
                hit.forms.set(text, (hit.forms.get(text) || 0) + 1);
                hit.customers.add(String(customer.id));
                seen.set(key, hit);
            }
        };
        otherAllergies.forEach((t) => add(t, 'allergy'));
        otherFlags.forEach((t) => add(t, 'flag'));
    });

    // 表記ゆれを寄せる。別のキーでも、見た目がほぼ同じなら1つにまとめる
    const groups = [];
    seen.forEach((hit, key) => {
        const bare = key.slice(key.indexOf(':') + 1);
        const merged = groups.find((g) => g.kind === hit.kind && looksLikeSameThing(g.bare, bare));
        if (merged) {
            hit.forms.forEach((n, form) => merged.forms.set(form, (merged.forms.get(form) || 0) + n));
            hit.customers.forEach((c) => merged.customers.add(c));
            return;
        }
        groups.push({ kind: hit.kind, bare, forms: new Map(hit.forms), customers: new Set(hit.customers) });
    });

    return groups.map((g) => {
        const forms = [...g.forms.entries()].sort((a, b) => b[1] - a[1]);
        return {
            kind: g.kind,
            text: forms[0][0],                          // いちばん多い表記を代表にする
            variants: forms.slice(1).map(([f]) => f),
            count: forms.reduce((n, [, c]) => n + c, 0),
            customers: g.customers.size
        };
    }).sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, 'ja'));
}

/**
 * 棚卸しの結果。画面はこれをそのまま出せばよい。
 *
 * promote : 正式な選択肢にする候補（何人にも出てきたもの）
 * merge   : 表記が割れているもの（寄せたほうがよいもの）
 * rest    : それ以外。まだ様子見
 */
export function reviewFreeText(customers, { threshold = PROMOTE_THRESHOLD } = {}) {
    const entries = collectFreeTextEntries(customers);
    return {
        entries,
        promote: entries.filter((e) => e.customers >= threshold),
        merge: entries.filter((e) => e.variants.length > 0),
        rest: entries.filter((e) => e.customers < threshold && e.variants.length === 0),
        threshold
    };
}

/** 入力中の候補。過去に書いたものから、頭が一致するものを出す */
export function suggestFreeText(customers, kind, typed, limit = 6) {
    const q = comparisonKey(typed || '');
    return collectFreeTextEntries(customers)
        .filter((e) => e.kind === kind)
        .filter((e) => !q || comparisonKey(e.text).indexOf(q) === 0)
        .slice(0, limit)
        .map((e) => e.text);
}

/**
 * 昇格の手順を、そのまま渡せる文章にする。
 *
 * 正式な選択肢にするには、どの精油・キャリアオイルを外すのかを
 * 決める必要がある。そこは人が決めることなので、何を決めればよいかを
 * 書き出して渡す。
 */
export function buildPromotionRequest(entry) {
    const kindLabel = entry.kind === 'allergy' ? 'アレルギー' : '体質';
    return [
        `## 昇格の依頼：${entry.text}（${kindLabel}）`,
        '',
        `- 使われている回数：${entry.count} 件（${entry.customers} 名）`,
        entry.variants.length ? `- 表記のゆれ：${entry.variants.join('、')}` : '- 表記のゆれ：なし',
        '',
        '### 決めていただきたいこと',
        '1. 正式な名称（画面に出す文字）',
        entry.kind === 'allergy'
            ? '2. どの科・原料にあたるか（例：ナッツ＝木の実）'
            : '2. どういう状態か（避けるべき作用は何か）',
        '3. 除外する精油（提案に出さないもの）',
        '4. 除外するキャリアオイル',
        '5. 除外ではなく注意にとどめるもの（あれば）',
        '',
        '### この5つが決まれば',
        'oil-safety.js の該当データに追加すれば、以降は自動で除外されます。',
        'それまでは自由入力のまま、申し送りとして表示されます。'
    ].join('\n');
}
