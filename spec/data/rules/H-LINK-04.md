# H-LINK-04 — discovery 到達性

- **severity**: low
- **category**: linkage-contract

## 正とする状態

Hub connector の接続先が corpus-service マニフェストを公開している。

## 判定

connector.connectsTo に対応する manifest (server/corpus.ts) が無ければ violation。

## 根拠 (抽出元)

hub-config(plugins) × service-manifest 集合。

## evidence の取り方 / 判定可能性

静的に判定可能 (低 severity / degraded)。
