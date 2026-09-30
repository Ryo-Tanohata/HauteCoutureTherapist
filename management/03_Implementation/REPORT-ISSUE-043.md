# 03_実装報告書: ISSUE-043 ブラウザ側の守りを入れ、外への依存を減らす

## 概要

「一般的なセキュリティに比べてどうか」というご質問に答えるため、コードを読み直して突き合わせました。
**暗号のかけ方は同じ規模のアプリの平均よりかなり上、周りの守りは薄い**という結果でした。

薄かったもののうち、**いま入れても他に影響が出ない3つ**を直しています。
残りは、直すと今あるデータが開けなくなるものや、運用の相談が要るものなので、申し送りにしました。

---

## 1. まず、一般水準との突き合わせ

### 平均より良かったところ

| | このアプリ | よくある同種のアプリ |
|---|---|---|
| 置き場のデータ | **端末で暗号化してから預ける。サーバーは読めない** | サーバーに平文で保存 |
| 鍵の置き場所 | ブラウザの中だけ。外に出ない | サーバーが鍵も持つ |
| 認証値と鍵 | PBKDF2 の**別ブロック**。認証値から鍵は割り出せない | 同じ値を使い回す例が多い |
| 暗号方式 | AES-GCM、初期値（IV）は毎回乱数 | 同程度 |
| 合言葉の照合 | **時間差で漏れない比較** | 素の `===` が多い |
| 写真の名前 | 正規表現で絞り、置き場の別の場所を触らせない | 見落とされがち |

体質・アレルギー・病歴は、日本の個人情報保護法で**要配慮個人情報**にあたります。
漏れたときの重さが普通の顧客名簿と違うので、**預ける前に読めなくしてある**のは
このアプリにとって正しい形です。ここは変えていません。

### 薄かったところ

| | 状態 | 効き |
|---|---|---|
| 書いた文字がそのまま動く形で入る | 8か所（実際は9か所） | **大** |
| CSP が無い | `_headers` そのものが無い | **大** |
| 外のCDNから実行されるものを読む | 版の指定も無し | **大** |
| 合言葉が端末に平文で残る | 自動同期のため | 大 |
| 鍵づくりの重さ | 21万回（推奨は60万回） | 中 |
| 塩が固定値 | 設計上こうなる | 中 |
| 回数制限が無い | 総当たりを弾けない | 中 |
| 誰が見たかの記録が無い | 監査ログなし | 中 |
| 控えが無い | 置き場が壊れたら端末のぶんだけ | **大** |

---

## 2. 直したこと

### 2-1. 書いた文字を、字として出す（9か所）

訴え・施術内容・来店日時・特記事項メモ・顧客No.・電話番号・紹介者・生年月日、
そして共通部分の1か所。

```js
// 前
<span ...>${r.clientComplaint || '特記なし（定期メンテナンス）'}</span>

// 後
<span ...>${escapeHtml(r.clientComplaint || '特記なし（定期メンテナンス）')}</span>
```

共通部分は、こちらで組み立てた安全な中身（`html`）と、手で書いたもの（`value`）が
同じ変数に入っていたため、**手で書いたほうにだけ**かけました。

```js
// html を持つ行だけが、こちらで組み立てた安全な中身。
// 手で書いたものは、そのまま流すと <script> や onerror が動いてしまう
const body = html || (filled ? escapeHtml(String(value)) : '未記入');
```

### 2-2. marked を自前で持つ

```html
<!-- 前：版の指定も無く、その先が差し替われば差し替わったものが動く -->
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>

<!-- 後 -->
<script src="js/vendor/marked/marked.min.js"></script>
```

npm から v12.0.2 を取り、`product/js/vendor/marked/` に置きました（MIT。LICENSE.md も同梱）。
**版が動かないので、ある日いきなり中身が変わることがありません。**

### 2-3. ページの中の script を、全部外に出す

`index.html` の末尾に2行だけ直に書かれていた起動処理を `js/app/aurora-boot.js` に移しました。

これで CSP の `script-src` に `'unsafe-inline'` を入れずに済みます。
**入れなければ、ページの中に書かれたものはブラウザがその場で止めます。**
2-1 で1か所見落としていましたが、**実際そこで止まりました。**

### 2-4. `product/_headers` を置く

```
Content-Security-Policy: default-src 'self'; base-uri 'none'; object-src 'none';
  frame-ancestors 'none'; form-action 'self';
  script-src 'self' https://esm.run https://cdn.jsdelivr.net;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: blob:;
  connect-src 'self' https://api.anthropic.com https://generativelanguage.googleapis.com;
  worker-src 'self' blob:; manifest-src 'self'; upgrade-insecure-requests
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=(), usb=()
Strict-Transport-Security: max-age=31536000
```

読み込んでよい先を名指しで決め、**ここに無いものは全部止まります。**
許した先は、実際にアプリが使っているものだけです（フォント2つ、生成AI2社、
星詠みチャットが読む Gemini の部品）。

置き場の返事にも `nosniff` を足しました（`functions/api/sync.js`）。

---

## 3. 検証結果

CSP は書き間違えても何も言わずに一部だけ壊れるため、**本番と同じ守りを付けて配って**確かめました。
`serve-with-headers.js` が `_headers` をそのまま読んで付けます。

| 調べたこと | 結果 |
|---|---|
| 守りに弾かれたものが出ないか | **0件** |
| 画面のエラー | **0件** |
| marked が自前のもので動くか | **動いた** |
| お客様一覧・カルテ・カレンダーが出るか | **すべて出た** |
| 手で書ける11の欄に悪い文字を入れ、10画面を一巡 | **すべて字のまま。動いたものは無し** |
| 書いたものが読めるか（消えていないか） | **読める** |
| 同期の突き合わせ（`verify-fieldmerge.js`） | **通った**（作り直しによる巻き添えなし） |

### 見つけ方についての気付き

grep で8か所を直したあと検証したところ、**9か所目が残っていました。**
共通部分の書き方が grep の形に当てはまらなかったためです。

**目で探すより、実際に悪い文字を入れて画面を一巡するほうが確実**でした。
この確認は `verify-csp.js` に残してあるので、画面を足したときも同じ手で見られます。

---

## 4. まだ残っていること

| | なぜ今やらないか |
|---|---|
| **esm.run**（星詠みチャットが Gemini の部品を外から読む） | 止めると機能が壊れる。自前で持つには依存も抱える必要があり、別の作業 |
| **合言葉が端末に平文で残る** | 消すと毎回入力になる。サロンの使い方と相談 |
| **鍵づくりを60万回に上げる** | **回数を変えると鍵が変わり、いま置いてあるものが開けなくなる。** 版番号を付けた移し替えが要るので、単独で慎重にやりたい |
| **回数制限** | Cloudflare 側の設定で入れられる。半日ほど |
| **控え（バックアップ）** | 運用の相談。悪意より事故のほうが確率は高いので、優先度は高い |

### いちばん効くのは、技術の外側

1. **端末そのもの。** 暗号は「置き場に預けたぶん」を守っていて、端末の中は守っていません
2. **合言葉の渡し方。** LINE やメールで送ると、そこが一番弱い場所になります
3. **控えを取る習慣**

---

## 5. 触ったもの

| ファイル | 中身 |
|---|---|
| `product/_headers` | **新規。** CSP ほか6つ |
| `product/js/vendor/marked/marked.min.js` | **新規。** v12.0.2（MIT） |
| `product/js/vendor/marked/LICENSE.md` | **新規。** |
| `product/js/app/aurora-boot.js` | **新規。** ページの中にあった起動処理 |
| `product/index.html` | CDN → 自前、ページの中の script を外へ |
| `product/js/app/ui.js` | 9か所に `escapeHtml` |
| `functions/api/sync.js` | 返事に `nosniff` |
| `management/09_Verification/verify-csp.js` | **新規。** 検証 |
| `management/09_Verification/serve-with-headers.js` | **新規。** 守りを付けて配る |
