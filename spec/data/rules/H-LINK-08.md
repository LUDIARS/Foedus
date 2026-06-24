# H-LINK-08 — relay 双方向同意

- **severity**: low
- **category**: linkage-contract

## 正とする状態

relay_pairs が両 service の manifest で前提化されている。

## 判定

両 service の manifest が peer を前提化しているか。

## 根拠 (抽出元)

cernere-registry(relay_pairs) × service-manifest 集合。

## evidence の取り方 / 判定可能性

両 service のマニフェスト未発見時は skipped。
