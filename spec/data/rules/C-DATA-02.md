# C-DATA-02 — 単一情報源 (PII)

- **severity**: high
- **category**: data-boundary

## 正とする状態

個人識別情報は Cernere 単一情報源。ローカルは owner_user_id (owner-ref) と display name キャッシュ (display-cache) のみ。

## 判定

ColumnFlag=personal-pii の列が allowlist 外で存在したら violation。

## 根拠 (抽出元)

service-schema + cernere-boundary の機微カラム台帳。

## evidence の取り方 / 判定可能性

静的に判定可能。
