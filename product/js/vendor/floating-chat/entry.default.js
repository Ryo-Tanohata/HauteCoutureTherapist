import { mergeConfig } from './config.defaults.js';
import { initFloatingChat } from './core/FloatingChat.js';

/**
 * Minimal floating chat (no Aurora portal integrations).
 * @param {import('./config.defaults.js').FloatingChatConfig} [overrides]
 */
export function initDefaultFloatingChat(overrides = {}) {
    return initFloatingChat(mergeConfig(overrides));
}
