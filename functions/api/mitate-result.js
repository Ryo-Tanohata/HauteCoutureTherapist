// くらしの見立て：ルーティン（Claude）が書き上げた見立てを受け取る窓口。
//
//   POST /api/mitate-result   { id, text }   見出し X-Mitate-Key: <MITATE_RESULT_KEY>
//
// ルーティンはクラウドで動くので、Zero Trust の入口（メールの数字）を通れない。
// そのためこの1本だけは入口の例外（Bypass）にし、代わりに専用の合鍵で守る。
// 受け付けるのは、こちらが起動して「待ち」にしている依頼への答えだけ。
// 知らない id、すでに答えがある id は受け取らない。
//
// ── 要る設定 ──
//   MITATE_RESULT_KEY … 長いでたらめな値。ルーティンの環境変数にも同じ値を入れる
//   Zero Trust：/api/mitate-result を Bypass にする（手順は management/10_Operations/くらしの見立ての自動化.md）

const PREFIX = 'mitate/req/';
const MAX_TEXT = 20000;

function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
    });
}

function sameSecret(a, b) {
    const enc = new TextEncoder();
    const ba = enc.encode(String(a || ''));
    const bb = enc.encode(String(b || ''));
    if (ba.byteLength !== bb.byteLength) return false;
    if (crypto.subtle && typeof crypto.subtle.timingSafeEqual === 'function') {
        return crypto.subtle.timingSafeEqual(ba, bb);
    }
    let diff = 0;
    for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i];
    return diff === 0;
}

export async function onRequestPost(context) {
    const { request, env } = context;
    const bucket = env.SALON_STORE;
    if (!bucket || !env.MITATE_RESULT_KEY) return json({ error: 'not-configured' }, 503);
    if (!sameSecret(request.headers.get('X-Mitate-Key'), env.MITATE_RESULT_KEY)) {
        return json({ error: 'unauthorized' }, 401);
    }
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'bad-request' }, 400); }
    const id = String((body && body.id) || '');
    const text = String((body && body.text) || '').trim();
    if (!/^[0-9a-f-]{36}$/.test(id) || !text) return json({ error: 'bad-request' }, 400);
    if (text.length > MAX_TEXT) return json({ error: 'too-long' }, 413);

    const obj = await bucket.get(PREFIX + id);
    if (!obj) return json({ error: 'unknown-id' }, 404);
    let rec;
    try { rec = JSON.parse(await obj.text()); } catch (e) { rec = {}; }
    if (rec.status !== 'pending') return json({ error: 'already-done' }, 409);

    await bucket.put(PREFIX + id, JSON.stringify({ status: 'done', created: rec.created, text }), {
        customMetadata: { created: String(rec.created || Date.now()) }
    });
    return json({ ok: true });
}
