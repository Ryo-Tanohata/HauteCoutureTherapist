/** @param {string} prefix Element id prefix (e.g. "fc") */
export function getAuroraThemeCss(prefix) {
    return `
        #${prefix}-fab {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: linear-gradient(135deg, #00f2fe, #7367f0);
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4), 0 0 20px rgba(0, 242, 254, 0.4);
            cursor: pointer;
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        #${prefix}-fab:hover { transform: scale(1.1); }
        #${prefix}-fab svg { width: 30px; height: 30px; fill: #fff; }

        #${prefix}-panel {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 380px;
            height: 500px;
            max-width: 50vw;
            max-height: calc(100vh - 40px);
            min-width: 300px;
            min-height: 400px;
            background: rgba(15, 23, 42, 0.85);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
            display: none;
            flex-direction: column;
            color: #f1f5f9;
            font-family: 'Inter', 'Noto Sans JP', sans-serif;
            z-index: 9999;
            opacity: 0;
            transform: translateY(20px) scale(0.95);
            transform-origin: bottom right;
            transition: opacity 0.3s ease, transform 0.3s ease;
        }
        #${prefix}-panel.open {
            display: flex;
            opacity: 1;
            transform: translateY(0) scale(1);
        }

        .fc-resizer { position: absolute; z-index: 10; }
        .fc-resizer-t { top: -5px; left: 0; right: 0; height: 10px; cursor: n-resize; }
        .fc-resizer-l { top: 0; left: -5px; bottom: 0; width: 10px; cursor: w-resize; }
        .fc-resizer-tl { top: -5px; left: -5px; width: 15px; height: 15px; cursor: nw-resize; z-index: 11; }

        .fc-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            background: linear-gradient(90deg, rgba(0, 242, 254, 0.2), rgba(115, 103, 240, 0.2));
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            border-top-left-radius: 16px;
            border-top-right-radius: 16px;
        }
        .fc-header-title {
            font-weight: 600;
            font-size: 1rem;
            display: flex;
            align-items: center;
            gap: 8px;
            /* 札（使っているAI）が入りきらない時は、次の行へ回して全部見せる。
               1行に押し込むと、モデル名の後ろが「claude-haiku-…」と切れる。 */
            flex-wrap: wrap;
            flex: 1 1 auto;
            min-width: 0;
        }

    /* ヘッダーの「いま使っているAI」。同じ画面でも繋ぎ先が変わるので常に出す */
    #${prefix}-panel .fc-route {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        margin-left: 8px;
        padding: 1px 8px;
        border-radius: 999px;
        font-size: 0.63rem;
        font-weight: 600;
        color: #94a3b8;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.12);
        vertical-align: middle;
        /* 幅は中身なりに。親が折り返すので、狭い時は札ごと次の行へ落ちる。
           それでも入らない極端な幅の時だけ、最後の手段として省略する。 */
        max-width: 100%;
        margin-left: 0;
        flex: 0 1 auto;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    #${prefix}-panel .fc-route::before {
        content: '';
        width: 6px; height: 6px; border-radius: 50%;
        flex-shrink: 0; background: #94a3b8;
    }
    #${prefix}-panel .fc-route[data-tone="good"] { color: #34d399; border-color: rgba(52,211,153,0.35); }
    #${prefix}-panel .fc-route[data-tone="good"]::before { background: #34d399; }
    #${prefix}-panel .fc-route[data-tone="ok"]::before { background: #00f2fe; }
    #${prefix}-panel .fc-route[data-tone="off"] { color: #f87171; }
    #${prefix}-panel .fc-route[data-tone="off"]::before { background: #f87171; }

        .fc-header-title::before {
            content: '';
            display: block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #00f2fe;
            box-shadow: 0 0 8px #00f2fe;
        }
        .fc-controls button {
            background: none;
            border: none;
            color: #cbd5e1;
            cursor: pointer;
            font-size: 1.2rem;
            padding: 4px;
            line-height: 1;
        }
        .fc-controls button:hover { color: #fff; }

        .fc-tabs { display: flex; border-bottom: 1px solid rgba(255, 255, 255, 0.1); }
        .fc-tab {
            flex: 1;
            text-align: center;
            padding: 8px 0;
            cursor: pointer;
            font-size: 0.85rem;
            font-weight: 500;
            color: #94a3b8;
            transition: all 0.2s;
            background: transparent;
            border: none;
            border-bottom: 2px solid transparent;
            outline: none;
        }
        .fc-tab.active { color: #00f2fe; border-bottom: 2px solid #00f2fe; background: rgba(0, 242, 254, 0.05); }

        .fc-content {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        .fc-view { display: none; flex-direction: column; height: 100%; }
        .fc-view.active { display: flex; }

        .fc-messages {
            flex: 1;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-bottom: 12px;
        }
        .fc-msg {
            max-width: 85%;
            padding: 10px 14px;
            border-radius: 12px;
            font-size: 0.9rem;
            line-height: 1.4;
            word-wrap: break-word;
        }
        .fc-msg.user {
            align-self: flex-end;
            background: rgba(115, 103, 240, 0.3);
            border-bottom-right-radius: 4px;
        }
        .fc-msg.ai {
            align-self: flex-start;
            background: rgba(255, 255, 255, 0.1);
            border-bottom-left-radius: 4px;
        }

        .markdown-content strong { font-weight: 700; color: #fff; }
        .markdown-content em { font-style: italic; }
        .markdown-content code { background: rgba(0,0,0,0.3); padding: 2px 4px; border-radius: 4px; font-family: monospace; font-size: 0.85em; color: #00f2fe; }
        .markdown-content pre { background: rgba(0,0,0,0.4); padding: 8px; border-radius: 6px; overflow-x: auto; font-size: 0.8em; margin: 8px 0; }
        .markdown-content pre code { background: none; padding: 0; color: #e2e8f0; }
        .markdown-content p { margin: 0 0 8px 0; }
        .markdown-content p:last-child { margin-bottom: 0; }
        .markdown-content ul, .markdown-content ol { margin: 4px 0 8px 0; padding-left: 20px; }

        .fc-context-box {
            font-size: 0.8rem;
            background: rgba(0, 0, 0, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 8px;
            padding: 8px;
            margin-bottom: 8px;
        }
        .fc-context-box summary {
            cursor: pointer;
            color: #94a3b8;
            font-weight: 500;
            outline: none;
        }
        .fc-context-list {
            margin: 8px 0 0 0;
            padding-left: 16px;
            color: #cbd5e1;
            list-style: disc;
        }

        .fc-textarea {
            width: 100%;
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            padding: 10px;
            color: #fff;
            font-family: inherit;
            font-size: 0.9rem;
            line-height: 1.5;
            resize: none;
            min-height: 40px;
            max-height: 180px;
            box-sizing: border-box;
            outline: none;
        }
        .fc-textarea:focus { border-color: #00f2fe; }

        .fc-settings-group { display: flex; flex-direction: column; gap: 8px; }
        .fc-settings-group label { font-size: 0.85rem; color: #94a3b8; }
        .fc-settings-group input {
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            padding: 8px 10px;
            color: #fff;
            outline: none;
        }
        .fc-settings-group input:focus { border-color: #7367f0; }

        #${prefix}-doc-picker {
            position: absolute;
            bottom: 30px;
            right: 0;
            width: 250px;
            background: rgba(15, 23, 42, 0.95);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
            display: none;
            flex-direction: column;
            z-index: 10001;
            padding: 8px;
            max-height: 200px;
            overflow-y: auto;
        }
        #${prefix}-doc-picker.open { display: flex; }
        .fc-doc-item {
            padding: 8px;
            font-size: 0.8rem;
            color: #cbd5e1;
            cursor: pointer;
            border-radius: 4px;
            margin-bottom: 2px;
        }
        .fc-doc-item:hover {
            background: rgba(115, 103, 240, 0.3);
            color: #fff;
        }
    `;
}
