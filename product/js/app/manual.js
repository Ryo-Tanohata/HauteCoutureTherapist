// 取扱説明書の画面。
//
// 中身は docs/manual.md ひとつだけ。この画面も、右下の吹き出し（操作ガイド）も、
// 同じものを読む。二重に書くと、片方だけ古くなって食い違うため。
//
// ページの中に script を書かない（_headers の CSP で止まる）。だから
// この形で外に置いてある。

const SOURCE = 'docs/manual.md';
const VIDEO_INDEX = 'docs/videos/videos.json';

const bodyEl = document.getElementById('manual-body');
const tocEl = document.getElementById('manual-toc');
const searchEl = document.getElementById('manual-search');

/** 見出しから、行き先の名前を作る。日本語のままだと url に載らないので通し番号で */
const slugOf = (i) => `s${i}`;

/**
 * 見出しの字から、GitHub と同じ書き方の行き先名を作る。
 *
 * 説明書（manual.md）の目次は「[2-1. 予約の電話が入った](#2-1-予約の電話が入った)」
 * と書かれている。この形の受け皿が無いと、目次を押しても何も起きない。
 * 操作ガイド（AI）も説明書を読んで答えるので、同じ形で参照を返してくる。
 *
 * 例: 「2-1. 予約の電話が入った」→「2-1-予約の電話が入った」
 */
function headingSlug(text) {
    return String(text || '')
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, '')   // 記号（「.」など）を落とす
        .replace(/\s+/g, '-');               // 空白は「-」に
}

/** 「2-1. 予約の…」の頭の番号だけを取り出す。無ければ null */
function headingNumber(text) {
    const m = String(text || '').trim().match(/^(\d+(?:-\d+)*)[.\s]/);
    return m ? m[1] : null;
}

/**
 * 「#…」で指された行き先の見出しを探す。
 *
 * 書かれ方が3通りある（通し番号・見出しの字・頭の番号）ので、順に当たる。
 * どれで来ても同じ場所に着くようにしておく。
 */
function resolveTarget(hash) {
    const raw = String(hash || '').replace(/^#/, '');
    if (!raw) return null;

    let key = raw;
    try { key = decodeURIComponent(raw); } catch (e) { /* 壊れていればそのまま */ }

    const byId = document.getElementById(raw) || document.getElementById(key);
    if (byId) return byId;

    const heads = Array.from(bodyEl.querySelectorAll('h1, h2, h3'));
    const wanted = key.toLowerCase();

    const bySlug = heads.find((h) => headingSlug(h.textContent) === wanted);
    if (bySlug) return bySlug;

    // 「#2-1」のように番号だけで指されることもある
    const bare = wanted.replace(/^sec-/, '');
    return heads.find((h) => headingNumber(h.textContent) === bare) || null;
}

/**
 * 見出しごとに section で包む。
 *
 * 探すときに「その見出しのまとまり」ごと隠したいので、
 * 平らに並んだ h2 と本文を、まとまりに組み直す。
 */
function groupIntoSections(container) {
    const sections = [];
    let current = null;
    Array.from(container.childNodes).forEach((node) => {
        const isHead = node.nodeType === 1 && (node.tagName === 'H2' || node.tagName === 'H1');
        if (isHead) {
            current = document.createElement('section');
            sections.push(current);
        }
        if (!current) {
            current = document.createElement('section');
            sections.push(current);
        }
        current.appendChild(node);
    });
    container.innerHTML = '';
    sections.forEach((s) => container.appendChild(s));
    return sections;
}

function buildToc() {
    const heads = bodyEl.querySelectorAll('h2, h3');
    tocEl.innerHTML = '';
    heads.forEach((h, i) => {
        h.id = h.id || slugOf(i);
        const a = document.createElement('a');
        a.href = `#${h.id}`;
        a.textContent = h.textContent.replace(/^[\d.\s-]+/, '');
        if (h.tagName === 'H3') a.className = 'lv3';
        tocEl.appendChild(a);
    });
    return heads;
}

/** いま読んでいるところを、目次の側でも示す */
function followScroll(heads) {
    const links = Array.from(tocEl.querySelectorAll('a'));
    if (!('IntersectionObserver' in window)) return;
    const seen = new Map();
    const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => seen.set(e.target.id, e.isIntersecting));
        const activeId = Array.from(heads).map((h) => h.id).find((id) => seen.get(id));
        links.forEach((a) => a.classList.toggle('here', a.getAttribute('href') === `#${activeId}`));
    }, { rootMargin: '-70px 0px -75% 0px' });
    heads.forEach((h) => io.observe(h));
}

/** 目次から飛んだあと、見出しが上のバーに隠れないように */
function fixAnchorOffset() {
    tocEl.addEventListener('click', (e) => {
        const a = e.target.closest('a');
        if (!a) return;
        const target = document.getElementById(a.getAttribute('href').slice(1));
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', a.getAttribute('href'));
    });
}

function initSearch(sections) {
    if (!searchEl) return;
    const noHit = document.createElement('p');
    noHit.className = 'no-hit';
    noHit.textContent = 'その言葉は見つかりませんでした。別の言い方で探してみてください。';
    bodyEl.appendChild(noHit);

    const apply = () => {
        const q = searchEl.value.trim().toLowerCase();
        if (!q) {
            sections.forEach((s) => s.classList.remove('hidden'));
            noHit.style.display = 'none';
            tocEl.style.display = '';
            return;
        }
        let hit = 0;
        sections.forEach((s) => {
            const match = s.textContent.toLowerCase().indexOf(q) !== -1;
            s.classList.toggle('hidden', !match);
            if (match) hit += 1;
        });
        noHit.style.display = hit ? 'none' : 'block';
        // 絞っている間は、目次より本文を広く見せる
        tocEl.style.display = 'none';
    };
    searchEl.addEventListener('input', apply);
}

/** 横に長い表は、そこだけ横に動かせるようにする（画面ごと横に伸びないように） */
function wrapTables() {
    bodyEl.querySelectorAll('table').forEach((t) => {
        const wrap = document.createElement('div');
        wrap.className = 'table-wrap';
        t.parentNode.insertBefore(wrap, t);
        wrap.appendChild(t);
    });
}

/**
 * 見出しに、その場面の動画を添える。
 *
 * 動画の一覧は別ファイル（videos.json）に置いてある。説明書そのもの
 * （manual.md）には書かない。操作ガイド（AI）へ渡すのは字だけでよく、
 * 動画の置き場所まで読ませても答えの役に立たないため。
 *
 * 「2-1. 予約の電話が入った」のような見出しの、頭の番号で結びつける。
 */
async function attachVideos() {
    let list = [];
    try {
        const res = await fetch(VIDEO_INDEX, { cache: 'no-cache' });
        if (!res.ok) return;
        list = await res.json();
    } catch (e) {
        return;                 // 動画が無くても、説明書は読める
    }
    if (!Array.isArray(list) || !list.length) return;

    const heads = Array.from(bodyEl.querySelectorAll('h2, h3'));
    list.forEach((v) => {
        // 「2-1.」「6.」のように、頭に番号が付いている見出しを探す
        const head = heads.find((h) => {
            const m = h.textContent.trim().match(/^(\d+(?:-\d+)?)[.．]/);
            return m && m[1] === v.id;
        });
        if (!head) return;

        // 動画は、押したときだけ重ねて出す。説明書を読む邪魔をしない
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'manual-video-btn';
        const len = v.sec ? `約${v.sec}秒・` : '';
        btn.innerHTML = '<span class="mvb-play">▶</span><span class="mvb-text"></span>';
        btn.querySelector('.mvb-text').textContent = `動画で見る（${len}声と字幕つき）`;
        btn.addEventListener('click', () => openVideo(v));

        // 見出しのすぐ下、最初の説明文の前に置く
        head.parentNode.insertBefore(btn, head.nextSibling);
    });
}

/** 動画を画面いっぱいに重ねて再生する。✕・外側・Esc で閉じる */
function openVideo(v) {
    closeVideo();
    const wrap = document.createElement('div');
    wrap.className = 'mv-player';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', `動画: ${v.title}`);
    wrap.innerHTML = `
        <div class="mv-box">
            <div class="mv-head">
                <span class="mv-title"></span>
                <button type="button" class="mv-close" aria-label="動画を閉じる">✕ 閉じる</button>
            </div>
            <video controls playsinline preload="auto"></video>
            <p class="mv-note">音が出ます。音を出せない場所では、字幕だけでも分かります。</p>
        </div>`;
    wrap.querySelector('.mv-title').textContent = `▶ ${v.id}. ${v.title}`;
    const video = wrap.querySelector('video');
    video.src = v.file;
    wrap.addEventListener('click', (e) => { if (e.target === wrap) closeVideo(); });
    wrap.querySelector('.mv-close').addEventListener('click', closeVideo);
    document.body.appendChild(wrap);
    document.documentElement.classList.add('mv-open');
    // 押した操作の続きなので、iPhone でも音つきで始められる
    video.play().catch(() => {});
}

function closeVideo() {
    const old = document.querySelector('.mv-player');
    if (!old) return;
    const video = old.querySelector('video');
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
    old.remove();
    document.documentElement.classList.remove('mv-open');
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeVideo(); });

/**
 * 「？」から開いたときの見せ方：指された見出しと、その中身だけを出す。
 *
 * 説明書まるごと（目次・検索・ほかの章）が出ると、どこを読めばよいか分からない。
 * h3 なら次の h2／h3 の手前まで、h2 ならその章ぶん。
 * 中のリンク（→ 2-13 など）を押すと、その項目だけに切り替わる。
 * いちばん下の「説明書をすべて見る」で、ふだんの説明書に戻る。
 */
function setupFocusMode() {
    const root = document.documentElement;
    const footer = document.createElement('div');
    footer.className = 'focus-footer';
    footer.innerHTML = '<button type="button" class="focus-all">📖 説明書をすべて見る</button>';
    bodyEl.appendChild(footer);

    const showAll = () => {
        root.classList.remove('is-focus');
        bodyEl.querySelectorAll('.mf-hide').forEach((el) => el.classList.remove('mf-hide'));
    };

    const focusOn = (target) => {
        if (!target) { showAll(); return false; }
        const all = Array.from(bodyEl.querySelectorAll('section > *'));
        all.forEach((el) => el.classList.add('mf-hide'));
        bodyEl.querySelectorAll('section').forEach((sec) => sec.classList.add('mf-hide'));

        const sec = target.closest('section');
        if (sec) sec.classList.remove('mf-hide');
        const isH3 = target.tagName === 'H3';
        let node = target;
        while (node) {
            if (node !== target && (node.tagName === 'H2' || (isH3 && node.tagName === 'H3'))) break;
            node.classList.remove('mf-hide');
            node = node.nextElementSibling;
        }
        footer.classList.remove('mf-hide');
        root.classList.add('is-focus');
        window.scrollTo(0, 0);
        return true;
    };

    footer.querySelector('.focus-all').addEventListener('click', () => {
        const here = bodyEl.querySelector('h2:not(.mf-hide), h3:not(.mf-hide)');
        showAll();
        if (here) here.scrollIntoView({ block: 'start' });
    });

    // 中のリンク（#2-13 など）は、その項目だけに切り替える
    bodyEl.addEventListener('click', (e) => {
        if (!root.classList.contains('is-focus')) return;
        const a = e.target.closest('a[href^="#"]');
        if (!a) return;
        const t = resolveTarget(a.getAttribute('href'));
        if (!t) return;
        e.preventDefault();
        focusOn(t);
        history.replaceState(null, '', `${location.pathname}${location.search}${a.getAttribute('href')}`);
    });
    window.addEventListener('hashchange', () => focusOn(resolveTarget(location.hash)));

    if (location.hash) focusOn(resolveTarget(location.hash));
}

(async () => {
    try {
        const res = await fetch(SOURCE, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const md = await res.text();

        if (window.marked && typeof window.marked.parse === 'function') {
            bodyEl.innerHTML = window.marked.parse(md);
        } else {
            // marked が読めなくても、読めないよりは読めるほうがよい
            bodyEl.textContent = md;
        }

        wrapTables();
        await attachVideos();
        const heads = buildToc();
        const sections = groupIntoSections(bodyEl);
        initSearch(sections);
        fixAnchorOffset();
        followScroll(heads);

        // 直接 #… で開かれたとき、上のバーに隠れないように出し直す。
        // 操作ガイドからは「#2-1-予約の電話が入った」の形で来るので、
        // 通し番号の id だけでなく、見出しの字からも探す。
        const jumpToHash = () => {
            const t = resolveTarget(location.hash);
            if (t) t.scrollIntoView({ block: 'start' });
        };
        if (location.hash) jumpToHash();

        // 同じタブで開いたまま別の見出しへ飛ばされることもある
        window.addEventListener('hashchange', jumpToHash);

        // アプリの「？」から開かれたときは、その箇所だけを見せる（下の focusOn）
        if (new URLSearchParams(location.search).get('embed') === '1') {
            setupFocusMode();
        }

        // アプリの「？」から、画面に重ねて開かれたとき（manual.html?embed=1）。
        // 「アプリへ戻る」で中の枠ごとアプリへ移ると二重になるので、閉じるボタンにする
        if (new URLSearchParams(location.search).get('embed') === '1') {
            document.documentElement.classList.add('is-embed');
            const back = document.querySelector('.back-link');
            if (back) {
                back.textContent = '✕ 閉じる';
                back.setAttribute('href', '#');
                back.addEventListener('click', (e) => {
                    e.preventDefault();
                    try { window.parent.postMessage({ type: 'manual-close' }, location.origin); } catch (err) { /* noop */ }
                });
            }
        }
    } catch (e) {
        bodyEl.innerHTML = '<p class="failed"><strong>説明書を読み込めませんでした。</strong>'
            + '<br>電波を確かめて、開き直してみてください。</p>';
        console.error('[manual]', e);
    }
})();
