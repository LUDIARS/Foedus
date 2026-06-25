# feature: roadmap-contract (連結契約の事業ライン別投影)

> `contract-check` (§contract-check) が出す大域の Cernere↔Hub 連結契約を、
> LUDIARS 事業ライン別ロードマップ (`<root>/roadmap-*`) の構成サービスへ投影し、
> 各 `roadmap-<line>/data/contract.json` に書き出す層B の **派生出力**。

## 目的

事業ラインのロードマップ閲覧者が「このラインのサービスは Cernere↔Hub 連結契約上
どういう役割で、 どの finding に触れているか」をライン単位で把握できるようにする。
契約事実 (ルール評価) は `contract-check` と同一パイプラインを共有し、 本機能は
**振り分けるだけ** で新たな判定は足さない (契約の二重管理をしない)。

## 入力

- `contract-check` と同じ ContractGraph + 全 Violation (`evaluateAll`)。
- `<root>/roadmap-*/data/services.json` の `line` メタ + `members[]` (extract/roadmap.ts)。
  `roadmap-index` は集約専用で services.json を持たないので対象外。正本は各 roadmap-* の data。

## 投影ロジック (report/roadmap-slice.ts)

finding ごとに 2 種のリポ集合を計算する:

- **触れるリポ (表示用)**: evidence のパス先頭セグメント + subject token のうち既知リポに
  当たるもの。 空なら category/subject から infra へフォールバック (hub.* → Corpus/VantanHub、
  データ/oidc 系 → Cernere)。 値は捏造せず既知集合内のみ。
- **主体リポ (帰属用、 1 つ)**: subject/evidence の **非 infra** リポを最優先 (leaf/connector/
  relay が主体)。 無ければ infra へ。 finding はこの主体サービスが member であるライン
  **にのみ** 計上する → 共有 infra (Cernere) が他ラインのサービス固有ギャップを引きずらない。

各 member の役割は graph から決める:
`registry`(Cernere) / `hub:corpus` / `hub:vantanhub` / `leaf-service`(corpus.ts manifest あり) /
`service-no-manifest` / `connector-target`(VantanHub connector の接続先) / `relay-peer`(relay_pairs 端点)。
いずれでもない member は `outOfScope[]` に明示する。

member status は finding の最悪値: violation > unverified(skipped) > ok。
ライン grade は AIFormat 流用 (そのラインに帰属する violation の severity から導出)。

## 出力 (`<root>/roadmap-<line>/data/contract.json`)

```jsonc
{
  "generated": "YYYY-MM-DD", "line": "PERSONAL-AI", "scope": "Cernere+Hub",
  "source": "Foedus roadmap-contract",
  "global": { "grade", "violations", "skipped", "reposScanned", "registrySource", "oidcClientsSource" },
  "grade": "C",                       // ライン局所
  "summary": { "violations", "skipped", "bySeverity", "worst" },
  "members": [
    { "repo", "role", "manifest": { "corpusApi", "auth", "cernereProjectKey", "dataEndpoints", "panels", "source" } | null,
      "status": "ok|violation|unverified", "findings": [ { "id", "severity", "status", "message", "evidence" } ] }
  ],
  "outOfScope": [ "<連結契約に関与しない member repo>" ]
}
```

`--out <dir>` 指定時は集約 index `roadmap-contract.json` も書く (HTTP 非経由 consumer 用)。

## 無言フォールバック禁止

主体リポがどのラインの member にも属さない finding は **unassigned** として stderr +
index に明示する (どのラインにも計上されないことを握りつぶさない = RULE_CODE §7.1)。

## CLI

```
foedus roadmap-contract --root <Ars dir> [--cernere-db-export f.json] [--repos a,b] [--out <dir>] [--dry]
```

`--dry` は書き込まずに振り分け結果だけ表示。 既定で各 roadmap-* の data/contract.json を書く。

## consumer

- 各 `roadmap-<line>/scripts/build.mjs` が `data/contract.json` を読み「連結契約 (Foedus 層B)」
  節を `docs/index.html` に描画。
- `roadmap-index/aggregate.mjs` が grade+summary を `roadmaps.json` に畳む (Actio 等の可搬 consumer 用)。
