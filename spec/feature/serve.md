# feature: serve (連結契約レポートの loopback 読み取り専用ビューア)

> `contract-check` / `roadmap-contract` が出す静的解析結果を Web から閲覧するための
> 軽量ビューア。 **被レビュー対象の dev server ではなく、 生成済み静的事実の閲覧専用**
> なので Foedus の「dev server 不要・静的解析」性格は保たれる。

## 目的

連結契約レポートを「Web から見える」状態にし、 LUDIARS サービスマップ (PORT-MAP /
ダッシュボード) に Foedus を 1 サービスとして載せる。 ブラウザで grade / 違反 /
skipped / 事業ライン別 grade を一覧できる。

## 設計

- `node:http` のみ (Hono/DB/外部依存なし)。 既定 `127.0.0.1:17340` bind (外部公開なし、
  LUDIARS PORT-MAP の loopback only レンジ 17000-17999)。
- 毎リクエストで `buildContractGraph → evaluateAll → buildReport` + `buildRoadmapContract`
  を再実行し常に最新を返す (キャッシュしない)。 静的解析は軽量なので許容。
- ルート:
  - `GET /` — HTML ビュー (`report/render-html.ts`、ダークテーマ、roadmap grade 表併載)
  - `GET /violations.json` — 機械可読レポート (contract-check と同一)
  - `GET /roadmap-contract.json` — 事業ライン別 index (unassigned 含む)
  - `GET /contract.md` — CONTRACT.md (markdown)
  - `GET /healthz` — `ok`
- `SIGINT`/`SIGTERM` で `server.close()` して綺麗に終了。

## CLI

```
foedus serve --root <Ars dir> [--port 17340] [--host 127.0.0.1] [--cernere-db-export f]
```

## サービスマップ登録

- `infra/PORT-MAP.md`: loopback only テーブルに `Foedus web | 17340 | FOEDUS_PORT` を追記
  (PORT-MAP は local-only 運用のため commit は別途確認)。
- LUDIARS ダッシュボード `LUDIARS/docs/data/services.json`: category=`infra` に `Foedus` を追加。
