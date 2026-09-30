// 合言葉ひとつで端末をまたぐ置き場（ブラウザ側）。
//
// ── なぜこれを足したか ──
// OneDrive も、パソコンのフォルダも、サロンの環境では使えなかった。どちらも
// 「サロン側でアカウントを作る・アプリを登録する」ことが前提だったため。
// ここは、その工程を無くした道。するのは合言葉を1回入れることだけで、
// サインインも登録もない。iPhone でも使える。
//
// ── 置き場からは中身が読めない ──
// 送る前に、この端末の中で暗号化する。サーバーが受け取るのは、鍵が無ければ
// ただの雑音でしかないかたまり。体質・アレルギー・施術記録は、漏れたときに
// 取り返しがつかないため、預ける側で読めなくしてから預ける。
//
// 合言葉からは PBKDF2 で512ビットを作り、前半と後半を別の用途に使う。
//   前半 … 暗号化の鍵。この端末から出ない
//   後半 … 合言葉が合っているかを見てもらうための値。これだけを送る
// PBKDF2 は前半と後半を別々に計算するので、**後半から前半は計算できない**。
//
// ただし「読めない」と言い切れるのは、預かる側が中身を**見ようとしない**間だけ。
// **後半を見た人は、合言葉を片端から試して当てにいける**（ISSUE-088 ⓐ）。
// 塩は決め打ちで公開、繰り返しは21万回。当たれば前半も作れるので中身は読める。
// 短い合言葉・思いつきやすい合言葉だと、そこが効く。
//
// また、**合言葉を変えると前半も変わる**ので、置いてあるものが開けなくなる。
// 「漏れたかもしれないから変えたい」ができない（ISSUE-088 ⓑ）。
// 直す段取りは management/10_Operations/置き場の鍵の入れ替え.md にある。
//
// ── 正直に言っておくこと ──
// ・合言葉を忘れると、置いてあるものは誰にも読めない。取り戻す道は無い。
// ・合言葉はこの端末に控える（開いたときに自動で同期するため）。
//   端末そのものを他人に渡せば、その人は中身を見られる。守っているのは
//   「置き場に預けたぶん」であって、端末の中ではない。
// ・塩（salt）は決め打ちの固定値で、秘密ではない。合言葉が短いと総当たりに
//   弱いので、長めの言葉にしてもらう。

const STORE_CFG_KEY = 'therapist_salon_store_cfg';
// 名前を変える前に合言葉を入れた端末が、まだ残っている可能性がある。
// これを消すと、その端末は更新した瞬間に「まだつながっていません」に戻り、
// 合言葉を入れ直すことになるので、読むだけは残しておく。
const STORE_CFG_KEY_LEGACY = 'therapist_vercel_cfg';
const STORE_ITERATIONS = 210000;
/** 合言葉の最短の長さ。短いと、暗号化そのものが意味を失う */
export const STORE_MIN_PASSPHRASE = 12;

export function getStoreConfig() {
    try {
        // 名前を変える前に入れた合言葉を拾う。ここを見落とすと、
        // 更新しただけで全部の端末が「まだつながっていません」に戻る。
        const stored = localStorage.getItem(STORE_CFG_KEY)
            || localStorage.getItem(STORE_CFG_KEY_LEGACY);
        const raw = JSON.parse(stored || '{}');
        return { pass: '', autoSync: true, apiBase: '', ...(raw && typeof raw === 'object' ? raw : {}) };
    } catch (e) {
        return { pass: '', autoSync: true, apiBase: '' };
    }
}

export function setStoreConfig(patch) {
    const next = { ...getStoreConfig(), ...patch };
    try { localStorage.setItem(STORE_CFG_KEY, JSON.stringify(next)); } catch (e) { /* noop */ }
    storeKeys = null;   // 合言葉が変わったら、作り置きの鍵は捨てる
    return next;
}

export function isStoreConnected() {
    return Boolean(getStoreConfig().pass);
}

export function disconnectStore() {
    setStoreConfig({ pass: '' });
}

// ------------------------------------------------------------------
// 鍵づくり
// ------------------------------------------------------------------

let storeKeys = null;   // { pass, key, auth } 作り直しは高くつくので取っておく

function utf8(s) { return new TextEncoder().encode(s); }

function toHex(bytes) {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function storeSalt() {
    // 塩は固定の文字列から作る。秘密ではない。
    //
    // 以前はここに URL を混ぜていた。置き場ごとに違う塩にするためだったが、
    // それだと同じ合言葉でも開く場所によって別の鍵になってしまう。
    //   ・独自ドメインを付けた
    //   ・www あり／なしで開いた
    //   ・プレビュー用のURLで設定して、本番で使った
    // どれも「昨日まで開けたのに、今日は合言葉が違うと言われる」になる。
    // 置いたものが二度と開けなくなる壊れ方なので、URLからは切り離す。
    //
    // 塩を固定にすると、あらかじめ作った表で総当たりされやすくはなる。
    // そこは合言葉の長さ（12文字以上）と、鍵づくりの重さ（21万回）で
    // 支えている。
    const digest = await crypto.subtle.digest('SHA-256',
        utf8('HauteCoutureTherapist|salon-store|v1'));
    return new Uint8Array(digest);
}

async function storeDerive(pass) {
    if (storeKeys && storeKeys.pass === pass) return storeKeys;
    const base = await crypto.subtle.importKey('raw', utf8(pass), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: await storeSalt(), iterations: STORE_ITERATIONS, hash: 'SHA-256' },
        base, 512));
    storeKeys = {
        pass,
        key: await crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']),
        auth: toHex(bits.slice(32, 64))
    };
    return storeKeys;
}

/**
 * 合言葉から、サーバーに置いてもらう値を作る。
 * 設定のときに画面へ出して、サーバー の環境変数 SALON_KEY に写してもらう。
 */
export async function storeAuthValue(pass) {
    return (await storeDerive(pass)).auth;
}

async function seal(key, bytes) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
    const out = new Uint8Array(iv.length + ct.length);
    out.set(iv, 0);
    out.set(ct, iv.length);
    return out;
}

async function unseal(key, bytes) {
    if (bytes.length <= 12) throw new Error('置いてあるものが壊れているようです。');
    try {
        return new Uint8Array(await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12)));
    } catch (e) {
        throw new Error('置いてあるものを開けませんでした。合言葉が違うかもしれません。');
    }
}

// ------------------------------------------------------------------
// 置き場とのやりとり
// ------------------------------------------------------------------

async function storeCall(what, { method = 'GET', id = '', body = null } = {}) {
    const cfg = getStoreConfig();
    if (!cfg.pass) throw new Error('合言葉が設定されていません。');
    const { auth } = await storeDerive(cfg.pass);
    const url = `${cfg.apiBase || ''}/api/sync?what=${encodeURIComponent(what)}`
        + (id ? `&id=${encodeURIComponent(id)}` : '');
    const res = await fetch(url, {
        method,
        headers: {
            'x-salon-auth': auth,
            ...(body ? { 'Content-Type': 'application/octet-stream' } : {})
        },
        body,
        cache: 'no-store'
    });
    if (res.status === 401) throw new Error('合言葉が違うようです。');
    if (res.status === 404) return null;
    if (!res.ok) {
        let msg = `置き場とやりとりできませんでした（${res.status}）。`;
        try { const j = await res.json(); if (j && j.error) msg = j.error; } catch (e) { /* noop */ }
        throw new Error(msg);
    }
    return res;
}

/** 合言葉が通るか確かめる。つなぐ前の確認に使う */
export async function connectStore(pass) {
    const trimmed = String(pass || '').trim();
    if (trimmed.length < STORE_MIN_PASSPHRASE) {
        throw new Error(`合言葉は${STORE_MIN_PASSPHRASE}文字以上にしてください。`);
    }
    const before = getStoreConfig().pass;
    setStoreConfig({ pass: trimmed });
    try {
        await storeCall('ping');
        return true;
    } catch (e) {
        setStoreConfig({ pass: before });   // 通らなかったら元に戻す
        throw e;
    }
}

export async function storePullSnapshot() {
    const res = await storeCall('data');
    if (!res) return null;
    const { key } = await storeDerive(getStoreConfig().pass);
    const plain = await unseal(key, new Uint8Array(await res.arrayBuffer()));
    return JSON.parse(new TextDecoder().decode(plain));
}

export async function storePushSnapshot(snapshot) {
    const { key } = await storeDerive(getStoreConfig().pass);
    const sealed = await seal(key, utf8(JSON.stringify(snapshot)));
    await storeCall('data', { method: 'PUT', body: sealed });
}

export async function storeListPhotoIds() {
    const res = await storeCall('photos');
    if (!res) return [];
    const json = await res.json();
    return json.ids || [];
}

export async function storePushPhoto(id, blob) {
    const { key } = await storeDerive(getStoreConfig().pass);
    const sealed = await seal(key, new Uint8Array(await blob.arrayBuffer()));
    await storeCall('photo', { method: 'PUT', id, body: sealed });
}

export async function storePullPhoto(id) {
    const res = await storeCall('photo', { id });
    if (!res) return null;
    const { key } = await storeDerive(getStoreConfig().pass);
    const plain = await unseal(key, new Uint8Array(await res.arrayBuffer()));
    return new Blob([plain], { type: 'image/jpeg' });
}
