// 端末をまたぐための置き場（Cloudflare Pages の関数）。
//
// ── なぜ Cloudflare に移したか ──
// Vercel の Hobby プランは、規約で個人・非商用の利用に限られている。
// しかも「理由の有無にかかわらず予告なく停止できる」と書かれている。
// 営業中のサロンのカルテが載る場所としては、そこに預けたままにできない。
// Cloudflare は無料プランでも商用利用が認められている。
//
// ── サーバーは中身を読めない ──
// 送られてくるのは、すでに端末側で暗号化されたかたまり。ここでは中身を
// 見ないし、見られない。鍵はブラウザの中だけで作られ、外へ出ない。
//
// 合言葉からは2つの値が作られる（PBKDF2 の別ブロック）。
//   ・認証用   … ここへ送られてくる。合っているかを見るだけ
//   ・暗号化用 … 一切送られない
// 片方から他方は**計算できない**。ただし認証用を見た人は、合言葉を片端から
// 試して当てにいける（塩は公開・21万回）。当たれば暗号化用も作れる。
// **この窓口を握れば中身は読めない、とまでは言えない**（ISSUE-088 ⓐ）。
// 直す段取りは management/10_Operations/置き場の鍵の入れ替え.md にある。
//
// ── 置き方 ──
//   salon/data.bin          … 顧客と記録（暗号化済み）
//   salon/photos/<id>.bin   … 写真1枚ずつ（暗号化済み）
//
// 置き場を変えても、この形をそろえておけば、書き出し・読み込みで運べる。
//
// ── 要る設定（Cloudflare の画面で1回だけ） ──
//   R2 バケットを SALON_STORE という名前で結びつける
//   環境変数 SALON_KEY に、アプリが出す値を入れる

const DATA_KEY = 'salon/data.bin';
const PHOTO_PREFIX = 'salon/photos/';
const MAX_BODY = 12 * 1024 * 1024;

function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff'
        }
    });
}

function bytes(buf) {
    return new Response(buf, {
        status: 200,
        headers: {
            'Content-Type': 'application/octet-stream',
            'Cache-Control': 'no-store',
            // 中身は暗号化された塊。種類を推測させると、まれに別物として扱われる
            'X-Content-Type-Options': 'nosniff'
        }
    });
}

/**
 * 合言葉の値くらべ。
 *
 * 1文字ずつ見て途中で止めると、答えるまでの時間から少しずつ正解が漏れる。
 * 長さだけは先に分かってしまうが、そこは避けようがない。
 */
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

export async function onRequest(context) {
    const { request, env } = context;

    if (!env.SALON_KEY) {
        return json({
            error: 'このサーバーにはまだ合言葉が設定されていません。'
                + 'Cloudflare の環境変数 SALON_KEY を設定してください。'
        }, 503);
    }
    if (!env.SALON_STORE) {
        return json({
            error: 'このサーバーには置き場（R2）がつながっていません。'
                + 'Cloudflare で R2 バケットを SALON_STORE という名前で結びつけてください。'
        }, 503);
    }
    if (!sameSecret(request.headers.get('x-salon-auth'), env.SALON_KEY)) {
        return json({ error: '合言葉が違うようです。' }, 401);
    }

    const url = new URL(request.url);
    const what = url.searchParams.get('what') || '';
    const id = url.searchParams.get('id') || '';
    const method = request.method.toUpperCase();
    const store = env.SALON_STORE;

    const readBody = async () => {
        const buf = await request.arrayBuffer();
        if (buf.byteLength > MAX_BODY) throw new Error('大きすぎます。');
        return buf;
    };

    try {
        if (what === 'ping') return json({ ok: true });

        if (what === 'data') {
            if (method === 'GET') {
                const obj = await store.get(DATA_KEY);
                if (!obj) return json({ error: 'まだ何も置かれていません。' }, 404);
                return bytes(await obj.arrayBuffer());
            }
            if (method === 'PUT' || method === 'POST') {
                const buf = await readBody();
                if (!buf.byteLength) return json({ error: '中身がありません。' }, 400);
                await store.put(DATA_KEY, buf, {
                    httpMetadata: { contentType: 'application/octet-stream', cacheControl: 'no-store' }
                });
                return json({ ok: true });
            }
        }

        if (what === 'photos' && method === 'GET') {
            // 写真が増えても取りこぼさないよう、続きがある間はたどる
            const ids = [];
            let cursor;
            for (;;) {
                const page = await store.list({ prefix: PHOTO_PREFIX, limit: 1000, cursor });
                page.objects.forEach((o) => {
                    ids.push(o.key.slice(PHOTO_PREFIX.length).replace(/\.bin$/, ''));
                });
                if (!page.truncated) break;
                cursor = page.cursor;
            }
            return json({ ids });
        }

        if (what === 'photo') {
            // 名前を絞る。ここを緩くすると、置き場の別の場所を触られる
            if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
                return json({ error: '写真の名前が不正です。' }, 400);
            }
            const key = `${PHOTO_PREFIX}${id}.bin`;
            if (method === 'GET') {
                const obj = await store.get(key);
                if (!obj) return json({ error: 'ありません。' }, 404);
                return bytes(await obj.arrayBuffer());
            }
            if (method === 'PUT' || method === 'POST') {
                const buf = await readBody();
                if (!buf.byteLength) return json({ error: '中身がありません。' }, 400);
                await store.put(key, buf, {
                    httpMetadata: { contentType: 'application/octet-stream' }
                });
                return json({ ok: true });
            }
        }

        return json({ error: '呼び出し方が違います。' }, 400);
    } catch (e) {
        return json({ error: (e && e.message) || '置き場で問題が起きました。' }, 500);
    }
}
