# H-LINK-01 — projectKey 実在性

- **severity**: high
- **category**: linkage-contract

## 正とする状態

manifest.cernereProjectKey が Cernere managed_projects に存在する。

## 判定

manifest.cernereProjectKey ∉ managedProjects(keys) なら violation。

## 根拠 (抽出元)

service-manifest × cernere-registry(managed_projects)。

## evidence の取り方 / 判定可能性

静的に判定可能 (migrations primary)。runtime 登録分は --cernere-db-export で補完、未指定なら不可視を message に明示。
