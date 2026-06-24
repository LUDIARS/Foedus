# H-LINK-05 — data 露出整合

- **severity**: medium
- **category**: linkage-contract

## 正とする状態

Hub は manifest.data 宣言内のパスのみ中継する。

## 判定

宣言外パスの中継の有無。

## 根拠 (抽出元)

hub routes × manifest.data。

## evidence の取り方 / 判定可能性

plugin ルート列挙が必要で層B 未実装 → skipped。
