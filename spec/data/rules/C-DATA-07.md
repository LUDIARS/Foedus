# C-DATA-07 — 境界文書同期

- **severity**: low
- **category**: meta

## 正とする状態

spec の境界宣言 (「持つ/持たない」または「含む/除く」) と実 schema が一致する。

## 判定

boundary 文書の holds/notHolds と schema の乖離。語彙は「持つ/持たない」に加え
太字マーカー「**含む** / **除く**」も拾う (README.md の表記。見落とすと誤って
「文書未検出」skip になる — 実機で C-DATA-07 誤検知として判明し修正)。

## 根拠 (抽出元)

cernere-boundary (spec/data/*.md、README.md 含む) vs schema。

## evidence の取り方 / 判定可能性

文書抽出は静的可。意味的 diff は層C へ委譲。文書欠落時は skipped。
