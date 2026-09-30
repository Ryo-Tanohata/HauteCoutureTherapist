#!/usr/bin/env node
/**
 * デモ用のセッション提案を事前生成する。
 *
 * セッション提案は本来その場で生成するものだが、静的配信の環境や
 * プレビュー版ではサーバーが無く /api/session-advice を呼べない。
 * そこでサンプル顧客ぶんだけ生成してファイルに置き、APIが使えないときは
 * そちらを「デモ用の事前生成」と明示したうえで表示する。
 *
 * 実データの顧客に対しては何も生成しない（鍵はソウルカラーの並びなので、
 * サンプルと同じ並びでなければ一致しない）。
 *
 * 使い方:
 *   node scripts/generate-demo-advice.js
 */
const fs = require('fs');
const path = require('path');
const Astronomy = require('astronomy-engine');
const { generateSessionAdvice } = require('../server/session-advice');
const { SIGNS } = require('../server/ingress');

const OUT_FILE = path.join(__dirname, '..', 'product', 'data', 'demo', 'session-advice.json');
const APP_DIR = path.join(__dirname, '..', 'product', 'js', 'app');

/** ESM のアプリモジュールを Node から読むため、拡張子を変えた一時コピーを作る */
async function loadAppModules() {
    const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'demo-advice-'));
    const copy = (name) => {
        const dest = path.join(tmp, name.replace('.js', '.mjs'));
        let src = fs.readFileSync(path.join(APP_DIR, name), 'utf8');
        src = src.replace(/from '\.\/([\w-]+)\.js'/g, "from './$1.mjs'");
        fs.writeFileSync(dest, src);
        return dest;
    };
    ['kanji-strokes.js', 'soul-color.js', 'correspondence.js', 'oil-safety.js', 'data.js'].forEach(copy);
    return {
        correspondence: await import('file://' + path.join(tmp, 'correspondence.mjs')),
        oilSafety: await import('file://' + path.join(tmp, 'oil-safety.mjs')),
        data: await import('file://' + path.join(tmp, 'data.mjs')),
        tmp
    };
}

const signAt = (bodyName, date) => {
    const ecl = Astronomy.Ecliptic(Astronomy.GeoVector(Astronomy.Body[bodyName], Astronomy.MakeTime(date), true));
    return SIGNS[Math.floor(ecl.elon / 30) % 12];
};

const BODY_OF = {
    sun: 'Sun', moon: 'Moon', mercury: 'Mercury', venus: 'Venus', mars: 'Mars',
    jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune', pluto: 'Pluto'
};

/** ブラウザ側の buildSessionContext と同じ組み立てをする */
function buildContext(customer, mode, mods, extra = {}) {
    const { getCorrespondence, SIGN_BODY_PARTS } = mods.correspondence;
    const { filterOils, getConstitution } = mods.oilSafety;
    const { getSoulColors } = mods.data;

    const now = new Date();
    const lastVisit = (customer.records || []).map((r) => r.date).filter(Boolean).sort().pop() || null;

    const seen = new Set();
    const colors = [];
    const oilNames = [];
    getSoulColors(customer).forEach((key) => {
        const corr = getCorrespondence(key);
        if (!corr || seen.has(corr.planetKey)) return;
        seen.add(corr.planetKey);
        const nowSign = signAt(BODY_OF[corr.planetKey], now);
        const prevSign = lastVisit ? signAt(BODY_OF[corr.planetKey], new Date(lastVisit + 'T12:00:00')) : null;
        colors.push({
            hue: corr.hue,
            planet: corr.planet.name,
            planetSign: nowSign,
            signBodyPart: SIGN_BODY_PARTS[nowSign] || null,
            chakraArea: corr.chakra.area,
            movedFrom: prevSign && prevSign !== nowSign ? prevSign : null
        });
        corr.planet.oils.forEach((o) => { if (!oilNames.includes(o)) oilNames.push(o); });
    });

    const filtered = filterOils(oilNames, customer);
    return {
        mode,
        colors,
        allowedOils: [...filtered.ok, ...filtered.care].map((o) => ({
            oil: o.oil, cares: o.cares, notes: o.notes, maxDilution: o.maxDilution
        })),
        excludedOils: filtered.avoid.map((o) => ({ oil: o.oil, reasons: o.reasons })),
        history: (customer.records || []).slice(0, 3).map((r) => ({
            date: r.date, complaint: r.clientComplaint,
            prescription: r.prescription, note: r.therapistNote
        })),
        maxDilution: getConstitution(customer).maxDilution,
        ...extra
    };
}

/** ブラウザ側と同じ鍵の作り方（mode + 色相の並び） */
function demoKey(ctx) {
    return `${ctx.mode}:${ctx.colors.map((c) => c.hue).join('/')}`;
}

/** 問診中デモで使う訴え。各顧客の経過の続きとして自然なものにする。 */
const SESSION_COMPLAINTS = {
    '山田 花子': '繁忙期が続いていて、また肩から首が張ってきた。眠りは前より取れている。',
    '佐藤 健太': '腰は楽になったが、長時間座ると背中がだるくなる。',
    '鈴木 一郎': '今日は特に脚が重い。最近寝つきも悪くなってきた。',
    '田中 結衣': '気持ちの浮き沈みが激しく、肩にも力が入りやすい。'
};

async function main() {
    const mods = await loadAppModules();
    const customers = mods.data.INITIAL_CUSTOMERS || [];
    if (customers.length === 0) {
        // data.js はサンプルを非公開の const で持つため、必要なら export を足す
        throw new Error('INITIAL_CUSTOMERS を読み込めませんでした（data.js の export をご確認ください）');
    }

    const out = {};
    let ok = 0;
    const failures = [];

    for (const customer of customers) {
        for (const mode of ['prep', 'session']) {
            const extra = mode === 'session'
                ? { todayComplaint: SESSION_COMPLAINTS[customer.name] || '特記なし', todayColors: [] }
                : {};
            const ctx = buildContext(customer, mode, mods, extra);
            if (ctx.allowedOils.length === 0) {
                console.log(`[SKIP] ${customer.name} / ${mode}: 候補が空`);
                continue;
            }
            const key = demoKey(ctx);
            try {
                console.log(`[GEN ] ${customer.name} / ${mode}`);
                const payload = await generateSessionAdvice(ctx, {});
                out[key] = {
                    advice: payload.advice,
                    usedModel: payload.usedModel,
                    usedProvider: payload.usedProvider,
                    generatedAtISO: payload.generatedAtISO,
                    // どの顧客のものか分かるよう残す（表示には使わない）
                    forDemo: `${customer.name} / ${mode}`
                };
                ok++;
            } catch (err) {
                console.error(`[FAIL] ${customer.name} / ${mode}: ${err.message}`);
                failures.push(`${customer.name}/${mode}`);
            }
        }
    }

    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify({ generatedAtISO: new Date().toISOString(), entries: out }, null, 1), 'utf8');
    console.log(`\n生成 ${ok} 件 / 失敗 ${failures.length} 件 → ${OUT_FILE}`);
    if (failures.length > 0) process.exitCode = 1;
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
