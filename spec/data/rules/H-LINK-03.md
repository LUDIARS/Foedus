# H-LINK-03 — redirect_uri 整合

- **severity**: medium
- **category**: linkage-contract

## 正とする状態

oidc_clients.redirect_uris と service publicUrl が一致する。

## 判定

redirect_uris と publicUrl の突合。

## 根拠 (抽出元)

cernere-registry(oidc_clients) × env。

## evidence の取り方 / 判定可能性

oidc_clients は runtime 登録 (migrations CREATE のみ)。--cernere-db-export 無し→skipped。publicUrl 未抽出のため現状は常に skipped。
