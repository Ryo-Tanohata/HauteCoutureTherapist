# 03_実装報告書: ISSUE-015 インラインスタイルによる顧客カードグリッド崩れの修正レポート

## 概要
カレンダービューから「👥 顧客一覧」へ戻った際に、顧客カードがタイル状グリッドではなく全幅の縦積みリストとして表示されるバグを修正しました。分類は **PATCH (v1.5.8 → v1.5.9)** です。

---

## 症状

| 期待 | 実際 |
|---|---|
| C-0001 / C-0002 が横並びのタイル状カード（2列以上） | 画面全幅の横長カードが縦一列に積み上がる |

- 初期表示（リロード直後）は正常
- **カレンダーを経由して顧客一覧へ戻った時のみ**崩れる
- リロードすると復旧する

### ユーザー様のご質問への回答

> これはキャッシュを読み込んでいるのでしょうか？

**キャッシュではありません。** JavaScript が実行時に付与した**インラインスタイルの残留**が原因です。リロードすると DOM が再構築されインラインスタイルが消えるため正常化しており、これが「キャッシュのように見える」挙動を生んでいました。

---

## RCA（根本原因分析）

### 直接原因: インラインスタイルによる `display: grid` の破壊

顧客一覧コンテナはCSSでグリッドとして定義されています。

```css
/* product/css/index.css:133-138 */
.customer-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 16px;
    width: 100%;
}
```

一方、ビュー切り替えのJSは表示/非表示制御のために `display: block` をインラインで代入していました。

```js
customerListContainer.style.display = 'block';
```

CSSの詳細度において**インラインスタイルは通常のセレクタより優先**されるため、`display: grid` が `block` に置き換わります。グリッドコンテナでなくなった時点で `grid-template-columns` と `gap` も一切機能せず、子要素（`.customer-card-grid-item`）が通常のブロックフローで全幅・縦積みに配置されました。

### なぜすり抜けたか

1. **初期表示では発現しない**。この代入はビュー切り替え時にしか走らないため、通常のリロード確認では常に正常に見えていました。
2. **直前まで到達不能な経路だった**。ISSUE-014 修正以前は「カレンダー→顧客一覧」が空白画面になっていたため、この崩れを目視できる状態にありませんでした。ISSUE-014 の修正によって初めて画面が描画され、潜在していた本バグが露出しました。
3. **`display` の値をCSSと同期させる観点が欠けていた**。「要素を表示する ＝ `display:'block'`」という反射的な実装が、CSS側の `grid` / `flex` レイアウトを無自覚に破壊していました。同種の障害は ISSUE-010（CSS優先順位競合によるグリッド崩れ）でも発生しており、**再発**にあたります。

---

## 修正内容

`style.display` に具体的な値を書かず、**空文字を代入してインライン指定そのものを除去**する方式に変更しました。これにより常にCSS側で定義された表示モード（`grid`）が復元されます。

### 1. 「顧客一覧」タブハンドラ（`product/js/app/ui.js` 557行目付近）

```diff
             if (searchContainerSection) searchContainerSection.style.display = 'flex';
-            if (customerListContainer) customerListContainer.style.display = 'block';
+            // [BUGFIX ISSUE-015] 'block' を入れると .customer-list { display: grid } を
+            // インラインで上書きしてしまい、カードが縦積みの全幅リストに崩れる。
+            // 空文字を代入してインライン指定を除去し、CSS本来のグリッドに戻す。
+            if (customerListContainer) customerListContainer.style.display = '';
             if (calendarViewContainer) calendarViewContainer.style.display = 'none';
```

### 2. カレンダー施術記録 → カルテ遷移ハンドラ（`product/js/app/ui.js` 730行目付近）

```diff
-                    if (customerListContainer) customerListContainer.style.display = 'block';
+                    // [BUGFIX ISSUE-015] CSS の display:grid をインラインで潰さないよう空文字を代入
+                    if (customerListContainer) customerListContainer.style.display = '';
                     if (calendarViewContainer) calendarViewContainer.style.display = 'none';
```

非表示側（`display = 'none'`）はインラインで上書きすることが意図通りのため変更していません。

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `product/js/app/ui.js` | `display='block'` → `display=''` に変更（2箇所） |
| `management/08_Incidents/ISSUE-015.md` | インシデント報告書を新規起票 [D-1] |
| `management/03_Implementation/REPORT-ISSUE-015.md` | 本レポート [D-2] |
| `management/99_Portal/index.html` | バージョン v1.5.9 へ更新、改善履歴に追加 [D-3] |
| `.agent/rules/04_VERIFICATION_STANDARD.md` | インラインスタイルとCSSレイアウトの整合検証項目を追加 [D-4] |

---

## 再発防止（検証基準の強化）

`04_VERIFICATION_STANDARD.md` に **[V-90]** を追加しました。要点は以下の通りです。

1. **要素を「表示する」際に `style.display` へ具体値を代入することを原則禁止**とし、`style.display = ''` でインライン指定を除去してCSSに委ねる。値を代入する場合は、CSS側の `display` 値（`grid` / `flex` / `block`）と一致していることをCSSファイルで確認してから書く。
2. **ビュー切り替え後のレイアウト目視確認を必須化**。初期表示だけでなく、タブを往復した後にグリッド・フレックスのレイアウトが保持されているかを確認する。
3. **「リロードで直る」は必ず調査する**。キャッシュと即断せず、実行時に付与されたインラインスタイル／状態クラスの残留を DevTools の Elements パネルで確認する。
