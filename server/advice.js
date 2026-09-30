/**
 * 星詠みメッセージの生成・保存を担当するモジュール。
 *
 * 生成結果は product/data/advice/<period>.json に書き出し、ブラウザは
 * その静的ファイルを読むだけにしている。つまり閲覧者の操作がAIの呼び出しに
 * つながることはない。生成は scripts/refresh-advice.js を定期実行して行う。
 */
const fs = require('fs');
const path = require('path');
const Astronomy = require('astronomy-engine');
const { generateAdvice } = require('./ai-provider');

/** 対応する期間。並び順はUIのタブ順。 */
const PERIODS = ['today', '1week', '1month', '3months', '6months', '1year'];

/** 生成結果の保存先。product/ 配下に置くことで静的配信にそのまま乗る。 */
const STORE_DIR = path.join(__dirname, '..', 'product', 'data', 'advice');

function calculatePeriodEvents(startDate, periodKey) {
    const SIGNS = ["牡羊座", "牡牛座", "双子座", "蟹座", "獅子座", "乙女座", "天秤座", "蠍座", "射手座", "山羊座", "水瓶座", "魚座"];
    const getSignForTime = (body, t) => {
        const vec = Astronomy.GeoVector(body, t, true);
        const ecl = Astronomy.Ecliptic(vec);
        return SIGNS[Math.floor(ecl.elon / 30) % 12];
    };

    let days = 30;
    if (periodKey === '1month') days = 30;
    else if (periodKey === '3months') days = 90;
    else if (periodKey === '6months') days = 180;
    else if (periodKey === '1year') days = 365;

    const events = [];
    const endTimeMs = startDate.getTime() + days * 86400000;

    // 1. 太陽の移動（イングレス）
    try {
        let prevSunSign = getSignForTime(Astronomy.Body.Sun, Astronomy.MakeTime(startDate));
        const step = days > 100 ? 4 : 2;
        for (let d = 1; d <= days; d += step) {
            const curDate = new Date(startDate.getTime() + d * 86400000);
            const curTime = Astronomy.MakeTime(curDate);
            const curSunSign = getSignForTime(Astronomy.Body.Sun, curTime);
            if (curSunSign !== prevSunSign) {
                events.push({
                    date: `${curDate.getMonth() + 1}/${curDate.getDate()}`,
                    rawDate: curDate,
                    type: '太陽の移動',
                    icon: '☀️',
                    title: `太陽が【${curSunSign}】へ`,
                    desc: `エネルギーのフォーカスが${curSunSign}のテーマへシフト`
                });
                prevSunSign = curSunSign;
            }
        }
    } catch (e) {
        console.warn('Sun ingress calculation warning:', e);
    }

    // 2. 新月・満月
    try {
        let searchTime = Astronomy.MakeTime(startDate);
        for (let i = 0; i < (days > 120 ? 12 : 6); i++) {
            const nm = Astronomy.SearchMoonPhase(0, searchTime, 35);
            if (nm && nm.date.getTime() <= endTimeMs) {
                const sign = getSignForTime(Astronomy.Body.Moon, nm);
                events.push({
                    date: `${nm.date.getMonth() + 1}/${nm.date.getDate()}`,
                    rawDate: nm.date,
                    type: '新月',
                    icon: '🌑',
                    title: `新月 (${sign})`,
                    desc: `${sign}の領域で新たな意図設定・種まきの刻`
                });
                searchTime = nm.AddDays(2);
            } else {
                break;
            }
        }

        searchTime = Astronomy.MakeTime(startDate);
        for (let i = 0; i < (days > 120 ? 12 : 6); i++) {
            const fm = Astronomy.SearchMoonPhase(180, searchTime, 35);
            if (fm && fm.date.getTime() <= endTimeMs) {
                const sign = getSignForTime(Astronomy.Body.Moon, fm);
                events.push({
                    date: `${fm.date.getMonth() + 1}/${fm.date.getDate()}`,
                    rawDate: fm.date,
                    type: '満月',
                    icon: '🌕',
                    title: `満月 (${sign})`,
                    desc: `${sign}のテーマでの成就・手放しと感謝のピーク`
                });
                searchTime = fm.AddDays(2);
            } else {
                break;
            }
        }
    } catch (e) {
        console.warn('Moon phase calculation warning:', e);
    }

    events.sort((a, b) => a.rawDate - b.rawDate);
    const maxItems = periodKey === '1year' ? 14 : 10;
    return events.slice(0, maxItems).map(e => ({
        date: e.date,
        type: e.type,
        icon: e.icon,
        title: e.title,
        desc: e.desc
    }));
}

function getCacheInfo(period, date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    
    if (period === 'today') {
        return {
            key: `today_${yyyy}-${mm}-${dd}`,
            intervalLabel: '毎日午前0時に更新',
            periodName: '今日'
        };
    } else if (period === '1week') {
        const startOfYear = new Date(yyyy, 0, 1);
        const weekNum = Math.ceil((((date - startOfYear) / 86400000) + startOfYear.getDay() + 1) / 7);
        return {
            key: `1week_${yyyy}-W${weekNum}`,
            intervalLabel: '毎週1回（月曜更新）',
            periodName: '直近1週間'
        };
    } else if (period === '1month') {
        return {
            key: `1month_${yyyy}-${mm}`,
            intervalLabel: '毎月1日更新',
            periodName: '直近1ヶ月'
        };
    } else if (period === '3months') {
        const quarter = Math.floor(date.getMonth() / 3) + 1;
        return {
            key: `3months_${yyyy}-Q${quarter}`,
            intervalLabel: '季節の節目（3ヶ月に1回更新）',
            periodName: '直近3ヶ月'
        };
    } else if (period === '6months') {
        const half = date.getMonth() < 6 ? 'H1' : 'H2';
        return {
            key: `6months_${yyyy}-${half}`,
            intervalLabel: '半年に1回更新（春分・秋分の節目）',
            periodName: '半年'
        };
    } else if (period === '1year') {
        return {
            key: `1year_${yyyy}`,
            intervalLabel: '1年に1回更新（年間の星の航海図）',
            periodName: '1年'
        };
    }
    return {
        key: `default_${yyyy}-${mm}-${dd}`,
        intervalLabel: '定期更新',
        periodName: '環境アドバイス'
    };
}

/**
 * いまの更新サイクルが終わる時刻（＝次に作り直すべき時刻）を返す。
 *
 * 期間ごとの規則をここに書き写すと getCacheInfo とずれるので、
 * **世代キーが変わる最初の日を前から探して**求める。
 * こうしておけば、サイクルの決め方を変えても直すのは getCacheInfo 1か所で済む。
 *
 * 1年ぶんでも高々366回なので、計算量は問題にならない。
 */
function nextCycleStart(period, date = new Date()) {
    const key = getCacheInfo(period, date).key;
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    for (let i = 0; i < 400; i++) {
        d.setDate(d.getDate() + 1);
        if (getCacheInfo(period, d).key !== key) return new Date(d);
    }
    return null;
}

/**
 * 星詠みメッセージの項目定義。
 *
 * 4項目の役割・順番・見出しは全期間で共通にし、期間ごとに変えるのは
 * 「その期間で何に目を向けるか」と箇条書きの本数だけにする。
 * タブを切り替えても同じ位置に同じ種類の情報が並ぶようにするため。
 *
 *   1. この期間全体の基調        （段落）
 *   2. 月のリズムと心身の状態    （段落）
 *   3. クライアントへ向けること  （箇条書き）
 *   4. セラピスト自身へ向けること（箇条書き）
 *
 * 3と4を「相手に向けること／自分に向けること」で分けているため、
 * セルフケアや注意点は必ず4に入る。
 */
const ADVICE_PERIOD_SPECS = {
    today: {
        label: '今日',
        lead: '本日の心身のコンディショニングと、対人セッションに活かせる導き',
        overview: '太陽や星々が本日にもたらす祝福された基調とテーマ',
        rhythm: '月星座と月相が今日の感情・直感・エネルギーに与える影響',
        session: [
            '本日のセッションで大切にしたい心構え',
            '心を開くコミュニケーションと寄り添い方のコツ',
            '今日のクライアントの状態に合わせた施術の勘どころ'
        ],
        selfcare: [
            '自分自身を優しく満たすスピリチュアルセルフケア',
            '無理をせずエネルギーを護るために気をつけたいこと'
        ]
    },
    '1week': {
        label: '直近1週間',
        lead: '1週間の宇宙のエネルギーの流れと、日々の佇まいの指針',
        overview: '太陽や星々が放つ今週のスピリチュアルな基調とテーマ',
        rhythm: '1週間の中で移ろう月と、感情・エネルギーの心地よい整え方',
        session: [
            '今週のセッションを支える聖なるマインドセット',
            'クライアントの心に寄り添う魂のコミュニケーション',
            '施術空間のエネルギーを整えるための工夫'
        ],
        selfcare: [
            '今週おすすめのスピリチュアルセルフケアと浄化',
            '自分のエネルギーを護るために手放したいこと'
        ]
    },
    '1month': {
        label: '直近1ヶ月',
        lead: '新月・満月のサイクルと、1ヶ月の変容のプロセス',
        overview: '星々の動きがもたらす今月の魂の変容テーマと宇宙の祝福',
        rhythm: '1ヶ月の中で満ち欠ける月の波と、日々の調和の保ち方',
        session: [
            '今月を通じて大切にしたい自己の軸と愛のスタンス',
            'クライアントとの深い絆を結ぶセッション・アプローチ',
            '新月・満月の前後で変わるクライアントの状態への配慮',
            '今月の施術で意識したいエネルギーの循環'
        ],
        selfcare: [
            '1ヶ月を健やかに巡らせるためのコンディショニング',
            '滞りを防ぎ、自分の光を絶やさないために留意したいこと'
        ]
    },
    '3months': {
        label: '直近3ヶ月',
        lead: '季節の巡りと、3ヶ月の大いなるバイオリズム',
        overview: '季節の巡りと大きな星々の配置がもたらす成長と昇華のストーリー',
        rhythm: '大きな宇宙の潮流の中で、日々の波動をいかに美しく整えるか',
        session: [
            '3ヶ月を通じて軸を揺るがせない聖なるマインド',
            'クライアントの変容を温かく見守る導きの手引き',
            '季節の移り変わりに合わせた施術の組み立て',
            '継続して通うクライアントとの関係の育て方'
        ],
        selfcare: [
            '心身とスピリットを深く癒やす至福のコンディショニング',
            '焦らず宇宙の流れを信頼するための心の置きどころ'
        ]
    },
    '6months': {
        label: '半年',
        lead: '半年間の光の成長サイクルと、魂のミッションの深まり',
        overview: '二至二分をまたぐ大きな宇宙のサイクルと、魂の脱皮・開花のテーマ',
        rhythm: '半年の時の移ろいの中で、セラピスト自身の内なる光がどう育っていくか',
        session: [
            '半年をかけて育むセラピストとしての揺るぎない天命',
            '訪れるクライアントたちの集大成的な変容と真の癒やし',
            '長い時間軸で信頼を重ねていくための関わり方',
            '季節をまたぐメニューや施術の見直しどころ',
            '半年の節目で振り返りたいセッションの手応え'
        ],
        selfcare: [
            '深く広大なエネルギーを保持するためのスピリチュアルケア',
            '長い航路で手放すべき執着と、抱くべき信頼',
            '半年を走り切るための休息の取り方'
        ]
    },
    '1year': {
        label: '1年',
        lead: '年間の宇宙バイオリズムと、セラピストとしての天命・光の航海図',
        overview: '1年を通じて展開する大きな星々の舞踏と、セラピストとしての至高のテーマ',
        rhythm: '四大元素（火・地・風・水）の移り変わりと、魂の変容の物語',
        session: [
            '1年を通じて世界と人々に届ける愛のエネルギー',
            '深遠なセッションを通じて結ばれるソウルファミリーとの絆',
            '1年の中で訪れる出会いと別れの受けとめ方',
            'セラピストとしてのライフワークの育て方',
            '年間を通じて磨いていきたい技と感性'
        ],
        selfcare: [
            '1年の道すがらで出逢う試練を感謝と光に変える導き',
            '自分自身のスピリットを昇華させるための時間の持ち方',
            '燃え尽きずに1年を歩むためのエネルギー配分'
        ]
    }
};

/** 星詠みメッセージのプロンプトと文体指示を組み立てる */
function buildAdvicePrompt(period, planetaryData) {
    const spec = ADVICE_PERIOD_SPECS[period] || ADVICE_PERIOD_SPECS.today;
    const bullets = (items) => items.map((t) => `- （${t}）`).join('\n');

    const prompt = `基準日付: ${planetaryData.date}\n現在の天体配置データ:\n${JSON.stringify(planetaryData, null, 2)}\n\n上記データを起点に、「${spec.label}」の${spec.lead}を紡いでください。`;

    const systemInstruction = `あなたはセラピスト・ヒーラーを優しく導く聖なる西洋占星術アドバイザーです。
天文データを元に、【${spec.label}】の宇宙の流れとセラピスト自身の光のバイオリズムを、美しく豊かな言葉で解説してください。

【最重要要件】
1. 文体・トーン＆マナー：
   - 占星術の専門知識に基づきつつ、ヒーラーやセラピストの心に温かく響く、神秘的で詩的かつ心地よいスピリチュアルな言葉遣い（例：「宇宙の波紋」「光の祝祭」「魂のバイオリズム」「星々の祝福」「聖なる静寂」「光の器としてのセラピスト」等）を用いて深みのある文章を作成してください。
2. 見出し：
   - 下記の4つの見出しを、書かれている通りの文言でそのまま使ってください。言い換えたり増減させたりしないでください。
   - タイトルや前置き、副題は付けず、必ず「### 【1. ...】」から書き始めてください。
3. 完全性：
   - 途中で文章を打ち切らず、【1】から【4】までの全4セクションを最後の1言まで美しく完成させてください。
   - 箇条書きの本数は指定された数に合わせてください。
4. セクション3と4の書き分け：
   - 【3】は「クライアントに向けること」だけを書いてください。
   - 【4】は「セラピスト自身に向けること」だけを書いてください。セルフケアも、気をつけたいことも、すべて【4】に含めます。
5. Markdown記法：
   - リスト項目は「- 項目内容」のように記述してください。
   - 強調は「**重要語句**」のようにアスタリスク2個で囲んでください。

【出力フォーマット（必ずこの形式で出力）】
### 【1. ${spec.label}を照らす星の流れ】
（${spec.overview}）

### 【2. 月が導く心身のバイオリズム】
（${spec.rhythm}）

### 【3. セッションに活かす実践】
${bullets(spec.session)}

### 【4. セラピスト自身のセルフケアと護り】
${bullets(spec.selfcare)}`;

    return { prompt, systemInstruction };
}

// 天体データ取得とAIアドバイス生成エンドポイント

// ---------------------------------------------------------------------------
// 天体データの算出
// ---------------------------------------------------------------------------

const SIGNS = ['牡羊座', '牡牛座', '双子座', '蟹座', '獅子座', '乙女座', '天秤座', '蠍座', '射手座', '山羊座', '水瓶座', '魚座'];

/** 指定日時の天体配置を組み立てる */
function buildPlanetaryData(period, date) {
    const time = Astronomy.MakeTime(date);
    const getSign = (body) => {
        const ecl = Astronomy.Ecliptic(Astronomy.GeoVector(body, time, true));
        return SIGNS[Math.floor(ecl.elon / 30) % 12];
    };

    // 水星逆行チェック
    const isMercuryRetrograde = (() => {
        const dt = 0.1;
        const p1 = Astronomy.Ecliptic(Astronomy.GeoVector(Astronomy.Body.Mercury, time.AddDays(-dt), true)).elon;
        const p2 = Astronomy.Ecliptic(Astronomy.GeoVector(Astronomy.Body.Mercury, time, true)).elon;
        let diff = p2 - p1;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        return diff < 0;
    })();

    // 月相の計算 (0=新月, 90=上弦, 180=満月, 270=下弦)
    const moonPhaseDeg = Astronomy.MoonPhase(time);
    let moonPhase = '満ちていく月';
    if (moonPhaseDeg < 15 || moonPhaseDeg >= 345) moonPhase = '新月 (New Moon)';
    else if (moonPhaseDeg >= 75 && moonPhaseDeg <= 105) moonPhase = '上弦の月 (First Quarter)';
    else if (moonPhaseDeg >= 165 && moonPhaseDeg <= 195) moonPhase = '満月 (Full Moon)';
    else if (moonPhaseDeg >= 255 && moonPhaseDeg <= 285) moonPhase = '下弦の月 (Third Quarter)';
    else if (moonPhaseDeg > 180) moonPhase = '欠けていく月';

    // 期間全体の主要天体イベント（1ヶ月以上のスパンのみ）
    const periodEvents = ['1month', '3months', '6months', '1year'].includes(period)
        ? calculatePeriodEvents(date, period)
        : [];

    return {
        date: date.toLocaleDateString('ja-JP'),
        period,
        sunSign: getSign(Astronomy.Body.Sun),
        moonSign: getSign(Astronomy.Body.Moon),
        mercurySign: getSign(Astronomy.Body.Mercury),
        venusSign: getSign(Astronomy.Body.Venus),
        marsSign: getSign(Astronomy.Body.Mars),
        // 社会天体・トランスサタニアン。星詠みの文章では主役にならないが、
        // 顧客のソウルカラーから天体を引く（product/js/app/correspondence.js）
        // ときに必要になるため、位置だけは常に持たせておく。
        jupiterSign: getSign(Astronomy.Body.Jupiter),
        saturnSign: getSign(Astronomy.Body.Saturn),
        uranusSign: getSign(Astronomy.Body.Uranus),
        neptuneSign: getSign(Astronomy.Body.Neptune),
        plutoSign: getSign(Astronomy.Body.Pluto),
        isMercuryRetrograde,
        moonPhase,
        periodEvents
    };
}

// ---------------------------------------------------------------------------
// 保存済みデータの読み書き
// ---------------------------------------------------------------------------

/** 保存先のファイルパス */
function storePath(period) {
    return path.join(STORE_DIR, `${period}.json`);
}

/** 保存済みの星詠みを読む。無ければ null。 */
function readStored(period) {
    try {
        return JSON.parse(fs.readFileSync(storePath(period), 'utf8'));
    } catch (err) {
        return null;
    }
}

/** 星詠みをファイルに保存する */
function writeStored(period, payload) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
    fs.writeFileSync(storePath(period), JSON.stringify(payload, null, 2) + '\n', 'utf8');
    return storePath(period);
}

/**
 * 再生成が必要かを判定する。
 * 期間ごとの更新サイクル（getCacheInfo の key）が変わっていれば古い。
 */
function isStale(period, date = new Date()) {
    const stored = readStored(period);
    if (!stored) return true;
    return stored.cacheKey !== getCacheInfo(period, date).key;
}

/** 保存済み一覧の要約（更新スクリプトの表示用） */
function listStored(date = new Date()) {
    return PERIODS.map((period) => {
        const stored = readStored(period);
        return {
            period,
            generatedAt: stored ? stored.generatedAt : null,
            usedProvider: stored ? stored.usedProvider : null,
            usedModel: stored ? stored.usedModel : null,
            stale: isStale(period, date)
        };
    });
}

// ---------------------------------------------------------------------------
// 生成
// ---------------------------------------------------------------------------

/**
 * 指定期間の星詠みを生成して返す（保存はしない）。
 * @param {string} period
 * @param {object} [options]
 * @param {Date}   [options.date]         基準日時
 * @param {string} [options.customApiKey] クライアント指定のGeminiキー
 * @param {string} [options.preferredProvider] 画面で選ばれたAI（claude / anthropic / gemini）
 * @param {string} [options.preferredModel] 画面で選ばれた Claude のモデル
 */
async function generateAdvicePayload(period, { date = new Date(), customApiKey, preferredProvider, preferredModel } = {}) {
    const cacheInfo = getCacheInfo(period, date);
    const planetaryData = buildPlanetaryData(period, date);
    const { prompt, systemInstruction } = buildAdvicePrompt(period, planetaryData);

    const result = await generateAdvice({
        prompt, systemInstruction, customApiKey, preferredProvider, preferredModel, label: '星詠みメッセージ'
    });

    const pad = (n) => String(n).padStart(2, '0');
    const generatedAt = `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} `
        + `${pad(date.getHours())}:${pad(date.getMinutes())}`;

    return {
        advice: result.text,
        data: planetaryData,
        events: planetaryData.periodEvents,
        generatedAt,
        generatedAtISO: date.toISOString(),
        updateInterval: cacheInfo.intervalLabel,
        periodName: cacheInfo.periodName,
        usedModel: result.usedModel,
        usedProvider: result.usedProvider,
        // Claudeが使えずGeminiに切り替わった場合、その経緯をUIで示せるようにする
        fallbackFrom: result.fallbackFrom || [],
        // 次回の更新要否を判定するための世代キー
        cacheKey: cacheInfo.key,
        // このサイクルが終わる時刻。ブラウザはこれを見て「古い」と出す。
        // 期間ごとの規則をブラウザ側に書き写さずに済ませるため、ここで入れておく。
        nextUpdateAtISO: (() => {
            const next = nextCycleStart(period, date);
            return next ? next.toISOString() : null;
        })()
    };
}

/** 生成してファイルに保存する */
async function refreshPeriod(period, options = {}) {
    const payload = await generateAdvicePayload(period, options);
    const file = writeStored(period, payload);
    return { payload, file };
}

/**
 * 保存済みファイルの天体データだけを計算し直す。AIは呼ばない。
 *
 * buildPlanetaryData に天体を足したときに、文章を再生成せずに
 * 新しい項目だけを既存ファイルへ反映させるために使う。
 * 生成時と同じ日時で計算するので、文章と天体の位置がずれることはない。
 */
function backfillPlanetaryData(period) {
    const stored = readStored(period);
    if (!stored) return { period, skipped: '未生成' };

    const baseDate = stored.generatedAtISO ? new Date(stored.generatedAtISO) : new Date();
    if (Number.isNaN(baseDate.getTime())) return { period, skipped: '生成日時が読めない' };

    const fresh = buildPlanetaryData(period, baseDate);
    const added = Object.keys(fresh).filter((k) => !(k in (stored.data || {})));

    // periodEvents は文章の根拠になっているので、既存の値を保持する
    const merged = { ...fresh, periodEvents: (stored.data || {}).periodEvents || fresh.periodEvents };

    // サイクルの終わりも入れ直す。生成時と同じ日時で計算するので、
    // 文章を作り直さずに「いつまでが最新か」だけを後から足せる。
    const next = nextCycleStart(period, baseDate);
    if (!stored.nextUpdateAtISO) added.push('nextUpdateAtISO');

    const file = writeStored(period, {
        ...stored,
        data: merged,
        events: merged.periodEvents,
        nextUpdateAtISO: next ? next.toISOString() : null
    });
    return { period, added, file };
}

module.exports = {
    PERIODS,
    STORE_DIR,
    getCacheInfo,
    nextCycleStart,
    buildPlanetaryData,
    backfillPlanetaryData,
    buildAdvicePrompt,
    generateAdvicePayload,
    refreshPeriod,
    readStored,
    writeStored,
    isStale,
    listStored
};
