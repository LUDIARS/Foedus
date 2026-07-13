# Foedus (`Fd`)

Cernere ↔ Hub 連結契約の **横断静的チェッカー (層B)**。LUDIARS の各サービスが
公開する `corpusManifest` (provider) と、Cernere の registry / Hub の連結設定
(consumer) を **リポをまたいで突合** し、連結契約のドリフトを決定的に検出する CLI。

- 盟約 = サービス間契約の検査器。特定サービスに同居させず独立リポに置く
  (被レビュー対象が検査器を持つ逆転を避ける)。
- **dev server を起動しない** — 全て静的解析 (migrations SQL / `server/corpus.ts` /
  `server/db.ts` / Corpus・VantanHub の設定)。外部管理スキーマ (下記) のみ例外的に
  Cernere への HTTP 取得を行う。
- **無言フォールバック禁止** (RULE_CODE §7.1): 静的に取れない入力 (oidc_clients の
  runtime 登録等) は値を捏造せず `status:'skipped'` で明示する。

詳細仕様: [`spec/feature/contract-check.md`](spec/feature/contract-check.md) /
ルール定義: [`spec/data/rules/`](spec/data/rules/) / 設計正本:
`../review/cernere-hub-review-DESIGN.md` §2。

## 使い方

```sh
npm install
npm run build              # esbuild で dist/cli.js を生成
export CERNERE_BASE_URL=http://localhost:8787
export FOEDUS_CERNERE_EXPORT_TOKEN=<admin または project/service token>
node dist/cli.js contract-check --root E:/Document/Ars --out review/Cernere-Hub/2026-06-24
```

### 外部管理スキーマ (Cernere schema-export) — 必須環境変数

Foedus は外部登録プロジェクトスキーマ (旧 `schemas/*.json`、例: vantan_user の
`department_name`/`grade`/`name`/`desired_job` 等の per-user プロフィール列) を
**自リポに恒久コミットしない**。PII フィールド構造の恒久記録それ自体がデータ露出/
解析対象面のリスクになるため、Cernere を単一情報源として contract-check 実行の
たびに **ライブ取得**する (`src/extract/cernere-schema-client.ts`)。

| 環境変数 | 必須 | 説明 |
|---|---|---|
| `CERNERE_BASE_URL` | ○ (`--skip-external-schema` 無指定時) | Cernere の到達先 (例 `http://localhost:8787`) |
| `FOEDUS_CERNERE_EXPORT_TOKEN` | ○ (同上) | `GET /api/admin/projects/schema-export` 用 Bearer token (admin または project/service token) |

いずれか未設定・Cernere に到達不能な場合、contract-check は **fail-fast で
即エラー終了**する (無言で空データにはしない)。Cernere に到達できないことが
分かっている環境 (例: 現状の scheduled-review CI, 下記参照) でのみ、
`--skip-external-schema` を明示指定して degraded 実行 (外部管理スキーマの棚卸し
C-DATA-08 を省略) を選べる。

### オプション

| オプション | 説明 |
|---|---|
| `--root <dir>` | 走査ルート (必須、例 `E:/Document/Ars`) |
| `--repos a,b,c` | 対象サービスを絞る (既定: `server/corpus.ts` 保有リポ全部) |
| `--cernere-db-export <f.json>` | runtime 登録分 (managed_projects / oidc_clients / relay_pairs) を JSON 補完 |
| `--json` / `--md` | 片方のみ出力 (`--out` 無しなら stdout) |
| `--out <dir>` | `violations.json` + `CONTRACT.md` を出力 |
| `--ci` | critical/high 違反または manifest 抽出が degraded なら exit 1 (既定は常に 0) |
| `--skip-external-schema` | 外部管理スキーマ (Cernere schema-export) のライブ取得を明示スキップ (Cernere 未到達環境向け degraded モード) |

`--cernere-db-export` の JSON 形:

```json
{
  "managedProjects": [{ "key": "aedilis", "isActive": true }],
  "oidcClients": [{ "clientId": "cf-access", "redirectUris": ["https://..."], "scopes": ["openid"] }],
  "relayPairs": [{ "from": "a", "to": "b", "bidirectional": true }]
}
```

## アーキテクチャ

```
src/
  model/contract-graph.ts          中間表現 (ContractGraph) + 閉じた ColumnFlag enum
  extract/                         抽出器 (cernere-registry / cernere-boundary /
                                   service-manifest / service-schema / hub-config /
                                   cernere-schema-client [HTTP] + external-project-schema
                                   [変換]) + index
  rules/{data-rules,linkage-rules,registry}.ts   C-DATA-01〜08 / H-LINK-01〜08
  report/{violations,grade,render-md}.ts          集計 / グレード / CONTRACT.md
  cli.ts
```

## テスト

```sh
npm test          # vitest (fixtures は test/fixtures/、実リポ非依存。
                   # 外部管理スキーマ (Cernere schema-export) は fetch モックで検証し
                   # 実ネットワーク/実 Cernere には接続しない)
npm run typecheck
```

## CI / 定期実行 (GitHub Actions)

### `ci.yml` — Foedus 自身の CI

push / pull_request (`main`) で `npm ci` → `npm run typecheck` → `npm run build`
→ `npm test` を回す。`npm test` は Cernere schema-export を fetch モックで検証する
ため、実 Cernere への到達性は不要 (このジョブは影響を受けない)。Foedus は本番依存を
持たない (esbuild は devDependency 兼 runtime) ため `npm audit --omit=dev` は対象が
無く実施しない。

### `scheduled-review.yml` — 横断契約レビュー (定期 + 手動)

LUDIARS の各サービスを sibling 配置で checkout し、Foedus を build した上で
`node dist/cli.js contract-check --root <scan-root> --json --md --ci` を実行する
連結契約ゲート。

- **トリガ**: `schedule` = 毎週月曜 **08:00 JST** (= 日曜 23:00 UTC、cron `0 23 * * 0`)
  + `workflow_dispatch` (手動)。
- **スキャン対象リポ** (LUDIARS org):

  | リポ | 可視性 | 役割 |
  |---|---|---|
  | Cernere | public | registry / OIDC / 個人データ境界の権威 |
  | Corpus | public | Hub 連結設定 |
  | VantanHub | **private** | Hub 連結設定 (PAT 必須、下記参照) |
  | Aedilis | public | `server/corpus.ts` 保有サービス (provider) |
  | Bibliotheca | public | `server/corpus.ts` 保有サービス (provider) |

- **private リポ (VantanHub) の扱い**: public リポは既定トークンで取得できるが、
  private の VantanHub は read 権限を持つ PAT が必要。Secrets に
  `LUDIARS_REPO_TOKEN` (org `repo:read` 相当の Fine-grained PAT) を設定すると
  VantanHub も対象に含める。未設定時は **無言で落とさず** `::warning::` を出して
  VantanHub をスキップし、残りの public リポのみで契約チェックする
  (RULE_CODE §7.1: 無言フォールバック禁止)。
- **既知のギャップ: 外部管理スキーマ (Cernere schema-export) のライブ取得**。
  このワークフローは Cernere を **ソースとして checkout するだけ** で、実行中の
  Cernere サーバーには到達できない (reachable staging/dev Cernere の仕組みが
  この org にまだ無い)。そのため `secrets.FOEDUS_CERNERE_EXPORT_TOKEN` が未設定の
  間は、ワークフローが自動的に `--skip-external-schema` を付与し **C-DATA-08
  (外部管理スキーマの個人データ棚卸し) を省略した degraded 実行** になる
  (`::warning::` で明示、VantanHub skip と同一パターン)。到達可能な staging
  Cernere を用意するか CI 専用の export token を発行し、Secrets に
  `FOEDUS_CERNERE_EXPORT_TOKEN`、repository/organization variables に
  `CERNERE_BASE_URL` を設定すれば自動的にライブ取得へ切り替わる (人間の対応が
  必要な既知のギャップとしてワークフロー冒頭にも明記してある)。
- **`--ci` 挙動**: critical/high 違反または manifest 抽出の `degraded` で `exit 1` → ジョブ fail (ゲート)。
  `violations.json` / `CONTRACT.md` は `actions/upload-artifact` で
  `foedus-contract-report` として常に保存する。
- 将来 high 検出時に Discord 通知を足す余地を workflow のコメントに残してある。
