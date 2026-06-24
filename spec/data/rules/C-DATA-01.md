# C-DATA-01 — 単一情報源 (token)

- **severity**: high
- **category**: security

## 正とする状態

OAuth トークンは Cernere project_oauth_tokens に集約され、各サービスは自前保持しない。

## 判定

service-schema が ColumnFlag=oauth-token の列を検出したら violation。

## 根拠 (抽出元)

service localSchema (server/db.ts の CREATE TABLE)。

## evidence の取り方 / 判定可能性

静的に判定可能。
