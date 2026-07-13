# feature: contract-check (層B — 横断契約チェッカー)

> 本書は `review/cernere-hub-review-DESIGN.md` §2 の正本コピー (Foedus 側の仕様アンカー)。
> Foedus は Cernere のデータの持ち方と Hub (Corpus/VantanHub) の連結設計の
> **連結契約の一致** を決定的 (非 LLM) に静的検査する CLI。

## 目的

リポをまたいだ「連結契約の一致」を機械検出する。provider (各サービスの
`server/corpus.ts` の `corpusManifest`) ↔ consumer (Cernere の registry / Hub の
連結設定) の二側から事実を抽出し突合する。dev server は起動しない (全て静的解析)。

## パイプライン

```
抽出 (extract/) → ContractGraph (model/) → ルール評価 (rules/) → 集計 (report/) → violations.json + CONTRACT.md
```

## 抽出器 (src/extract/)

| 抽出器 | 入力 | 静的不能時 |
|---|---|---|
| cernere-registry | `Cernere/migrations/*.sql` の INSERT (managed_projects / oidc_clients / relay_pairs) | `--cernere-db-export` で補完。無ければ oidc_clients は `runtime-unknown` |
| cernere-boundary | `Cernere/spec/data/*.md` の持つ/持たない + `schema.ts` の機微カラム | 境界文書欠落は C-DATA-07 skipped |
| service-manifest | 各 `server/corpus.ts` の `export const corpusManifest` | TypeScript AST で純粋なリテラルだけを抽出。評価・import は行わず、読めない manifest は理由付き `skipped` |
| service-schema | 各 `server/db.ts` の CREATE TABLE | 解析不能テーブルは tables:[] |
| hub-config | Corpus の token-mode/discovery/supportedCorpusApi + VantanHub plugins の connector/`*_BASE_URL` | env 未設定は `envSet:false` (degraded) |

`corpusManifest` は純粋なリテラルのみ受理する。走査対象は信頼しないため bundle / import / eval は一切行わず、
非リテラル・構文不正・不正値は machine-readable な `manifestScan.status:'degraded'` と `skipped[].reason` に記録する。

## ルール (src/rules/)

閉じた集合。`registry.ts` は静的配列 + switch で列挙 (プラグイン機構なし = OCP)。
各ルールは `ContractGraph → Violation[]` の純関数。判定不能は `status:'skipped'` を明示。

- データの持ち方: C-DATA-01〜07 (`spec/data/rules/C-DATA-*.md`)
- Hub 連結設計: H-LINK-01〜08 (`spec/data/rules/H-LINK-*.md`)

## 出力 (src/report/)

- `violations.json`: `{date, scope, reposScanned, registrySource, grade, violations[], skipped[], bySeverity, counts, manifestScan}`
- `CONTRACT.md`: severity 別表 + skipped 別節
- grade: critical≥1→D / high≥1→C / medium|low→B / 0→A (skipped は減点しない)
- 終了コード: `--ci` 指定時は critical/high または `manifestScan.status:'degraded'` で exit 1。既定はレポートを出力して 0

## CLI

```
foedus contract-check --root <Ars dir> [--repos a,b] [--cernere-db-export f.json]
                      [--json|--md] [--out <dir>] [--ci]
```

## 既知ライブ finding (設計時点)

- `H-LINK-01`: Aedilis/Bibliotheca の `cernereProjectKey` が managed_projects シードに不在 (High)
- `H-LINK-07`: `corpusApi:2` / declarative panel と現行 Corpus normalize (corpusApi 1) の非互換 (Medium)
- `H-LINK-02`: `auth='cernere-project-token'` だが Hub 既定 token-mode が passthrough (High)
