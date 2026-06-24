# C-DATA-06 — claim 最小化

- **severity**: medium
- **category**: security

## 正とする状態

userinfo / connected は宣言 scope の属性のみ返す。

## 判定

宣言 scope 外の属性を返していないか。

## 根拠 (抽出元)

oidc-handler + scope 定義。

## evidence の取り方 / 判定可能性

OIDC ハンドラ解析が必要で層B 未実装 → skipped。
