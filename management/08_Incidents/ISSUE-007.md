# ISSUE-007: カレンダー表示中の顧客カード（グリッド）混入バグの修正

## 1. インシデント概要
* **発生日**: 2026-07-20
* **分類**: PATCH (v1.5.1 - バグ修正)
* **症状**: 
  - カレンダービューに切り替えた際、画面上部に顧客一覧のグリッドカードが非表示にならず残ってしまう。
* **影響度**: 低（表示仕様の不整合）

## 2. 根本原因分析 (RCA)
- v1.5.0 にて `.customer-list` クラスに顧客一覧グリッド用のスタイル（`display: grid !important;`）を記述したため、JavaScript 側の `customerListContainer.style.display = 'none'` によるインライン非表示設定が CSS 優先順位ルール（!important）により打ち消されていたことが原因でした。

## 3. 是正処置（修正内容）
1. **!important指定の削除**:
   - [index.css](file:///c:/Users/Tan0Ry0/Desktop/helthcareapp/product/css/index.css) 内の `.customer-list` に付与されていた `!important` 記述を削除し、標準の CSS 特異性に戻しました。これにより、JavaScript でタブ切り替えを行った際のインライン `display: none` スタイルが正しく優先され、カレンダー表示時に顧客カードが綺麗に消えるようになりました。
