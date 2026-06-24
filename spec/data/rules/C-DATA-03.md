# C-DATA-03 — キャッシュ越境

- **severity**: medium
- **category**: data-boundary

## 正とする状態

display-cache 列は読み取り専用 (Cernere が権威)、書込系経路で source of truth 化しない。

## 判定

display-cache 列への書込ルートの有無。

## 根拠 (抽出元)

service-schema + ルート定義。

## evidence の取り方 / 判定可能性

ルート/ハンドラ解析が必要で層B 未実装 → skipped。
