// 「下ごしらえ」（AIの提案）を、使うか使わないか（ISSUE-083）。
//
// サロンからのご要望で、いまは使わないため既定を「使わない」にしている。
// **消したのではなく、止めているだけ**。設定から戻せば、元どおり動く。
//
// 💬チャット（ISSUE-071）と同じ考え方。使わない間は、ボタンを隠すだけでなく
// **繋ぎ先を調べに行くところまで止める**。隠すだけだと、裏でキーを読んだり
// ネットワークへ出たりが続くため。
//
// 止まるのは3か所。
//   ・カルテの記入画面の「下ごしらえを作る／訴えを反映して作り直す」（作る入口はここだけ）
//   ・📅の予約カードに出る「✓ 下ごしらえ済み」の印
//   ・⚙️設定の「AI提案のAPIキー」と繋ぎ先の表示（ただし下の isAiKeyNeeded を見ること）
//
// **すでに書かれた記録は消えない。** 過去に下ごしらえから入った処方やメモは
// 記録の中にそのまま残っており、使う設定に戻せばまた画面に出る。
// 名前は分けておく。アーチファクト用に1本へ束ねると、
// chat-visibility.js の KEY と同じ入れ物に並ぶため
const PREP_KEY = 'therapist_prep_enabled';

/** 既定は「使わない」。入れていない端末でも、勝手には出てこない */
export function isPrepEnabled() {
    return localStorage.getItem(PREP_KEY) === 'on';
}

/**
 * APIキーの欄を出すかどうか。
 *
 * **キーを使うのは下ごしらえだけではない。** 💬チャットも同じキーを読む
 * （`js/vendor/floating-chat/integrations/entry-aurora.js`）。
 * 下ごしらえだけを見て畳むと、チャットを使う人がキーを入れられなくなる。
 */
export function isAiKeyNeeded(chatEnabled) {
    return isPrepEnabled() || Boolean(chatEnabled);
}

/** いまの設定を画面に効かせる */
export function applyPrepVisibility() {
    document.body.classList.toggle('prep-hidden', !isPrepEnabled());
}

/** 設定を切り替える */
export function setPrepEnabled(on) {
    localStorage.setItem(PREP_KEY, on ? 'on' : 'off');
    applyPrepVisibility();
}
