import { getAuroraThemeCss } from '../themes/aurora.css.js';
import { createGeminiProvider } from '../adapters/llm-gemini.js';
import { createSessionBridgePersistence } from '../adapters/persist-session-bridge.js';

/**
 * @typedef {object} FloatingChatConfig
 * @property {string} idPrefix
 * @property {string} title
 * @property {string} welcomeMessage
 * @property {{ model: string }} llm
 * @property {{ chatStatePrefix: string, apiKeys: string, legacyApiKey: string|null }} storageKeys
 * @property {{ enabled: boolean, url: string }} bridge
 * @property {{ enabled: boolean, showDocPicker: boolean }} context
 * @property {string} globalApiName
 * @property {string|null} legacyGlobalApiName
 * @property {Record<string, string>} i18n
 * @property {string} settingsHelpHtml
 * @property {(api: object, config: FloatingChatConfig) => void|Promise<void>} [onReady]
 */

/**
 * @param {FloatingChatConfig} config
 */
export function initFloatingChat(config) {
    const p = config.idPrefix;
    const i18n = config.i18n;
    const pageId = window.location.pathname + window.location.search;

    const persistence = createSessionBridgePersistence({
        pageId,
        chatStatePrefix: config.storageKeys.chatStatePrefix,
        bridge: config.bridge,
    });

    const state = {
        activeTab: 'chat',
        context: [],
        messages: [{ text: config.welcomeMessage, sender: 'ai' }],
    };

    const saved = persistence.load();
    if (saved) {
        state.context = saved.context || [];
        state.messages = saved.messages || state.messages;
    }

    const style = document.createElement('style');
    style.textContent = getAuroraThemeCss(p);
    document.head.appendChild(style);

    const { fab, panel, els } = buildShell(config);
    let apiKeys = loadApiKeys(config.storageKeys);

    const generateReply =
        config.generateReply ||
        createGeminiProvider({
            model: config.llm.model,
            getApiKeys: () => apiKeys,
            i18n,
        });

    function saveState() {
        persistence.save({ context: state.context, messages: state.messages });
    }

    function renderContext() {
        if (!els.ctxList) return;
        els.ctxList.innerHTML = '';
        state.context.forEach((c, idx) => {
            const li = document.createElement('li');
            li.style.cssText =
                'display:flex;align-items:center;justify-content:space-between;gap:6px;';
            const nameSpan = document.createElement('span');
            nameSpan.textContent = c.name;
            nameSpan.style.cssText =
                'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.textContent = '×';
            removeBtn.style.cssText =
                'background:none;border:none;color:#94a3b8;cursor:pointer;font-size:1rem;padding:0 4px;';
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                state.context.splice(idx, 1);
                saveState();
                renderContext();
            });
            li.append(nameSpan, removeBtn);
            els.ctxList.appendChild(li);
        });
        if (els.ctxCount) els.ctxCount.textContent = String(state.context.length);
    }

    /**
     * 返事の中のリンクを、押せるものにする。
     *
     * AIは説明書（manual.md）を読んで答えるので、説明書と同じ書き方で
     * 「[2-1. 予約の電話が入った](#2-1-予約の電話が入った)」のような参照を返す。
     * ところが、そのままだと押しても何も起きない。行き先の「#…」は
     * いま開いている画面の中を指していて、そこに見出しは無いため。
     *
     * 説明書の画面へ向け直し、別のタブで開く。読みかけのカルテを
     * 置き去りにしないため（施術中に開くことが多い）。
     */
    function decorateLinks(container) {
        const manualUrl = config.manualUrl || 'manual.html';
        container.querySelectorAll('a[href]').forEach((a) => {
            const href = a.getAttribute('href') || '';

            // AIの書いたものをそのまま埋めているので、危ない行き先は落とす
            if (/^\s*(javascript|data|vbscript):/i.test(href)) {
                a.removeAttribute('href');
                a.removeAttribute('target');
                return;
            }

            // 「#見出し」は説明書の中の場所を指している
            if (href.charAt(0) === '#') {
                a.setAttribute('href', `${manualUrl}${href}`);
            }

            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener noreferrer');
        });
    }

    function renderMessages() {
        els.messages.innerHTML = '';
        state.messages.forEach((m) => {
            const msg = document.createElement('div');
            msg.className = `fc-msg ${m.sender} markdown-content`;

            if (m.sender === 'ai' && typeof window !== 'undefined' && window.marked) {
                msg.innerHTML = window.marked.parse(m.text);
                decorateLinks(msg);
            } else {
                msg.textContent = m.text;
            }

            els.messages.appendChild(msg);
        });
        els.messages.scrollTop = els.messages.scrollHeight;
    }

    function renderApiKeys() {
        // キーを外（アプリの設定画面）で持つときは、ここに出すものが無い
        if (!els.keyList || !els.keyCount) return;
        els.keyList.innerHTML = '';
        apiKeys.forEach((key, idx) => {
            const row = document.createElement('div');
            row.style.cssText =
                'display:flex;align-items:center;gap:6px;background:rgba(0,0,0,0.2);padding:6px 8px;border-radius:6px;';
            const label = document.createElement('span');
            label.style.cssText =
                'flex:1;font-size:0.8rem;color:#cbd5e1;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            label.textContent = `Key ${idx + 1}: ${key.substring(0, 8)}...${key.substring(key.length - 4)}`;
            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.textContent = '×';
            delBtn.addEventListener('click', () => {
                apiKeys.splice(idx, 1);
                saveApiKeys(config.storageKeys, apiKeys);
                renderApiKeys();
            });
            row.append(label, delBtn);
            els.keyList.appendChild(row);
        });
        els.keyCount.textContent = String(apiKeys.length);
    }

    function appendMessage(text, sender) {
        state.messages.push({ text, sender });
        renderMessages();
        saveState();
    }

    fab.addEventListener('click', () => {
        fab.style.display = 'none';
        panel.classList.add('open');
    });

    els.closeBtn.addEventListener('click', () => {
        panel.classList.remove('open');
        setTimeout(() => {
            fab.style.display = 'flex';
        }, 300);
    });

    els.bindResizers = bindResizers(panel, els);

    els.tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            els.tabs.forEach((t) => t.classList.remove('active'));
            tab.classList.add('active');
            state.activeTab = tab.dataset.target;
            els.views.forEach((v) => {
                v.classList.remove('active');
                if (v.id === `${p}-view-${state.activeTab}`) v.classList.add('active');
            });
        });
    });

    if (els.addKeyBtn) els.addKeyBtn.addEventListener('click', () => {
        const val = els.apiKeyInput.value.trim();
        if (val && !apiKeys.includes(val)) {
            apiKeys.push(val);
            saveApiKeys(config.storageKeys, apiKeys);
            renderApiKeys();
            els.apiKeyInput.value = '';
        }
    });

    if (els.saveSettingsBtn) els.saveSettingsBtn.addEventListener('click', () => {
        const val = els.apiKeyInput.value.trim();
        if (val && !apiKeys.includes(val)) {
            apiKeys.push(val);
            els.apiKeyInput.value = '';
            renderApiKeys();
        }
        saveApiKeys(config.storageKeys, apiKeys);
        els.saveSettingsBtn.textContent = i18n.savedSettings;
        setTimeout(() => {
            els.saveSettingsBtn.textContent = i18n.saveSettings;
        }, 2000);
    });

    els.input.addEventListener('input', () => {
        els.input.style.height = 'auto';
        els.input.style.height = `${els.input.scrollHeight}px`;
    });

    els.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const text = els.input.value.trim();
            if (!text) return;
            appendMessage(text, 'user');
            els.input.value = '';
            els.input.style.height = 'auto';
            state.messages.push({ text: i18n.thinking, sender: 'ai' });
            renderMessages();
            generateReply({ userText: text, contextItems: state.context }).then(({ text: reply }) => {
                state.messages[state.messages.length - 1].text = reply;
                renderMessages();
                saveState();
            });
        }
    });

    renderContext();
    renderMessages();
    renderApiKeys();

    const api = {
        addDocumentToContext(docName, url, content) {
            const existing = state.context.find((c) => c.url === url);
            if (!existing) {
                const item = { name: docName, url };
                if (content) item.content = content;
                state.context.push(item);
            } else {
                if (content) existing.content = content;
                if (docName && docName.length > existing.name.length) existing.name = docName;
            }
            saveState();
            renderContext();
        },
        insertIntoPrompt(text) {
            const currentVal = els.input.value;
            const prefix = currentVal && !currentVal.endsWith('\n') ? '\n' : '';
            els.input.value = `${currentVal}${prefix}> ${text}\n\n`;
            els.input.focus();
            if (!panel.classList.contains('open')) {
                fab.style.display = 'none';
                panel.classList.add('open');
            }
        },
        open() {
            fab.style.display = 'none';
            panel.classList.add('open');
        },
        close() {
            panel.classList.remove('open');
            setTimeout(() => {
                fab.style.display = 'flex';
            }, 300);
        },
        getState() {
            return { context: [...state.context], messages: [...state.messages] };
        },
        /**
         * ヘッダーに「いま使っているAI」を出す。
         * 何を出すかはアプリ側が決める。この部品は繋ぎ先を知らない。
         */
        setRoute(text, tone, title) {
            if (!els.route) return;
            els.route.textContent = text;
            els.route.dataset.tone = tone || 'off';
            if (title) els.route.title = title;
        },
    };

    window[config.globalApiName] = api;
    if (config.legacyGlobalApiName) {
        window[config.legacyGlobalApiName] = api;
    }

    if (typeof config.onReady === 'function') {
        Promise.resolve(config.onReady(api, config)).catch(console.error);
    }

    return api;
}

function buildShell(config) {
    const p = config.idPrefix;
    const i18n = config.i18n;

    const fab = document.createElement('div');
    fab.id = `${p}-fab`;
    fab.innerHTML =
        '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>';

    const panel = document.createElement('div');
    panel.id = `${p}-panel`;

    const pickerBlock =
        config.context.enabled && config.context.showDocPicker
            ? `<div style="position:relative;">
          <button type="button" id="${p}-add-content-btn" style="background:rgba(115,103,240,0.4);border:1px solid rgba(115,103,240,0.8);color:#fff;border-radius:4px;font-size:0.7rem;padding:2px 8px;cursor:pointer;">${i18n.addPage}</button>
          <div id="${p}-doc-picker"></div>
        </div>`
            : '';

    const knowledgeBlock = config.context.enabled
        ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:0.8rem;color:#94a3b8;font-weight:500;">${i18n.knowledgeLabel} (<span id="${p}-ctx-count">0</span>)</span>
        ${pickerBlock}
      </div>
      <details class="fc-context-box"><summary>${i18n.knowledgeSummary}</summary>
      <ul class="fc-context-list" id="${p}-ctx-list"></ul></details>`
        : '';

    const html = `
    <div class="fc-resizer fc-resizer-t" id="${p}-resizer-t"></div>
    <div class="fc-resizer fc-resizer-l" id="${p}-resizer-l"></div>
    <div class="fc-resizer fc-resizer-tl" id="${p}-resizer-tl"></div>
    <header class="fc-header">
      <div class="fc-header-title">${config.title}
        <span class="fc-route" id="${p}-route" data-tone="off">…</span>
      </div>
      <div class="fc-controls"><button type="button" id="${p}-close-btn">×</button></div>
    </header>
    <nav class="fc-tabs">
      <button type="button" class="fc-tab active" data-target="chat">${i18n.tabChat}</button>
      <button type="button" class="fc-tab" data-target="settings">${i18n.tabSettings}</button>
    </nav>
    <div class="fc-content">
      <div class="fc-view active" id="${p}-view-chat">
        <div class="fc-messages" id="${p}-messages"></div>
        ${knowledgeBlock}
        <div style="display:flex;flex-direction:column;gap:4px;">
          <textarea class="fc-textarea" id="${p}-input" rows="1" placeholder="${i18n.inputPlaceholder}"></textarea>
          <span style="font-size:0.65rem;color:#64748b;text-align:right;padding-right:4px;">${i18n.shiftEnterHint}</span>
        </div>
      </div>
      <div class="fc-view" id="${p}-view-settings">
        <div style="font-size:0.85rem;color:#94a3b8;line-height:1.6;margin-bottom:12px;">${config.settingsHelpHtml}</div>
        ${config.externalKeysHtml ? `<div class="fc-settings-group">${config.externalKeysHtml}</div>` : `
        <div class="fc-settings-group">
          <label>${i18n.apiKeysLabel} (<span id="${p}-key-count">0</span>)</label>
          <div id="${p}-key-list" style="display:flex;flex-direction:column;gap:4px;margin-bottom:6px;"></div>
          <div style="display:flex;gap:6px;margin-bottom:8px;">
            <input type="password" id="${p}-api-key" placeholder="${i18n.apiKeyPlaceholder}" style="flex:1;">
            <button type="button" id="${p}-add-key-btn" style="background:linear-gradient(90deg,#00f2fe,#7367f0);border:none;border-radius:6px;padding:6px 12px;color:#fff;font-weight:600;cursor:pointer;font-size:0.8rem;">${i18n.addKey}</button>
          </div>
          <button type="button" id="${p}-save-settings-btn" style="width:100%;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:10px;color:#fff;font-weight:600;cursor:pointer;">${i18n.saveSettings}</button>
          <span style="font-size:0.7rem;color:#64748b;margin-top:6px;display:block;">${i18n.keysStorageNote}</span>
        </div>`}
      </div>
    </div>`;

    panel.innerHTML = html;

    document.body.append(fab, panel);

    return {
        fab,
        panel,
        els: {
            closeBtn: document.getElementById(`${p}-close-btn`),
            tabs: panel.querySelectorAll('.fc-tab'),
            views: panel.querySelectorAll('.fc-view'),
            input: document.getElementById(`${p}-input`),
            messages: document.getElementById(`${p}-messages`),
            ctxList: document.getElementById(`${p}-ctx-list`),
            ctxCount: document.getElementById(`${p}-ctx-count`),
            apiKeyInput: document.getElementById(`${p}-api-key`),
            route: document.getElementById(`${p}-route`),
            addKeyBtn: document.getElementById(`${p}-add-key-btn`),
            saveSettingsBtn: document.getElementById(`${p}-save-settings-btn`),
            keyList: document.getElementById(`${p}-key-list`),
            keyCount: document.getElementById(`${p}-key-count`),
            addContentBtn: document.getElementById(`${p}-add-content-btn`),
            docPicker: document.getElementById(`${p}-doc-picker`),
            resizerT: document.getElementById(`${p}-resizer-t`),
            resizerL: document.getElementById(`${p}-resizer-l`),
            resizerTl: document.getElementById(`${p}-resizer-tl`),
        },
    };
}

function bindResizers(panel, els) {
    let startY = 0;
    let startX = 0;
    let startHeight = 0;
    let startWidth = 0;
    let currentResizer = null;

    function initResize(e, type) {
        e.preventDefault();
        currentResizer = type;
        startY = e.clientY;
        startX = e.clientX;
        const rect = window.getComputedStyle(panel);
        startHeight = parseInt(rect.height, 10);
        startWidth = parseInt(rect.width, 10);
        document.addEventListener('mousemove', handleResize);
        document.addEventListener('mouseup', stopResize);
        document.body.style.userSelect = 'none';
    }

    function handleResize(e) {
        if (!currentResizer) return;
        if (currentResizer === 't' || currentResizer === 'tl') {
            panel.style.height = `${startHeight + (startY - e.clientY)}px`;
        }
        if (currentResizer === 'l' || currentResizer === 'tl') {
            panel.style.width = `${startWidth + (startX - e.clientX)}px`;
        }
    }

    function stopResize() {
        currentResizer = null;
        document.removeEventListener('mousemove', handleResize);
        document.removeEventListener('mouseup', stopResize);
        document.body.style.userSelect = '';
    }

    if (els.resizerT) els.resizerT.addEventListener('mousedown', (e) => initResize(e, 't'));
    if (els.resizerL) els.resizerL.addEventListener('mousedown', (e) => initResize(e, 'l'));
    if (els.resizerTl) els.resizerTl.addEventListener('mousedown', (e) => initResize(e, 'tl'));
}

function loadApiKeys(storageKeys) {
    let apiKeys = [];
    try {
        const stored = localStorage.getItem(storageKeys.apiKeys);
        if (stored) apiKeys = JSON.parse(stored);
        if (apiKeys.length === 0 && storageKeys.legacyApiKey) {
            const oldKey = localStorage.getItem(storageKeys.legacyApiKey);
            if (oldKey) {
                apiKeys.push(oldKey);
                localStorage.removeItem(storageKeys.legacyApiKey);
            }
        }
    } catch (e) {
        /* ignore */
    }
    return apiKeys;
}

function saveApiKeys(storageKeys, apiKeys) {
    localStorage.setItem(storageKeys.apiKeys, JSON.stringify(apiKeys));
}
