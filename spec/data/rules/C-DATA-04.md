# C-DATA-04 — opt-out 伝播

- **severity**: medium
- **category**: data-boundary

## 正とする状態

opt-out → project_oauth_tokens 削除 → relay 失効が end-to-end で閉じる。

## 判定

user_data_optouts からの削除経路の到達性。

## 根拠 (抽出元)

cernere-registry + boundary + 削除経路。

## evidence の取り方 / 判定可能性

到達解析が必要で層B 未実装 → skipped (層C 横断フロー完全性で評価)。
