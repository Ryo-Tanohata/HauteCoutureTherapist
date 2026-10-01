// くらしの見立て：ルーティン（Claude Code）を起動し、書き上がりを待つ窓口。
//
//   POST /api/mitate        { request: "<依頼文>" }  → { id }
//        ルーティンの API トリガーを叩いて、Claude を起動する。
//   GET  /api/mitate?id=…   → { status: "pending" | "done" | "timeout" | "unknown", text? }
//        書き上がっていれば見立てを返し、その場で置き場から消す。
//
// ── 費用 ──
// ルーティンは Lou さんの claude.ai アカウントのサブスク枠で動く。従量課金の API キーは使わない。
//
// ── 守り ──
// ・この窓口は Zero Trust の入口の内側にある（ログインしたセラピストしか叩けない）
// ・ルーティンの合鍵（MITATE_ROUTINE_TOKEN）はここだけが持ち、画面には出さない
// ・見立ては R2 に一時的に置き、画面が受け取ったら消す。受け取られなければ1日で捨てる
// ・1時間に起動できる回数を、こちらでも絞る（ルーティン側の上限は30回）
//
// ── 要る設定（Cloudflare Pages の環境変数・シークレット） ──
//   MITATE_ROUTINE_URL    … ルーティンの API トリガーの URL（…/routines/trig_…/fire）
//   MITATE_ROUTINE_TOKEN  … そのトリガーで発行した合鍵
//   R2 は SALON_STORE を使う（置き場と同じバケットの mitate/ の下）

const PREFIX = 'mitate/req/';
const MAX_REQUEST = 12000;          // 依頼文の上限（文字）
const PER_HOUR = 20;                // 1時間に頼める回数
const WAIT_LIMIT_MS = 20 * 60 * 1000;
const KEEP_MS = 24 * 60 * 60 * 1000;

function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
    });
}

const validId = (id) => /^[0-9a-f-]{36}$/.test(String(id || ''));

/** 古い依頼を片づけつつ、この1時間に頼んだ数を数える */
async function sweepAndCount(bucket) {
    const now = Date.now();
    let recent = 0;
    const listed = await bucket.list({ prefix: PREFIX, limit: 1000, include: ['customMetadata'] });
    for (const obj of listed.objects) {
        const created = Number((obj.customMetadata || {}).created || 0) || obj.uploaded.getTime();
        if (now - created > KEEP_MS) await bucket.delete(obj.key);
        else if (now - created < 60 * 60 * 1000) recent += 1;
    }
    return recent;
}

async function fire(env, id, requestText) {
    const res = await fetch(env.MITATE_ROUTINE_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${env.MITATE_ROUTINE_TOKEN}`,
            // ルーティン画面の見本の curl に出る値。変わったら環境変数で差し替えられる
            'anthropic-beta': env.MITATE_ROUTINE_BETA || 'experimental-cc-routine-2026-04-01',
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: JSON.stringify({ id, request: requestText }) })
    });
    return res;
}

export async function onRequest(context) {
    const { request, env } = context;
    const bucket = env.SALON_STORE;
    if (!bucket) return json({ error: 'not-configured', detail: 'R2（SALON_STORE）が結びついていません' }, 503);

    if (request.method === 'POST') {
        if (!env.MITATE_ROUTINE_URL || !env.MITATE_ROUTINE_TOKEN) {
            return json({ error: 'not-configured', detail: 'ルーティンの URL か合鍵が設定されていません' }, 503);
        }
        let body;
        try { body = await request.json(); } catch (e) { return json({ error: 'bad-request' }, 400); }
        const text = String((body && body.request) || '').trim();
        if (!text) return json({ error: 'bad-request', detail: '依頼文が空です' }, 400);
        if (text.length > MAX_REQUEST) return json({ error: 'too-long' }, 413);

        if (await sweepAndCount(bucket) >= PER_HOUR) {
            return json({ error: 'busy', detail: '1時間に頼める回数を超えました。少し時間をおいてください' }, 429);
        }

        const id = crypto.randomUUID();
        const now = Date.now();
        await bucket.put(PREFIX + id, JSON.stringify({ status: 'pending', created: now }), {
            customMetadata: { created: String(now) }
        });

        let res;
        try {
            res = await fire(env, id, text);
        } catch (e) {
            await bucket.delete(PREFIX + id);
            return json({ error: 'fire-failed', detail: 'Claude を起動できませんでした（通信）' }, 502);
        }
        if (!res.ok) {
            await bucket.delete(PREFIX + id);
            // 原因を見分けるため、相手の返事の頭だけ添える（合鍵は含まれない）
            let why = '';
            try { why = (await res.text()).replace(/\s+/g, ' ').slice(0, 160); } catch (e) { why = ''; }
            const url = String(env.MITATE_ROUTINE_URL || '');
            const shape = /^https:\/\/api\.anthropic\.com\/v1\/claude_code\/routines\/trig_[A-Za-z0-9]+\/fire$/.test(url)
                ? '' : ' ／ MITATE_ROUTINE_URL の形が違います（…/routines/trig_…/fire で終わるはず）';
            return json({ error: 'fire-failed', detail: `Claude を起動できませんでした（${res.status}）${shape}${why ? ` ／ ${why}` : ''}` }, 502);
        }
        return json({ id });
    }

    if (request.method === 'GET') {
        const id = new URL(request.url).searchParams.get('id');
        if (!validId(id)) return json({ status: 'unknown' }, 400);
        const obj = await bucket.get(PREFIX + id);
        if (!obj) return json({ status: 'unknown' });
        let rec;
        try { rec = JSON.parse(await obj.text()); } catch (e) { rec = {}; }
        if (rec.status === 'done') {
            await bucket.delete(PREFIX + id);          // 受け取ったら置き場には残さない
            return json({ status: 'done', text: rec.text || '' });
        }
        if (Date.now() - Number(rec.created || 0) > WAIT_LIMIT_MS) {
            await bucket.delete(PREFIX + id);
            return json({ status: 'timeout' });
        }
        return json({ status: 'pending' });
    }

    return json({ error: 'method-not-allowed' }, 405);
}
