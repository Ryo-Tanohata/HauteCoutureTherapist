# ISSUE-013: カレンダーから顧客カルテ画面への遷移が機能しないバグ

## 概要
- **発生日**: 2026-07-20
- **分類**: PATCH (v1.5.7)
- **担当**: Antigravity

## 症状
カレンダービューで施術記録のある日付をクリックし、表示された施術記録カードをクリックすると、本来は顧客のカルテ詳細画面が開くはずが、顧客一覧画面に戻るだけでカルテが表示されない。

## 根本原因
`showCalendarDayDetails` 関数内の「施術記録アイテムのクリックハンドラ」において、ビュー切り替え時に `.workspace-grid` から `.calendar-mode` クラスを削除していなかった。

その結果、CSS側の以下のルールが有効なまま残り、カルテ詳細パネル（`.workspace-column-right`）が `display: none !important` によって強制非表示になっていた。

```css
.workspace-grid.calendar-mode .workspace-column-right {
    display: none !important;
}
```

## 修正内容
`ui.js` の施術記録クリックハンドラに `workspaceGrid.classList.remove('calendar-mode')` の1行を追加し、カレンダーモードのCSSクラスを解除してからカルテ詳細を表示するよう修正した。

## 修正ファイル
- `product/js/app/ui.js`（706〜723行目付近）
