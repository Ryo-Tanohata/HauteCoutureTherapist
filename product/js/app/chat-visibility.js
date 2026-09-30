// 右下の💬（操作ガイドのチャット）を、出すか出さないか（ISSUE-071）。
//
// サロンからのご要望で、いまは使わないため既定を「出さない」にしている。
// **消したのではなく、止めているだけ**。設定から戻せば、元どおり動く。
//
// 「出さない」を選んでいる間は、チャットの部品を**そもそも組み立てない**。
// 隠すだけだと、裏で繋ぎ先を調べに行ったりキーを読んだりが続くため。
const KEY = 'therapist_chat_enabled';

// 起動の仕掛け。読み込みの順番が変わっても困らないよう、
// 呼ぶ側（aurora-boot）から預けてもらう形にする。
let starter = null;
let started = false;

/** 既定は「出さない」。入れていない端末でも、勝手には出てこない */
export function isChatEnabled() {
    return localStorage.getItem(KEY) === 'on';
}

/** aurora-boot が、自分の起動のしかたを預ける */
export function registerChatStarter(fn) {
    starter = fn;
}

/** 起動済みなら二度は組み立てない */
export function startChatOnce() {
    if (started || typeof starter !== 'function') return;
    started = true;
    starter();
}

/** いまの設定を画面に効かせる */
export function applyChatVisibility() {
    document.body.classList.toggle('chat-hidden', !isChatEnabled());
}

/**
 * 設定を切り替える。
 * 「出す」に戻したときは、その場で組み立てる。読み込み直しをお願いしない。
 */
export function setChatEnabled(on) {
    localStorage.setItem(KEY, on ? 'on' : 'off');
    if (on) startChatOnce();
    applyChatVisibility();
}
