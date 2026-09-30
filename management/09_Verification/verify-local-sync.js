// ローカルで開いている間も、置き場への同期が止まらないか。
// あわせて、札が実際に使われたモデルへ変わるか。
const { chromium } = require('playwright');
const APP = 'http://127.0.0.1:3000/product/index.html';
const PASS = 'ラベンダーと海と山のあいだ';
const ok = (c) => (c ? '✅' : '❌');
let ng = 0;
const check = (l, c, e='') => { if (!c) ng += 1; console.log(`  ${l}:`, ok(c), e); };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({viewport:{width:1280,height:1000}});
  // 💬 は既定で出さない設定（ISSUE-071）。ここでは札の変化を見たいので、出す側にする
  await ctx.addInitScript(() => localStorage.setItem('therapist_chat_enabled', 'on'));
  const p = await ctx.newPage();
  p.on('pageerror', e => { console.log('  ERR', e.message.slice(0,140)); ng += 1; });
  await p.goto(APP); await p.waitForTimeout(3500);

  console.log('=== 1. 置き場につなぐ');
  await p.locator('#btn-view-color-settings').click(); await p.waitForTimeout(1500);
  await p.locator('#input-salon-pass').fill(PASS);
  await p.locator('#btn-salon-connect').click(); await p.waitForTimeout(9000);
  const pill = await p.evaluate(() => {
    const el = document.getElementById('sync-badge');
    return el ? { text: el.textContent.trim(), cls: el.className, hidden: el.hidden } : null; });
  console.log('   同期の札:', JSON.stringify(pill));
  check('「送れていません」になっていない', pill && !pill.text.includes('送れ'), pill && pill.text);
  check('エラー色になっていない', pill && !pill.cls.includes('is-error'), pill && pill.cls);

  console.log('\n=== 2. 書いたものが、置き場まで届くか');
  await p.evaluate(async () => {
    const m = await import('./js/app/data.js');
    const cs = JSON.parse(localStorage.getItem('therapist_customers') || '[]');
    if (cs[0]) m.updateCustomer(cs[0].id, { memo: 'ローカル経由で書いた印' });
  });
  await p.waitForTimeout(9000);
  const after = await p.evaluate(() => {
    const el = document.getElementById('sync-badge');
    return el ? el.textContent.trim() : null; });
  console.log('   書いたあとの札:', JSON.stringify(after));
  check('送れている', after && !after.includes('送れ') && !after.includes('未送信'), after);

  console.log('\n=== 3. AIの札が、実際に使われたモデルに変わるか');
  const before = await p.evaluate(() => {
    const el = document.getElementById('ai-route-badge'); return el ? el.textContent.trim() : null; });
  console.log('   聞く前 :', JSON.stringify(before));
  check('モデル名が出ている', before && before.includes('claude-'), before);
  await p.locator('#fc-fab').click(); await p.waitForTimeout(1200);
  await p.locator('#fc-input').fill('控えはどうやって取りますか');
  await p.locator('#fc-input').press('Enter');
  await p.waitForTimeout(45000);
  const afterAi = await p.evaluate(() => {
    const el = document.querySelector('#fc-route'); return el ? el.textContent.trim() : null; });
  console.log('   答えた後:', JSON.stringify(afterAi));
  check('版まで含む名前に変わる', afterAi && /claude-.*-\d{8}/.test(afterAi), afterAi);
  check('アカウントで答えている', afterAi && afterAi.includes('アカウント'), afterAi);

  console.log(ng === 0 ? '\n  ぜんぶ通りました' : `\n  ❌ ${ng} 件だめでした`);
  await b.close(); process.exit(ng === 0 ? 0 : 1);
})();
