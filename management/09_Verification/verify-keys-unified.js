// キーの入れ物が1つになったか。
// 前に入れていたものが、消えずに移っているか。
const { chromium } = require('playwright');
const APP = 'http://127.0.0.1:8900/product/index.html';
const ok = (c) => (c ? '✅' : '❌');
let ng = 0;
const check = (label, cond, extra = '') => { if (!cond) ng += 1; console.log(`  ${label}:`, ok(cond), extra); };

const openChat = async (p) => {
    await p.locator('[id$="-fab"]').first().click();
    await p.waitForTimeout(1200);
    // 「設定」タブへ
    const tab = p.locator('.fc-tab, [data-target="settings"]').filter({ hasText: /設定|Settings/ }).first();
    if (await tab.count()) { await tab.click(); await p.waitForTimeout(700); }
};
const keys = (p) => p.evaluate(() => {
    const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
    return {
        app: read('therapist_ai_api_keys'),
        chat: read('aurora_gemini_api_keys'),
        chatSingle: localStorage.getItem('aurora_gemini_api_key')
    };
});

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

    console.log('=== 1. チャットの設定タブに、入力欄が無く案内が出るか');
    const c1 = await b.newContext({ viewport: { width: 1280, height: 1000 } });
    const p = await c1.newPage();
    const errors = []; const blocked = [];
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) blocked.push(m.text()); });
    await p.goto(APP); await p.waitForTimeout(3000);
    await openChat(p);
    check('エラーが出ていない', errors.length === 0, errors.join(' / ').slice(0, 160));
    check('守りに弾かれていない', blocked.length === 0, `${blocked.length}件`);
    // アプリの設定画面にも #input-ai-api-key があるので、チャットの中だけを見る
    check('チャット側のキー入力欄が無い',
        (await p.locator('[id$="-panel"] [id$="-api-key"], #fc-api-key').count()) === 0);
    check('追加ボタンも無い', (await p.locator('[id$="-add-key-btn"]').count()) === 0);
    const help = await p.locator('[id$="-view-settings"]').innerText();
    console.log('   案内:', JSON.stringify(help.replace(/\n+/g, ' / ').slice(0, 110)));
    check('設定画面へ案内している', help.includes('設定') && help.includes('AI の設定'));

    console.log('\n=== 2. 前にチャットへ入れていたキーが、消えずに移るか');
    const c2 = await b.newContext({ viewport: { width: 1280, height: 1000 } });
    const q = await c2.newPage();
    const qErr = [];
    q.on('pageerror', (e) => qErr.push(e.message));
    await q.goto(APP); await q.waitForTimeout(2500);
    // 昔の形（チャット側だけにキーがある状態）を作る
    await q.evaluate(() => {
        localStorage.setItem('aurora_gemini_api_keys', JSON.stringify(['AIzaFAKEKEY_chat_1', 'AIzaFAKEKEY_chat_2']));
        localStorage.setItem('aurora_gemini_api_key', 'AIzaFAKEKEY_old_single');
        localStorage.removeItem('therapist_ai_api_keys');
    });
    await q.reload(); await q.waitForTimeout(3500);
    const after = await keys(q);
    console.log('   移したあと:', JSON.stringify(after));
    check('アプリ側に移っている', Array.isArray(after.app) && after.app.length === 3, JSON.stringify(after.app));
    check('3本とも残っている',
        ['AIzaFAKEKEY_chat_1', 'AIzaFAKEKEY_chat_2', 'AIzaFAKEKEY_old_single']
            .every((k) => (after.app || []).includes(k)));
    check('古い置き場は片付いている', !after.chat && !after.chatSingle);
    check('移し替えでエラーが出ていない', qErr.length === 0, qErr.join(' / ').slice(0, 140));

    console.log('\n=== 3. 二重に増えないか（もう一度開く）');
    await q.reload(); await q.waitForTimeout(3000);
    const again = await keys(q);
    check('本数が増えない', (again.app || []).length === 3, `${(again.app || []).length}本`);

    console.log('\n=== 4. 設定画面で入れたキーを、チャットが見ているか');
    const c3 = await b.newContext({ viewport: { width: 1280, height: 1000 } });
    const r = await c3.newPage();
    await r.goto(APP); await r.waitForTimeout(2500);
    await r.evaluate(() => localStorage.setItem('therapist_ai_api_keys',
        JSON.stringify(['sk-ant-FAKE_from_settings'])));
    await r.reload(); await r.waitForTimeout(3000);
    await openChat(r);
    // キー無しのときの断り文句が出ないこと＝キーを見つけている
    await r.locator('.fc-tab, [data-target="chat"]').filter({ hasText: /チャット|Chat/ }).first().click()
        .catch(() => {});
    await r.waitForTimeout(500);
    const sees = await r.evaluate(async () => {
        const m = await import('./js/app/ai-client.js');
        return m.getStoredApiKeys();
    });
    console.log('   チャットから見えるキー:', JSON.stringify(sees));
    check('設定側のキーが見えている', sees.includes('sk-ant-FAKE_from_settings'));

    console.log(ng === 0 ? '\n  ぜんぶ通りました' : `\n  ❌ ${ng} 件だめでした`);
    await b.close();
    process.exit(ng === 0 ? 0 : 1);
})();
