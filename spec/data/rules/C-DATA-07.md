# C-DATA-07 — 境界文書同期

- **severity**: low
- **category**: meta

## 正とする状態

spec の「持つ/持たない」宣言と実 schema が一致する。

## 判定

boundary 文書の holds/notHolds と schema の乖離。

## 根拠 (抽出元)

cernere-boundary (spec/data/*.md) vs schema。

## evidence の取り方 / 判定可能性

文書抽出は静的可。意味的 diff は層C へ委譲。文書欠落時は skipped。
