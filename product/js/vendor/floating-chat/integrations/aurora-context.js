/**
 * Aurora Portal: auto-context from viewer + dynamic doc picker.
 * @param {object} api
 * @param {object} config
 */
export function setupAuroraContext(api, config) {
    const p = config.idPrefix;
    const i18n = config.i18n;

    const addContentBtn = document.getElementById(`${p}-add-content-btn`);
    const docPicker = document.getElementById(`${p}-doc-picker`);
    if (!addContentBtn || !docPicker) return;

    let docListLoaded = false;

    // 取扱説明書を、はじめから読ませておく。
    // 聞かれてから探させるのではなく、最初から手元に持たせる形。
    setTimeout(() => addManual(api), 300);
    setTimeout(() => autoAddCurrentPage(api), 500);

    addContentBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        docPicker.classList.toggle('open');
        if (!docListLoaded) {
            loadDocPicker(api, docPicker, i18n, () => {
                docListLoaded = true;
            });
        }
    });

    document.addEventListener('click', (e) => {
        if (!addContentBtn.contains(e.target) && !docPicker.contains(e.target)) {
            docPicker.classList.remove('open');
        }
    });
}

function extractMdTitle(mdText) {
    const match = mdText.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : null;
}

/**
 * 取扱説明書（docs/manual.md）を、開いた時点で読み込んでおく。
 *
 * 画面に出しているものと**同じ1つのファイル**を読む。二重に書くと、
 * 片方だけ古くなって、画面と答えが食い違う。
 */
async function addManual(api) {
    try {
        const res = await fetch('docs/manual.md', { cache: 'no-cache' });
        if (!res.ok) return;
        const md = await res.text();
        api.addDocumentToContext('取扱説明書', 'manual.html', md);
    } catch (e) {
        // 読めなくても、聞けること自体は残す
        console.warn('[aurora] 取扱説明書を読み込めませんでした', e);
    }
}

async function autoAddCurrentPage(api) {
    const urlParams = new URLSearchParams(window.location.search);
    let docName = document.title;
    const fileParam = urlParams.get('doc');
    const currentUrl = window.location.href;

    if (fileParam) {
        docName = fileParam.split('/').pop();
        try {
            const res = await fetch(fileParam);
            if (res.ok) {
                const mdContent = await res.text();
                const mdTitle = extractMdTitle(mdContent);
                if (mdTitle) docName = mdTitle;
                api.addDocumentToContext(docName, currentUrl, mdContent);
                return;
            }
        } catch (e) {
            /* fall through */
        }
    }
    api.addDocumentToContext(docName, currentUrl);
}

function loadDocPicker(api, docPicker, i18n, onLoaded) {
    docPicker.innerHTML = `<div class="fc-doc-item">${i18n.docPickerLoading}</div>`;

    // Always fetch index.html using server-absolute path
    const fetchPath = '/management/99_Portal/index.html';

    fetch(fetchPath)
        .then((res) => res.text())
        .then((html) => {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const links = Array.from(doc.querySelectorAll('a[href^="viewer.html?doc="]'));
            docPicker.innerHTML = '';
            if (links.length === 0) {
                docPicker.innerHTML = `<div class="fc-doc-item">${i18n.docPickerEmpty}</div>`;
                onLoaded();
                return;
            }

            const mainDocs = links.filter((a) => !a.getAttribute('href').includes('incidents') && !a.getAttribute('href').includes('Incidents'));
            const incidents = links.filter((a) => a.getAttribute('href').includes('incidents') || a.getAttribute('href').includes('Incidents'));

            if (mainDocs.length > 0) {
                docPicker.appendChild(sectionHeader(i18n.documentsHeader, '#00f2fe'));
            }
            mainDocs.forEach((a) => buildPickerItem(a, api, docPicker));
            if (incidents.length > 0) {
                docPicker.appendChild(
                    sectionHeader(`${i18n.issuesHeader} (${incidents.length})`, '#ff4b2b', true)
                );
            }
            incidents.forEach((a) => buildPickerItem(a, api, docPicker));
            onLoaded();
        })
        .catch(() => {
            docPicker.innerHTML = `<div class="fc-doc-item">${i18n.docPickerError}</div>`;
            onLoaded();
        });
}

function sectionHeader(text, color, withBorder = false) {
    const header = document.createElement('div');
    header.style.cssText = `font-size:0.7rem;color:${color};font-weight:600;padding:4px 8px;letter-spacing:1px;${
        withBorder ? 'margin-top:6px;border-top:1px solid rgba(255,255,255,0.05);' : ''
    }`;
    header.textContent = text;
    return header;
}

function buildPickerItem(anchor, api, docPicker) {
    const href = anchor.getAttribute('href');
    const fileMatch = href.match(/doc=([^&]+)/);
    if (!fileMatch) return;

    let humanTitle = null;
    const titleEl = anchor.querySelector('div[style*="font-size: 1.2rem"], div[style*="font-size: 1rem"], div[style*="font-size: 1.5rem"]');
    if (titleEl) {
        humanTitle = titleEl.textContent.trim();
    } else {
        const spanEl = anchor.querySelector('span[style*="margin-left"]');
        if (spanEl) {
            const codeEl = anchor.querySelector('span[style*="color:#ffb86c"]');
            humanTitle = (codeEl ? codeEl.textContent.trim() + ': ' : '') + spanEl.textContent.trim();
        }
    }
    const fileName = fileMatch[1].split('/').pop();
    const displayName = humanTitle || fileName;

    // Resolve fileMatch[1] relative to the portal directory
    let resolvedFetchPath = fileMatch[1];
    if (resolvedFetchPath.startsWith('..')) {
        resolvedFetchPath = '/management/' + resolvedFetchPath.substring(3);
    } else if (!resolvedFetchPath.startsWith('/')) {
        resolvedFetchPath = '/management/99_Portal/' + resolvedFetchPath;
    }

    // Resolve contextUrl (the view URL) as server-absolute
    const contextUrl = '/management/99_Portal/' + href;

    const item = document.createElement('div');
    item.className = 'fc-doc-item';
    item.textContent = displayName;
    item.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
            const mdRes = await fetch(resolvedFetchPath);
            if (mdRes.ok) {
                const mdContent = await mdRes.text();
                const mdTitle = extractMdTitle(mdContent);
                const finalName = mdTitle || displayName;
                const state = api.getState();
                if (!state.context.find((c) => c.url === contextUrl)) {
                    api.addDocumentToContext(finalName, contextUrl, mdContent);
                }
            }
        } catch (err) {
            api.addDocumentToContext(displayName, contextUrl);
        }
        docPicker.classList.remove('open');
    });
    docPicker.appendChild(item);
}
