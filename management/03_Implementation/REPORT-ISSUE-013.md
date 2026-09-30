# 03_実装報告書: ISSUE-013 カレンダー→カルテ遷移バグ修正レポート

## 概要
カレンダービューの施術記録から顧客カルテ詳細へ遷移できないバグを修正しました。

---

## 症状

カレンダーへ切り替えた後、日付セルをクリックして施術記録カードが表示される。  
そのカードをクリックすると顧客一覧に「戻る」だけで、カルテ詳細画面（施術履歴タブ）が開かない状態になっていた。

---

## RCA（根本原因分析）

### なぜ既存の検証プロセスをすり抜けたか

カレンダービューへの切り替え時（`btn-view-calendar` クリック）に `.calendar-mode` クラスを `workspace-grid` に追加する処理（正常）と、  
カレンダーから一覧へ戻る処理（`btn-view-list` クリック）で `.calendar-mode` クラスを削除する処理（正常）の両方は実装されていた。

しかし、カレンダーの施術記録アイテムから **直接カルテ詳細へ遷移する経路**（`showCalendarDayDetails` 内のクリックハンドラ）では、`.calendar-mode` クラスの削除が抜けていた。

この経路は「カレンダー→一覧」ではなく「カレンダー→詳細」という新しい遷移パターンであり、検証時に「カレンダー→一覧→詳細」の経路のみ確認していたために見逃された。

### CSS連鎖の問題

```css
/* calendar-mode 中は詳細パネルを !important で非表示 */
.workspace-grid.calendar-mode .workspace-column-right {
    display: none !important;
}
```

`showCustomerDetail()` 関数内で `customerDetailView.style.display = 'flex'` を呼んでも、CSS側の `!important` 指定が上位にあるため、インラインスタイルが効かない。

---

## 修正内容

### 変更ファイル

#### `product/js/app/ui.js`

```diff
  item.addEventListener('click', () => {
      if (searchContainerSection) searchContainerSection.style.display = 'flex';
      if (customerListContainer) customerListContainer.style.display = 'block';
      if (calendarViewContainer) calendarViewContainer.style.display = 'none';

+     // [BUGFIX ISSUE-013] calendar-mode クラスを削除しないと、
+     // .workspace-grid.calendar-mode .workspace-column-right { display: none !important; }
+     // というCSSルールがカルテ詳細パネルを強制非表示にしてしまうため、ここで必ず解除する
+     if (workspaceGrid) workspaceGrid.classList.remove('calendar-mode');

      if (btnViewList && btnViewCalendar) {
          btnViewList.style.background = 'var(--accent-cyan)';
          ...
      }

      showCustomerDetail(visit.customer.id);
```

---

## 検証手順

1. カレンダービューへ切り替える
2. 施術記録のある日付（ドット付き）をクリック
3. 下部に表示された施術記録カードをクリック
4. ✅ 顧客カルテ詳細画面（施術内容タブ）が全画面で正常に開く
5. ✅ 閉じる（×）ボタンで顧客カードグリッド一覧に戻る
