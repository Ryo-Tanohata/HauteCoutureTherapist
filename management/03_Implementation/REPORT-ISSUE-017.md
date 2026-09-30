# 03_実装報告書: ISSUE-017 スマホ画面でカレンダーが横に見切れるバグの修正レポート

## 概要
スマートフォンの画面幅でカレンダーの右端（土曜日の列・月送りボタン）が見切れるバグを修正しました。分類は **PATCH (v1.5.9 → v1.5.10)** です。

---

## 症状

スマホ幅（375〜390px）でカレンダービューを開くと、**土曜日の列と「→」（翌月）ボタンが画面右端で切れて見えなくなる**。`body { overflow-x: hidden }` が指定されているため横スクロールもできず、切れた部分には一切アクセスできませんでした。

---

## RCA（根本原因分析）

### 主因: `aspect-ratio` が最小サイズを軸間で転写していた

```css
.calendar-day {
    aspect-ratio: 1;
    min-height: 48px;
}
```

一見「高さの最小値を48pxにする」だけの指定に見えますが、CSS の `aspect-ratio` は **min/max 制約を軸間で転写する**仕様です（`min-height: 48px` × `aspect-ratio: 1` → **転写された最小幅 48px**）。

このため、カレンダーグリッドに次の最小幅が発生していました。

| 内訳 | 幅 |
|---|---|
| セル 48px × 7列 | 336px |
| gap 8px × 6 | 48px |
| `.calendar-view-section` の padding 20px × 2 + border | 42px |
| `main` の padding 16px × 2 | 32px |
| **合計** | **458px** |

スマホ幅 390px に対して **68px 超過**しており、`overflow-x: hidden` によってその分がそのまま切り落とされていました。

### 副因1: グリッドトラックの暗黙の最小幅

```css
grid-template-columns: repeat(7, 1fr);
```

`1fr` は暗黙に `min-width: auto` を持ち、トラックがセルの内容幅より狭くなれません。主因の転写と合わせ、**縮小の余地が二重に塞がれていた**状態でした。

### 副因2: レスポンシブ指定が皆無だった（プロセス上の真因）

`product/css/index.css` には **`@media` クエリが1つも存在しませんでした**。CSS冒頭には「3. レイアウト (スマホファースト)」というコメントがあり、設計意図としてはスマホ対応が謳われていたにもかかわらず、実装が伴っていませんでした。

これまでの検証がすべて**PC幅のブラウザでのみ**行われており（ISSUE-007〜016 のすべて）、狭い画面幅での確認が検証プロセスに組み込まれていなかったことが真因です。PC幅（1200px以上）では 458px の最小幅は問題にならないため、一度も顕在化しませんでした。

---

## 修正内容

### 1. `.calendar-day` の最小サイズ解除

```diff
 .calendar-day {
     aspect-ratio: 1;
-    min-height: 48px;
+    /* [BUGFIX ISSUE-017] aspect-ratio は min/max 制約を軸間で転写するため、
+       min-height:48px が「最小幅48px」として効いてしまい、
+       7列で 48*7+8*6=384px の下限が生まれてスマホ幅を超過していた。
+       最小サイズの下限を外し、列幅に追従する正方形セルにする。 */
+    min-width: 0;
+    min-height: 0;
     display: flex;
```

### 2. グリッドトラックの最小幅解除

```diff
 .calendar-grid {
     display: grid;
-    grid-template-columns: repeat(7, 1fr);
+    /* [BUGFIX ISSUE-017] 1fr は暗黙に min-width:auto を持ち、セルの内容幅より
+       狭くできないためスマホで横に溢れる。minmax(0, 1fr) で最小幅の下限を外し、
+       常にコンテナ幅ぴったりに7列を収める。 */
+    grid-template-columns: repeat(7, minmax(0, 1fr));
     gap: 8px;
     text-align: center;
+    width: 100%;
 }
```

### 3. レスポンシブ指定の新設

セルが小さくなりすぎないよう、狭い画面では余白を詰めて表示領域を確保します。

```css
@media (max-width: 640px) {
    main { padding: 12px; gap: 12px; }
    .calendar-view-section { padding: 12px; border-radius: 16px; gap: 12px; }
    .calendar-grid { gap: 4px; }
    .calendar-day { padding: 2px; border-radius: 8px; }
    .calendar-day-num { font-size: 0.8rem; }
    .calendar-dot { width: 5px; height: 5px; }
    .calendar-weekday { font-size: 0.7rem; }
    .calendar-title { font-size: 1rem; }
    .calendar-nav-btn { padding: 6px 10px; }
    .calendar-visit-item { padding: 10px 12px; }
}
```

これにより 390px 幅でのセルサイズは約43px四方となり、タップ可能な大きさを維持できます。

---

## 検証結果

ヘッドレスChromeで**幅390pxのビューポートを再現**し、修正前後を実測・比較しました。

> ※ ヘッドレスChromeはウィンドウ幅を500px未満に縮小できないため、500px幅のウィンドウ内に **390px幅のiframe** を置いて実機相当のビューポートを再現しています。またWindowsのディスプレイ拡大率の影響を排除するため `--force-device-scale-factor=1` を指定しています。

### 目視比較

| | 結果 |
|---|---|
| **修正前** | 土曜日の列と「→」ボタンが右端で見切れる（症状を再現） |
| **修正後** | 日〜土の7列と「→」ボタンがすべて画面内に収まる |

### 実測値（修正後）

| 項目 | 値 |
|---|---|
| `documentElement.clientWidth` | 390 |
| `body.scrollWidth` | 390 |
| ビューポートを超える要素 | **0件** |

`scrollWidth` がビューポート幅と完全に一致し、はみ出し要素が1つも検出されないことを確認しました。

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `product/css/index.css` | `.calendar-day` の最小サイズ解除、`.calendar-grid` の `minmax(0,1fr)` 化、`@media (max-width: 640px)` を新設 |
| `management/08_Incidents/ISSUE-017.md` | インシデント報告書 [D-1] |
| `management/03_Implementation/REPORT-ISSUE-017.md` | 本レポート [D-2] |
| `management/99_Portal/index.html` | バージョン v1.5.10 へ更新、改善履歴に追加 [D-3] |
| `.agent/rules/04_VERIFICATION_STANDARD.md` | スマホ幅での検証項目を追加 [D-4] |

なお検証に使用した一時ファイル（`__diag.js` / `__mobiletest.html` / `__mobileframe.html`）は削除済みで、リポジトリには含まれません。

---

## 再発防止（検証基準の強化）

`04_VERIFICATION_STANDARD.md` に **[V-91]** を追加しました。

1. **スマホ幅検証の必須化**: UI変更を伴うすべての修正で、**幅375px相当**でのレイアウト確認を必須とする。PC幅のみの確認は完了と見なさない。
2. **はみ出しの機械的検証**: `document.body.scrollWidth <= document.documentElement.clientWidth` が成立すること、およびビューポート右端を越える要素が0件であることを DevTools で確認する。
3. **`aspect-ratio` 使用時の注意**: `aspect-ratio` と `min-height` / `max-height` を併用すると、その制約が**幅にも転写される**。意図しない最小幅を生むため、グリッド内で使う場合は `min-width: 0; min-height: 0;` を明示する。
4. **`1fr` の暗黙の最小幅**: グリッドを確実に縮小させたい場合は `1fr` ではなく `minmax(0, 1fr)` を用いる。
5. **`overflow-x: hidden` は不具合を隠す**: 横スクロールを封じている以上、溢れは「見切れ」として即座に機能欠損になる。溢れさせない実装が必須。
