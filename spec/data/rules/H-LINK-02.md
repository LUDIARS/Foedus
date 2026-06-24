# H-LINK-02 — auth モード整合

- **severity**: high
- **category**: linkage-contract

## 正とする状態

manifest.auth='cernere-project-token' のとき Hub も project-token を発行できる。

## 判定

manifest.auth='cernere-project-token' の leaf が project-token を受理できない2要因:

1. **token-mode 不一致**: Hub 既定 token-mode≠'cernere-project-token' (passthrough のまま)。
2. **plugin proxy バイパス**: VantanHub plugin proxy 経路 (shared.ts) は Corpus の
   TokenProvider を経由せず Bearer を素通しするため、 当該 leaf が plugin 接続先のときは
   token-mode を正しくしても発行されない → mode が正しくても violation (plugin 側配線が必要)。

## 根拠 (抽出元)

service-manifest.auth × hub-config.tokenModeDefault × vantanhub.plugins.connectsTo
(.env.example CORPUS_TOKEN_MODE / VantanHub/plugins/shared.ts)。

## evidence の取り方 / 判定可能性

静的に判定可能。
