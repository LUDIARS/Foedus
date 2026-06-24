# H-LINK-06 — connector 越境

- **severity**: medium
- **category**: linkage-contract

## 正とする状態

VantanHub connector は display 以外を永続化しない。

## 判定

connector が display 外を DB 書込していないか。

## 根拠 (抽出元)

hub plugins の DB 書込。

## evidence の取り方 / 判定可能性

connector 書込解析が必要で層B 未実装 → skipped。
