# 03_実装報告書: ISSUE-020 過去の施術記録の編集機能

## 概要
一度作成した施術記録を後から編集できるようにしました。これにより、旧バージョンで作られた記録へ「訴え」「処方」「メモ」を追記できます。分類は **MINOR (v1.6.1 → v1.7.0)** です。

---

## 1. 背景

ISSUE-019 で、旧データの3項目が空文字であることが判明しました。v1.6.1 で「未記入」と表示されるようにはなりましたが、**記録を編集する手段が無い**ため、実際に内容を埋めることができませんでした。

ISSUE-019 対応時に「A（表示）を先、B（編集機能）を次」とご提案し、ご承諾をいただいたうえで本対応を行っています。

---

## 2. 設計上の判断：インデックスではなくIDで特定する

施術記録は `customer.records` 配列に格納されますが、**個々の記録を識別するIDがありませんでした**。編集対象の指定方法として2案を検討しました。

| 案 | 内容 | 判断 |
|---|---|---|
| 配列インデックス | `records[3]` のように位置で指定 | **不採用** |
| 一意ID | 各記録に `id` を持たせて検索 | **採用** |

インデックスを不採用とした理由は、カレンダー経由の記録追加が `unshift`（先頭挿入）であるためです。

```js
customer.records.unshift({ ... });   // 先頭に挿入 → 既存の全インデックスが +1 ずれる
```

編集モーダルを開いている間に別経路で記録が追加されると、インデックスがずれて**別の記録を書き換える**事故が起こり得ます。ISSUE-013〜015 で「状態の取り違え」を繰り返した反省もあり、識別子を明示的に持たせる方式を選びました。

### 実装（`product/js/app/data.js`）

```js
/**
 * [ISSUE-020] 施術記録の一意IDを発番する。
 * 記録の編集は配列インデックスではなくこのIDで対象を特定する。
 * （カレンダー経由の追加は unshift のため、インデックスは容易にズレる）
 */
export function generateRecordId() {
    return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
```

既存記録にはマイグレーションでIDを付与します。

```js
// [ISSUE-020] 既存記録にも編集用の一意IDを付与する
if (!r.id) { r.id = generateRecordId(); updated = true; }
```

### 更新関数

```js
export function updateRecord(customerId, recordId, fields) {
    const customers = getCustomers();
    const customer = customers.find(c => c.id === customerId);
    if (!customer || !Array.isArray(customer.records)) return null;

    const record = customer.records.find(r => r.id === recordId);
    if (!record) return null;

    // id は書き換えさせない（対象特定の拠り所のため）
    const { id, ...rest } = fields || {};
    Object.assign(record, rest);
    if (rest.amount !== undefined) {
        record.amount = parseInt(rest.amount, 10) || 0;
    }

    saveCustomers(customers);
    return customer;
}
```

対象が見つからない場合は `null` を返し、呼び出し側でエラー表示する契約にしました。

---

## 3. UI：追加用モーダルの流用

新しいモーダルを作らず、既存の記録追加モーダルを `editingRecord` の有無で切り替える方式にしました。フォーム項目が完全に同一であり、二重管理を避けるためです。

```js
let editingRecord = null; // { customerId, recordId } または null（＝新規追加）

function resetRecordModal() {
    editingRecord = null;
    if (recordForm) recordForm.reset();
    if (recordModalTitle) recordModalTitle.textContent = '施術内容・金額の記録';
    if (btnSubmitRecord) btnSubmitRecord.textContent = '記録する';
}
```

編集時は見た目も切り替えます。

| | 新規追加 | 編集 |
|---|---|---|
| タイトル | 施術内容・金額の記録 | **施術記録の編集** |
| 送信ボタン | 記録する | **更新する** |
| フォーム | 空（日付は今日） | **既存値をプリフィル** |
| 顧客選択 | カレンダー経由時のみ表示 | 常に非表示（対象確定済み） |

送信処理は編集モードを先に判定して分岐します。

```js
// [ISSUE-020] 編集モードなら既存記録を更新して終了する
if (editingRecord) {
    const result = updateRecord(editingRecord.customerId, editingRecord.recordId, {
        date, type, amount, time, clientComplaint, prescription, therapistNote
    });
    // ... モーダルを閉じて resetRecordModal() → 再描画
    renderCalendar();          // 日付を変更した場合にドットを追従させる
    showCustomerDetail(editedCustomerId);
    return;
}
```

### モード持ち越しの防止

**編集モードが新規追加に持ち越されると、追加のつもりが既存記録の上書きになります。** これは ISSUE-013〜015 で繰り返した「状態残留バグ」と同じ構造です。そこでモーダルを開く／閉じる**すべての経路**で `resetRecordModal()` を通すようにしました。

- 「＋ この日の記録を追加」ボタン（詳細画面）
- 「＋ 記録追加」ボタン（カレンダー）
- 「キャンセル」ボタン
- 更新完了時

---

## 4. 検証結果

ヘッドレスブラウザで、**旧データ（3項目が空・IDなし）**を localStorage に投入して実測しました。

### 編集フロー

| 検証項目 | 結果 |
|---|---|
| 記録カードに「✏️ 編集」ボタンが出る | ✅ |
| モーダルのタイトルが「施術記録の編集」になる | ✅ |
| 送信ボタンが「更新する」になる | ✅ |
| 既存値がプリフィルされる | ✅ `{date:"2026-07-10", type:"アロママッサージ 60分", amount:"9000", time:"14:00 - 15:00"}` |
| 訴え・処方を追記して保存できる | ✅ `訴え: 肩こりがつらい 処方: ブルーでリラックス` |
| **記録件数が増えない**（更新であって追加でない） | ✅ `recordCount: 1` |
| 未入力のメモは「未記入」のまま維持 | ✅ |

### 状態持ち越しの回帰テスト

編集モードに入る → キャンセル → 続けて「記録追加」で新規登録、という順で操作しました。

| 検証項目 | 結果 |
|---|---|
| キャンセル後にタイトルが戻る | ✅ 施術内容・金額の記録 |
| キャンセル後にボタン文言が戻る | ✅ 記録する |
| 新規追加が**更新に化けない** | ✅ `recordCount: 2` |
| 追加された記録が正しい | ✅ `["新規テスト施術", "アロマ 60分"]` |
| 記録IDが重複しない | ✅ `uniqueIds: 2` |

`node --check`（ESモジュール構文）も `ui.js` / `data.js` ともエラーなしです。

---

## 5. 変更ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `product/js/app/data.js` | `generateRecordId()` / `updateRecord()` を新設。既存記録へのID付与マイグレーション。`addRecord` でID採番 |
| `product/js/app/ui.js` | 編集ボタンの描画とハンドラ、`openRecordEditor()` / `resetRecordModal()`、送信処理の分岐 |
| `product/index.html` | モーダルのタイトルに `id="record-modal-title"` を付与 |
| `management/08_Incidents/ISSUE-020.md` | インシデント報告書 [D-1] |
| `management/03_Implementation/REPORT-ISSUE-020.md` | 本レポート [D-2] |
| `management/99_Portal/index.html` | バージョン v1.7.0 へ更新、改善履歴に追加 [D-3] |
| `.agent/rules/04_VERIFICATION_STANDARD.md` | 検証項目 [V-94] を追加 [D-4] |

---

## 6. 再発防止（検証基準の強化）

`04_VERIFICATION_STANDARD.md` に **[V-94]** を追加しました。

1. **編集対象は一意IDで特定する**: 配列インデックスで編集・削除の対象を指定しない。挿入・並べ替えでインデックスは容易にズレ、別レコードを破壊する。IDが無いスキーマにはマイグレーションで付与する。
2. **モード切替UIは開閉の全経路でリセットする**: 追加／編集を1つのモーダルで兼ねる場合、開く・閉じるすべての経路でモードを初期化する。「編集→キャンセル→追加」の順で操作し、**追加が更新に化けないこと**を必ず確認する。
3. **更新系は件数の不変を検証する**: 更新操作の後に**レコード件数が増えていないこと**を実測で確認する。更新のつもりが追加になっている不具合は、画面上は正常に見えるため見落としやすい。

---

## 7. 補足

- 記録の**削除**機能は今回のご要望に含まれないため実装していません。必要であれば別途対応します。
- 編集時に来店日を変更した場合、カレンダーのドット位置も追従します（`renderCalendar()` を再実行）。
