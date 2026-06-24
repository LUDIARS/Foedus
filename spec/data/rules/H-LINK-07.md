# H-LINK-07 — corpusApi 整合

- **severity**: medium
- **category**: linkage-contract

## 正とする状態

manifest.corpusApi / panel.kind が Corpus normalize と互換である。

## 判定

manifest.corpusApi > Corpus supportedCorpusApi、または panel.kind が {declarative,script} 外なら violation。

## 根拠 (抽出元)

service-manifest × Corpus/server/hub/manifest.ts (normalize)。

## evidence の取り方 / 判定可能性

静的に判定可能。
