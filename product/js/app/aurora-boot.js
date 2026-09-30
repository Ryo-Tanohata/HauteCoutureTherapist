// もとは index.html の中に直に書いてあった2行。
//
// 外に出したのは、ページの中に書かれた script を丸ごと禁止するため。
// 禁止しておくと、万一どこかから他人の書いたものが紛れ込んでも、
// ブラウザがその場で止める（_headers の Content-Security-Policy）。
import { initAuroraChat } from '../vendor/floating-chat/integrations/entry-aurora.js';
import {
    isChatEnabled, registerChatStarter, startChatOnce, applyChatVisibility
} from './chat-visibility.js';

// 「⚙️ 設定 →🤖 AI の設定」で出す設定にしている時だけ組み立てる（ISSUE-071）。
// 出さない設定なら、繋ぎ先を調べに行くところまで含めて何も動かさない。
registerChatStarter(() => initAuroraChat());
applyChatVisibility();
if (isChatEnabled()) startChatOnce();
