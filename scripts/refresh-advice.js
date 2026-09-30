#!/usr/bin/env node
/**
 * 星詠みメッセージを生成し、product/data/advice/<period>.json に保存する。
 * 定期実行（cron / launchd）から呼ぶことを想定している。
 *
 * 使い方:
 *   node scripts/refresh-advice.js            期限切れの期間だけ更新
 *   node scripts/refresh-advice.js --all      全期間を強制的に再生成
 *   node scripts/refresh-advice.js --status   更新状況の確認のみ（生成しない）
 *   node scripts/refresh-advice.js --backfill 天体データだけ再計算（AIを呼ばない）
 *   node scripts/refresh-advice.js --ingress  星座の変わり目の表だけ再生成
 *   node scripts/refresh-advice.js today 1week  指定した期間だけ更新
 *
 * 期間ごとの更新サイクル:
 *   today 毎日 / 1week 毎週 / 1month 毎月 / 3months 四半期 / 6months 半期 / 1year 毎年
 * 期限が来ていない期間は呼んでもスキップされるので、毎日実行して問題ない。
 */
const { PERIODS, STORE_DIR, refreshPeriod, backfillPlanetaryData, isStale, listStored } = require('../server/advice');
const { writeIngressTable } = require('../server/ingress');

const args = process.argv.slice(2);
const force = args.includes('--all');
const statusOnly = args.includes('--status');
const backfillOnly = args.includes('--backfill');
const ingressOnly = args.includes('--ingress');
const requested = args.filter((a) => PERIODS.includes(a));
const targets = requested.length > 0 ? requested : PERIODS;

function showStatus() {
    console.log(`保存先: ${STORE_DIR}\n`);
    console.log('期間        最終生成             生成AI                        状態');
    console.log('-'.repeat(88));
    for (const row of listStored()) {
        console.log(
            row.period.padEnd(11),
            (row.generatedAt || '未生成').padEnd(20),
            ((row.usedProvider ? `${row.usedProvider} / ${row.usedModel}` : '-')).padEnd(29),
            row.stale ? '要更新' : '最新'
        );
    }
}

async function main() {
    if (statusOnly) {
        showStatus();
        return;
    }

    if (ingressOnly) {
        const r = writeIngressTable();
        console.log(`[ING ] ${r.from} 〜 ${r.to} → ${r.file}`);
        console.log(`       ${Object.entries(r.counts).map(([k, v]) => `${k}:${v}`).join(' ')}`);
        return;
    }

    if (backfillOnly) {
        for (const period of targets) {
            const r = backfillPlanetaryData(period);
            if (r.skipped) {
                console.log(`[SKIP] ${period}: ${r.skipped}`);
            } else {
                console.log(`[FILL] ${period}: 追加項目 ${r.added.length ? r.added.join(', ') : 'なし'}`);
            }
        }
        return;
    }

    let updated = 0;
    let skipped = 0;
    const failures = [];

    for (const period of targets) {
        if (!force && !isStale(period)) {
            console.log(`[SKIP] ${period}: 更新サイクル内のためスキップ`);
            skipped++;
            continue;
        }
        try {
            console.log(`[GEN ] ${period}: 生成中...`);
            const { payload, file } = await refreshPeriod(period);
            console.log(`[DONE] ${period}: ${payload.usedProvider} / ${payload.usedModel} → ${file}`);
            updated++;
        } catch (err) {
            console.error(`[FAIL] ${period}: ${err.message}`);
            failures.push(period);
        }
    }

    // 星座の変わり目の表も更新しておく。天文計算だけなのでAIは呼ばない。
    try {
        const ing = writeIngressTable();
        console.log(`[ING ] 星座の変わり目の表を更新（${ing.from} 〜 ${ing.to}）`);
    } catch (err) {
        console.error(`[FAIL] ingress: ${err.message}`);
        failures.push('ingress');
    }

    console.log(`\n更新 ${updated} 件 / スキップ ${skipped} 件 / 失敗 ${failures.length} 件`);
    if (failures.length > 0) {
        // 定期実行側で失敗を検知できるよう、終了コードを立てる
        process.exitCode = 1;
    }
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
