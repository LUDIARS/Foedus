# Cernere データ境界

- Cernere は OAuth トークン (project_oauth_tokens) を持つ
- Cernere は TOTP secret を持つ
- 各サービスは個人データを持たない (owner_user_id と display name キャッシュのみ)

## スコープ（含む / 除く）

- **含む**: Cernere が定義・所有する静的テーブル群。
- **除く（委託データ）**: 動的 project_data_<key> テーブルは各サービス側で文書化する。
