// セッションの写真をしまう場所。
//
// 顧客データは localStorage に入れているが、写真はそこに入れられない。
// localStorage は全部で5MBほどしかなく、スマホの写真は1枚2〜5MB、
// 文字列にすると1.3倍に膨らむ。1枚入れただけで顧客データごと
// 保存できなくなる。
//
// そこで写真は IndexedDB に置く。こちらは数百MB使える。顧客データ側は
// 写真のIDだけを持ち、実物はこちらから引く。
//
// 保存する前に必ず縮める。並べたボトルを見返すのに元の解像度は要らない。
// 長辺1600px・JPEG品質0.82で、1枚おおよそ200〜400KBになる。

const DB_NAME = 'therapist_photos';
const DB_VERSION = 1;
const STORE = 'photos';

/** 長辺の上限。これ以上大きい写真は縮めてから保存する */
export const MAX_EDGE = 1600;
export const JPEG_QUALITY = 0.82;

/** 写真の種類。撮る目的が違うので、置き場所も分けている */
export const PHOTO_KINDS = [
    { key: 'bottles', icon: '🍶', label: '並べたボトル・カード',
      hint: 'どう並べたかは色名だけでは残りません。' },
    { key: 'drawing', icon: '🖍️', label: '描いたもの・書いたもの',
      hint: 'セッション中に手で描かれたもの。' },
    { key: 'item', icon: '🧴', label: '処方したアイテム',
      hint: 'お渡ししたブレンドやラベルの控え。' }
];

export function getPhotoKind(key) {
    return PHOTO_KINDS.find((k) => k.key === key) || PHOTO_KINDS[0];
}

let dbPromise = null;

/** IndexedDB を開く。使えない環境ではここで失敗する */
function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined' || !indexedDB) {
            reject(new Error('この端末では写真を保存できません。'));
            return;
        }
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('写真の保存先を開けませんでした。'));
    });
    // 一度失敗したら次はやり直せるようにする（初回だけの不調もあるため）
    dbPromise.catch(() => { dbPromise = null; });
    return dbPromise;
}

function tx(mode) {
    return openDb().then((db) => db.transaction(STORE, mode).objectStore(STORE));
}

function asPromise(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/** 使えるかどうか。使えなければ写真の欄そのものを出さない */
export async function isPhotoStoreAvailable() {
    try { await openDb(); return true; } catch (e) { return false; }
}

function newId() {
    const rand = Math.random().toString(36).slice(2, 10);
    return `ph_${Date.now().toString(36)}_${rand}`;
}

/**
 * 画像を縮めて JPEG にする。
 *
 * 元のまま持つと、数枚で端末の空きを食いつぶす。見返すのに必要な
 * 大きさまで落としてから保存する。
 */
/**
 * 画像を読む。向きを正した状態で返す。
 *
 * スマホで撮った写真は、横倒しのまま「回してから見せる」という指示
 * （EXIFの向き）を別に持っていることがある。canvas に描くとその指示が
 * 落ちて、横倒しのまま保存されてしまう。
 *
 * createImageBitmap に from-image を渡すと、向きを反映した絵が返る。
 * 使えない環境では <img> 経由にする。こちらもブラウザが向きを見て
 * くれるが、canvas に写すときの扱いが揃っていないため、あくまで控え。
 */
async function loadOriented(file) {
    if (typeof createImageBitmap === 'function') {
        try {
            return await createImageBitmap(file, { imageOrientation: 'from-image' });
        } catch (e) { /* 対応していなければ下へ */ }
    }
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('画像として読めませんでした。'));
        };
        img.src = url;
    });
}

export async function shrinkImage(file, maxEdge = MAX_EDGE, quality = JPEG_QUALITY) {
    const src = await loadOriented(file);
    const srcW = src.width;
    const srcH = src.height;
    const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    // 透過のある画像をJPEGにすると黒く沈むので、先に白で塗る
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(src, 0, 0, w, h);
    if (src.close) src.close();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('画像を変換できませんでした。');
    return { blob, width: w, height: h };
}

/**
 * 写真を1枚しまう。
 * @returns { id, kind, width, height, bytes, addedAtISO }
 */
export async function savePhoto(file, { kind = 'bottles', caption = '' } = {}) {
    const { blob, width, height } = await shrinkImage(file);
    const meta = {
        id: newId(),
        kind,
        caption,
        width,
        height,
        bytes: blob.size,
        addedAtISO: new Date().toISOString()
    };
    const store = await tx('readwrite');
    await asPromise(store.put({ ...meta, blob }));
    return meta;
}

/** 表示用のURL。使い終わったら releasePhotoUrl で返すこと */
export async function getPhotoUrl(id) {
    const store = await tx('readonly');
    const row = await asPromise(store.get(id));
    if (!row || !row.blob) return null;
    return URL.createObjectURL(row.blob);
}

export function releasePhotoUrl(url) {
    if (url) URL.revokeObjectURL(url);
}

export async function getPhotoMeta(id) {
    const store = await tx('readonly');
    const row = await asPromise(store.get(id));
    if (!row) return null;
    const { blob, ...meta } = row;
    return meta;
}

export async function deletePhoto(id) {
    const store = await tx('readwrite');
    await asPromise(store.delete(id));
}

/** 端末にある写真のIDを全部返す。置き去りの掃除に使う */
export async function listPhotoIds() {
    const store = await tx('readonly');
    return asPromise(store.getAllKeys());
}

/**
 * どの記録からも参照されていない写真を消す。
 *
 * 記録や顧客を消したときに写真だけ残ると、端末の空きを食い続ける。
 * 消し忘れを個別に追うより、生きているIDを渡して差分を掃くほうが確実。
 *
 * @param liveIds いま使われている写真IDの一覧
 */
export async function purgeOrphanPhotos(liveIds) {
    const live = new Set(liveIds || []);
    const all = await listPhotoIds();
    const dead = all.filter((id) => !live.has(id));
    for (const id of dead) await deletePhoto(id);
    return dead.length;
}

/** 使っている容量の目安。増えすぎたときに気づけるように */
export async function getPhotoUsage() {
    const store = await tx('readonly');
    const rows = await asPromise(store.getAll());
    return {
        count: rows.length,
        bytes: rows.reduce((n, r) => n + (r.bytes || (r.blob ? r.blob.size : 0)), 0)
    };
}

/**
 * 写真を全部、文字にして取り出す。書き出し用。
 *
 * 別の端末へ持っていくには、写真も一緒でなければ意味がない。
 * メモの [1] だけ渡っても、肝心の写真が無ければ読めない。
 */
export async function exportAllPhotos() {
    const store = await tx('readonly');
    const rows = await asPromise(store.getAll());
    const out = [];
    for (const row of rows) {
        const { blob, ...meta } = row;
        out.push({ ...meta, dataUrl: await blobToDataUrl(blob) });
    }
    return out;
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(blob);
    });
}

function dataUrlToBlob(dataUrl) {
    const [head, body] = String(dataUrl).split(',');
    const mime = (head.match(/data:([^;]+)/) || [, 'image/jpeg'])[1];
    const bin = atob(body);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return new Blob([buf], { type: mime });
}

/**
 * 書き出した写真を戻す。
 * 同じIDが端末にあれば、そのままにする（読み込みで上書きして壊さない）。
 */
export async function importPhotos(list) {
    let added = 0;
    for (const item of (list || [])) {
        if (!item || !item.id || !item.dataUrl) continue;
        const store = await tx('readwrite');
        const exists = await asPromise(store.get(item.id));
        if (exists) continue;
        const { dataUrl, ...meta } = item;
        const write = await tx('readwrite');
        await asPromise(write.put({ ...meta, blob: dataUrlToBlob(dataUrl) }));
        added += 1;
    }
    return added;
}

/** 実物をそのまま取り出す。同期で送るときに使う */
export async function getPhotoBlob(id) {
    const store = await tx('readonly');
    const row = await asPromise(store.get(id));
    return row && row.blob ? row.blob : null;
}

/**
 * 別の端末から下ろしてきた実物をしまう。
 * すでにあれば触らない。同じIDは同じ写真なので、上書きの必要がない。
 */
export async function putPhotoBlob(id, blob, meta = {}) {
    const store = await tx('readwrite');
    const exists = await asPromise(store.get(id));
    if (exists) return false;
    const write = await tx('readwrite');
    await asPromise(write.put({
        id,
        kind: meta.kind || 'bottles',
        bytes: blob.size,
        addedAtISO: meta.addedAtISO || new Date().toISOString(),
        ...meta,
        blob
    }));
    return true;
}

export function formatBytes(bytes) {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
