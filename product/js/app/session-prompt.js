/**
 * セッション提案のプロンプト組み立て。
 *
 * サーバー（server/session-advice.js）とブラウザ（ai-client.js）の両方から
 * 使う。同じ文面で組まないと、サーバー経由と自分のAPIキー経由とで
 * 出てくるものが変わってしまうため、ここ1か所に置いている。
 *
 * ── 安全の考え方 ──
 * 禁忌の判定はAIにさせない。呼び出し側が oil-safety.js で除外を済ませ、
 * ここには「使ってよい候補」だけが渡ってくる。AIの役割は、残った候補と
 * 訴えを見て言葉を組むことに限定する。
 */

export function buildSessionPrompt(ctx) {
    const isSession = ctx.mode === 'session';

    const lines = [];
    lines.push(`# この方の固定情報（名前と生年月日から算出）`);
    ctx.colors.forEach((c) => {
        const moved = c.movedFrom ? `（前回来店時は${c.movedFrom}）` : '';
        lines.push(`- ${c.hue}：${c.planet}が現在${c.planetSign}${moved} ／ 軸の部位=${c.chakraArea} ／ いま重なる部位=${c.signBodyPart || '—'}`);
    });

    lines.push(`\n# 使ってよい精油（この候補以外は絶対に挙げないこと）`);
    ctx.allowedOils.forEach((o) => {
        const extra = [...(o.cares || []), ...(o.notes || [])].filter(Boolean);
        lines.push(`- ${o.oil}${extra.length ? `（注意: ${extra.join(' / ')}）` : ''}`);
    });

    if (ctx.excludedOils && ctx.excludedOils.length > 0) {
        lines.push(`\n# 体質により除外済み（提案してはいけない）`);
        ctx.excludedOils.forEach((o) => lines.push(`- ${o.oil}：${(o.reasons || []).join('・')}`));
    }

    // 基材（キャリアオイル）。ナッツやキク科のアレルギーはここに出る。
    // 精油だけ絞っても、基材で当たってしまっては意味がない。
    if (ctx.carrierOils && ctx.carrierOils.length > 0) {
        lines.push(`\n# 使ってよいキャリアオイル（この候補以外は絶対に挙げないこと）`);
        ctx.carrierOils.forEach((o) => {
            lines.push(`- ${o.oil}${o.note ? `（${o.note}）` : ''}`);
        });
    }

    if (ctx.excludedCarriers && ctx.excludedCarriers.length > 0) {
        lines.push(`\n# アレルギーにより除外済みのキャリアオイル（提案してはいけない）`);
        ctx.excludedCarriers.forEach((o) => lines.push(`- ${o.oil}：${(o.reasons || []).join('・')}`));
    }

    if (typeof ctx.maxDilution === 'number') {
        lines.push(`\n# 希釈の上限\n- ${ctx.maxDilution}% を超えないこと`);
    }

    // 「その他」に書かれたもの。どの精油が該当するかはアプリでは判断できないので、
    // 除外はしていない。AIにも判断させず、施術者へ確認を促す材料として渡す。
    if (ctx.freeTextCautions && ctx.freeTextCautions.length > 0) {
        lines.push(`\n# 自由入力の申し送り（自動での除外はされていない）`);
        ctx.freeTextCautions.forEach((c) => {
            lines.push(`- ${c.label}：${c.text}`);
        });
        lines.push('※ これらは候補の絞り込みに反映されていない。'
            + '該当しそうな精油・基材があれば「確認したいこと」で施術者に確認を促すこと。');
    }

    if (ctx.history && ctx.history.length > 0) {
        lines.push(`\n# これまでの経過（新しい順）`);
        ctx.history.forEach((h) => {
            lines.push(`- ${h.date}｜訴え「${h.complaint || '記載なし'}」｜処方「${h.prescription || '記載なし'}」｜気付き「${h.note || '記載なし'}」${h.colors ? `｜選んだ色: ${h.colors}` : ''}`);
        });
    }

    if (isSession) {
        lines.push(`\n# 今日の訴え（最優先で扱うこと）\n${ctx.todayComplaint || '（未入力）'}`);
        if (ctx.todayColors && ctx.todayColors.length > 0) {
            lines.push(`\n# 今日クライアントが選んだ色\n${ctx.todayColors.join('、')}`);
        }
    }

    const prompt = lines.join('\n');

    const systemInstruction = `あなたはアロマセラピストを補助するアシスタントです。担当セラピスト（施術者）だけが読む業務メモを書きます。

【絶対に守ること】
1. 精油は「使ってよい精油」に挙がっているものだけを使う。除外済みの精油は理由があって外されているので、名前を出すことすら避ける。キャリアオイル（基材）も同じで、挙がっているものだけを使う。
2. 希釈の上限が指定されていれば、それを超える濃度を書かない。
3. 効能や治療効果を断定しない。「〜が期待できます」「〜と言われています」といった、施術者が判断できる書き方にする。
4. 診断や医療行為の指示をしない。医療的な懸念があれば「受診の確認を」と促すにとどめる。
5. 星や色の対応づけは象徴であって効能ではない。組み立ての切り口として使い、根拠として断定しない。

【書き方】
- クライアントに見せる文章ではなく、施術者の手元メモとして書く。
- 装飾的・スピリチュアルな美文にはしない。短く具体的に。
- 全体で400字以内。

【出力フォーマット（この見出しをそのまま使う）】
### 今日の見立て
（${isSession ? '今日の訴えを起点に、経過との関係を2〜3文' : '経過と今日の星の重なりから、想定される状態を2〜3文'}）

### 部位の配分
（軸の部位といまの部位をどう配分するか。1〜2文）

### 精油の組み立て
（候補から2〜3種を選び、比率と希釈を書く。なぜその組み合わせかを一言）

### 確認したいこと
（施術前にクライアントへ確認しておきたい点を1〜2個。箇条書き）`;

    return { prompt, systemInstruction };
}
