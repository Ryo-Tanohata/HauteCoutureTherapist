// 本番と同じ守りを付けて配る。_headers をそのまま読んで使う。
// CSP は書き間違えても何も言わずに一部だけ壊れるので、実物で見る。
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');   // リポジトリの一番上

// _headers は「/* の下」「/index.html の下」のように区切られている。
// 本番と同じに見せるため、その区切りも読む。
const sections = [];
let cur = null;
fs.readFileSync(path.join(ROOT, 'product/_headers'), 'utf8').split('\n').forEach((line) => {
    if (!line.trim() || line.trim().startsWith('#')) return;
    if (!line.startsWith(' ')) { cur = { match: line.trim(), headers: {} }; sections.push(cur); return; }
    const t = line.trim();
    const i = t.indexOf(':');
    if (i > 0 && cur) cur.headers[t.slice(0, i).trim()] = t.slice(i + 1).trim();
});
const headersFor = (urlPath) => Object.assign({}, ...sections
    .filter((sec) => sec.match === '/*' || sec.match === urlPath)
    .map((sec) => sec.headers));
sections.forEach((sec) => console.log(`${sec.match} →`, Object.keys(sec.headers).join(', ')));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
    '.png': 'image/png', '.mp4': 'video/mp4', '.webm': 'video/webm', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
    // 本番は product/ が一番上なので、/images/… のような絶対パスは product/ の下を見る
    let p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!fs.existsSync(p)) p = path.join(ROOT, 'product', decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    fs.readFile(p, (err, buf) => {
        if (err) { res.writeHead(404); return res.end('not found'); }
        // Pages は product/ の中を配るので、URL からその前置きを外して照らす
        const inSite = req.url.split('?')[0].replace(/^\/product/, '') || '/';
        res.writeHead(200, {
            ...headersFor(inSite),
            'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream'
        });
        res.end(buf);
    });
}).listen(8900, '127.0.0.1', () => console.log('http://127.0.0.1:8900/product/index.html'));
