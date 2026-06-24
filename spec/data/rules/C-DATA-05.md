# C-DATA-05 — 機微暗号化境界

- **severity**: high
- **category**: security

## 正とする状態

totp_secret / google_*_token / *refresh* は暗号化ヘルパ (encryptSecret) 経由で書込。

## 判定

機微列が平文書込されていないか。

## 根拠 (抽出元)

cernere schema + 書込箇所。

## evidence の取り方 / 判定可能性

書込箇所の解析が必要で層B 未実装 → skipped。
