# Foedus (`Fd`)

Cernere ↔ Hub 連結契約の **横断静的チェッカー (層B)**。LUDIARS の各サービスが
公開する `corpusManifest` (provider) と、Cernere の registry / Hub の連結設定
(consumer) を **リポをまたいで突合** し、連結契約のドリフトを決定的に検出する CLI。

- 盟約 = サービス間契約の検査器。特定サービスに同居させず独立リポに置く
  (被レビュー対象が検査器を持つ逆転を避ける)。
- **dev server を起動しない** — 全て静的解析 (migrations SQL / `server/corpus.ts` /
  `server/db.ts` / Corpus・VantanHub の設定)。
- **無言フォールバック禁止** (RULE_CODE §7.1): 静的に取れない入力 (oidc_clients の
  runtime 登録等) は値を捏造せず `status:'skipped'` で明示する。

詳細仕様: [`spec/feature/contract-check.md`](spec/feature/contract-check.md) /
ルール定義: [`spec/data/rules/`](spec/data/rules/) / 設計正本:
`../review/cernere-hub-review-DESIGN.md` §2。

## 使い方

```sh
npm install
npm run build              # esbuild で dist/cli.js を生成
node dist/cli.js contract-check --root E:/Document/Ars --out review/Cernere-Hub/2026-06-24
```

### オプション

| オプション | 説明 |
|---|---|
| `--root <dir>` | 走査ルート (必須、例 `E:/Document/Ars`) |
| `--repos a,b,c` | 対象サービスを絞る (既定: `server/corpus.ts` 保有リポ全部) |
| `--cernere-db-export <f.json>` | runtime 登録分 (managed_projects / oidc_clients / relay_pairs) を JSON 補完 |
| `--json` / `--md` | 片方のみ出力 (`--out` 無しなら stdout) |
| `--out <dir>` | `violations.json` + `CONTRACT.md` を出力 |
| `--ci` | critical/high 違反があれば exit 1 (既定は常に 0) |

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
  extract/                         5 抽出器 (cernere-registry / cernere-boundary /
                                   service-manifest / service-schema / hub-config) + index
  rules/{data-rules,linkage-rules,registry}.ts   C-DATA-01〜07 / H-LINK-01〜08
  report/{violations,grade,render-md}.ts          集計 / グレード / CONTRACT.md
  cli.ts
```

## テスト

```sh
npm test          # vitest (fixtures は test/fixtures/、実リポ非依存)
npm run typecheck
```

## CI / 定期実行 (GitHub Actions)

### `ci.yml` — Foedus 自身の CI

push / pull_request (`main`) で `npm ci` → `npm run typecheck` → `npm run build`
→ `npm test` を回す。Foedus は本番依存を持たない (esbuild は devDependency 兼
runtime) ため `npm audit --omit=dev` は対象が無く実施しない。

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
- **`--ci` 挙動**: critical/high 違反で `exit 1` → ジョブ fail (ゲート)。
  `violations.json` / `CONTRACT.md` は `actions/upload-artifact` で
  `foedus-contract-report` として常に保存する。
- 将来 high 検出時に Discord 通知を足す余地を workflow のコメントに残してある。
