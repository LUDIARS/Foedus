# H-LINK-01 — projectKey 実在性

- **severity**: high / low (3 段階、下記)
- **category**: linkage-contract

## 正とする状態

manifest.cernereProjectKey が Cernere managed_projects に登録されている (seed もしくは runtime/admin)。

## 判定 (3 段階)

manifest.cernereProjectKey を key とし、

1. `managedProjects`(seed/db-export) に存在 → **指摘なし**。
2. seed に無いが `Cernere/server/service/<key>/schema.json` テンプレートが存在
   (静的レジストリ = migrations のみのとき) → **low**。Cernere オンボード済みで
   managed_projects 行は runtime/admin 登録の蓋然性が高い。確定には `--cernere-db-export`。
3. seed にも service テンプレートにも痕跡なし → **high** (真のギャップ。project-token 発行不能)。

db-export 併合済み (registrySource='migrations+db-export') でなお不在なら、runtime 行も
見えているはずなのでテンプレート有無に関わらず **high**。

> この 3 段階は実機の H-LINK-01 追跡で判明: aedilis はテンプレートも seed も無く真のギャップ
> (high)、bibliotheca はテンプレート有りで runtime 登録の蓋然 (low)。

## 根拠 (抽出元)

service-manifest × cernere-registry(managed_projects シード + `server/service/*/` テンプレート)。

## evidence の取り方 / 判定可能性

静的に判定可能 (migrations primary)。runtime 登録分は --cernere-db-export で補完、未指定なら
不可視 / テンプレート有無を message に明示 (無言フォールバック禁止)。
