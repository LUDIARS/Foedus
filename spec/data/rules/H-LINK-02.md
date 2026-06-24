# H-LINK-02 — auth モード整合

- **severity**: high
- **category**: linkage-contract

## 正とする状態

manifest.auth='cernere-project-token' のとき Hub も project-token を発行できる。

## 判定

manifest.auth='cernere-project-token' かつ Hub 既定 token-mode≠'cernere-project-token' なら violation。

## 根拠 (抽出元)

service-manifest.auth × hub-config.tokenModeDefault (.env.example CORPUS_TOKEN_MODE)。

## evidence の取り方 / 判定可能性

静的に判定可能。
