/**
 * 天体が星座を移る日（イングレス）の表を作るモジュール。
 *
 * ブラウザには astronomy-engine を載せていないため、過去の来店日の天体位置を
 * その場で計算できない。そこで「いつどの星座に移ったか」だけを静的ファイルに
 * 書き出しておき、ブラウザは日付から二分探索で引く。
 *
 * 判定は各日の正午（ローカル時刻）を基準にする。月は1日のうちに星座を移ることが
 * あるが、来店日の粒度で見るには正午で十分。
 */
const fs = require('fs');
const path = require('path');
const Astronomy = require('astronomy-engine');

const SIGNS = ['牡羊座', '牡牛座', '双子座', '蟹座', '獅子座', '乙女座', '天秤座', '蠍座', '射手座', '山羊座', '水瓶座', '魚座'];

/** correspondence.js の planetKey と astronomy-engine の Body 名の対応 */
const PLANETS = {
    sun: 'Sun',
    moon: 'Moon',
    mercury: 'Mercury',
    venus: 'Venus',
    mars: 'Mars',
    jupiter: 'Jupiter',
    saturn: 'Saturn',
    uranus: 'Uranus',
    neptune: 'Neptune',
    pluto: 'Pluto'
};

const OUT_FILE = path.join(__dirname, '..', 'product', 'data', 'advice', 'ingress.json');

function signAtNoon(bodyName, year, month, day) {
    const date = new Date(year, month, day, 12, 0, 0);
    const ecl = Astronomy.Ecliptic(Astronomy.GeoVector(Astronomy.Body[bodyName], Astronomy.MakeTime(date), true));
    return SIGNS[Math.floor(ecl.elon / 30) % 12];
}

function toDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 指定した期間のイングレス表を組み立てる。
 * 各天体について「その星座に入った最初の日」だけを列挙する。
 */
function buildIngressTable(fromDate, toDate) {
    const table = {};
    for (const [key, bodyName] of Object.entries(PLANETS)) {
        const entries = [];
        let prevSign = null;
        const cursor = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
        while (cursor <= toDate) {
            const sign = signAtNoon(bodyName, cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
            if (sign !== prevSign) {
                entries.push({ d: toDateStr(cursor), s: sign });
                prevSign = sign;
            }
            cursor.setDate(cursor.getDate() + 1);
        }
        table[key] = entries;
    }
    return table;
}

/**
 * イングレス表をファイルに書き出す。
 * 既定は「2年前から1年先まで」。過去の来店日を引ければよいので前を厚めに取る。
 */
function writeIngressTable(options = {}) {
    const now = options.now || new Date();
    const from = options.from || new Date(now.getFullYear() - 2, 0, 1);
    const to = options.to || new Date(now.getFullYear() + 1, 11, 31);

    const table = buildIngressTable(from, to);
    const payload = {
        // ブラウザ側が範囲外の日付を渡されたときに判定できるよう、期間を持たせる
        from: toDateStr(from),
        to: toDateStr(to),
        basis: 'noon-local',
        planets: table
    };
    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify(payload), 'utf8');

    const counts = Object.fromEntries(Object.entries(table).map(([k, v]) => [k, v.length]));
    return { file: OUT_FILE, from: payload.from, to: payload.to, counts };
}

module.exports = { SIGNS, PLANETS, buildIngressTable, writeIngressTable, OUT_FILE };
