# データ常駐パターン選択ガイダンス (Cernere 埋込 vs 自前 DB)

LUDIARS の各サービスが「あるデータをどこに持つか」を決めるための設計基準。
Foedus が静的検査する連結契約 (C-DATA / H-LINK) の**背景にある設計意図**を明文化し、
新規サービス設計時・既存サービスのスキーマ追加時に参照する。

正本の検査仕様は [`contract-check.md`](contract-check.md)、ルール定義は
[`../data/rules/`](../data/rules/)。本書はそれらに従うための**設計時の判断ガイド**であり、
検査ロジックそのものではない。

---

## 1. 前提 — Cernere 単一情報源契約

LUDIARS の個人データは **Cernere を単一情報源 (single source of truth)** とする。
各サービスは個人データを自前で複製・保持しない。これは Foedus の `C-DATA-*` ルール群が
静的に強制する不変条件であり、本ガイダンスの全パターンの土台になる。

Foedus は各サービスの `server/db.ts` (CREATE TABLE) の列を、閉じた集合
`ColumnFlag` で分類する (`src/model/contract-graph.ts`):

| ColumnFlag | 意味 | 自前 DB 保持の可否 |
|---|---|---|
| `oauth-token` | access/refresh/oauth トークン | **不可** (C-DATA-01 violation) |
| `password` | password / *_secret / secret_hash 等の資格情報 | **不可** |
| `personal-pii` | email / phone / 住所等の個人識別情報 | **不可** (C-DATA-02 violation) |
| `owner-ref` | `owner_user_id` / `user_id` 等 Cernere sub 参照 | **可** (allowlist) |
| `display-cache` | display name 等の表示用キャッシュ | **可** (allowlist) |
| `plain` | 上記いずれでもない (ドメインデータ) | **可** |

要するに **「誰のものか (owner-ref)」と「表示名キャッシュ (display-cache)」以外の
個人データは自前 DB に置けない**。それ以外のドメインデータは自由に持てる。

---

## 2. 3 つの常駐パターン

データの持ち方は次の 3 択になる。前 2 つが正、3 つ目は禁止 (Foedus が violation 化)。

### パターン A — 自前サービス DB (ドメインデータの既定)

サービスが自分の `server/db.ts` (SQLite 等) にドメインデータを持つ。個人データは
`owner-ref` + `display-cache` の allowlist 列のみに留め、PII/token は Cernere に委ねる。

- **例**: Aedilis (予約)、Bibliotheca。`reservation(id, owner_user_id, ...)` +
  `user_display_cache(user_id, name)` のように、本体はドメイン列 + owner-ref、
  個人情報は持たない (`test/fixtures/root/Aedilis/server/db.ts` 参照)。
- **認証**: `server/corpus.ts` の `corpusManifest` で
  `auth: 'cernere-project-token'` + `cernereProjectKey: '<key>'` を宣言し、
  Cernere `managed_projects` に登録する (H-LINK-01)。
- **使うべき時**: サービス固有のドメインデータ (予約・蔵書・スコア等) が中心で、
  他サービスと共有する必要が薄いもの。**ほとんどのケースはこれが既定**。

### パターン B — Cernere `project_data_<key>` 委託

サービス固有でも、Cernere 側に動的テーブル `project_data_<key>` として預ける。
Cernere は schema 側にこのテーブルを定義せず (静的スキーマ非依存)、**各サービスが
自分の spec で「何を預けているか」を文書化する** (`Cernere/spec/data/boundary.md` の
「除く (委託データ)」節)。

- **使うべき時**: Cernere のセッション/認証文脈に密結合したデータ、または Cernere を
  経由して複数サービスが読む必要があり、自前 DB を建てるほどでもない動的データ。
- **注意**: Cernere の静的スキーマには現れないため、Foedus の境界検査からは
  「委託データ」として spec 文書側で同期を取る (下記 C-DATA-07)。

### パターン C — 自前 DB に PII/token 保持 (**禁止 / anti-pattern**)

サービスが `tokens(access_token, refresh_token)` や `contacts(email, phone)` を
自前 DB に持つ。**これは設計違反**で、Foedus が `C-DATA-01` (token) /
`C-DATA-02` (PII) として検出する (`test/fixtures/root/Leak/server/db.ts` が反例)。

---

## 3. 選択フロー

```
そのデータは個人識別情報 (email/phone/住所) か、 OAuth トークン/資格情報か？
├─ はい → Cernere に集約。 自前 DB には置かない。
│         自前 DB に必要なのは owner_user_id (owner-ref) と
│         必要なら display name キャッシュ (display-cache) だけ。
└─ いいえ (ドメインデータ) →
     Cernere のセッション/認証文脈に密結合、 または複数サービスが
     Cernere 経由で読む動的データか？
     ├─ はい → パターン B: Cernere project_data_<key> に委託 (spec に文書化)
     └─ いいえ → パターン A: 自前サービス DB に持つ (既定)
```

---

## 4. パターン別チェックリストと検査ルール対応

### パターン A (自前 DB) を選んだら
- [ ] `server/db.ts` の個人データ列は `owner-ref` / `display-cache` のみ
      (PII/token 列を作らない) → `C-DATA-01` / `C-DATA-02`
- [ ] `server/corpus.ts` に `auth: 'cernere-project-token'` +
      `cernereProjectKey` を宣言 → `H-LINK-01` (managed_projects 登録)
- [ ] 表示名等は Cernere から取得しキャッシュ (display-cache)、原本を複製しない

### パターン B (project_data 委託) を選んだら
- [ ] サービスの spec/data 文書に「Cernere に何を委託しているか」を明記
- [ ] Cernere の境界宣言 (「含む/除く」) と整合させる → `C-DATA-07` (境界文書同期)

### 共通
- [ ] 静的に判定できない入力 (runtime 登録分等) は値を捏造せず、設計上も
      `status:'skipped'` 相当の「未確定」を明示する (RULE_CODE §7.1 無言フォールバック禁止)

---

## 5. 参照

- 検査仕様正本: [`contract-check.md`](contract-check.md)
- ルール定義: [`../data/rules/C-DATA-01.md`](../data/rules/C-DATA-01.md) (token 単一情報源) /
  [`C-DATA-02.md`](../data/rules/C-DATA-02.md) (PII 単一情報源) /
  [`C-DATA-07.md`](../data/rules/C-DATA-07.md) (境界文書同期) /
  [`H-LINK-01.md`](../data/rules/H-LINK-01.md) (cernereProjectKey の managed_projects 登録)
- 分類モデル: `src/model/contract-graph.ts` (`ColumnFlag` 閉じた enum)
- 反例 fixtures: `test/fixtures/root/Aedilis` (パターン A の正例) /
  `test/fixtures/root/Leak` (パターン C の違反例)
- 個人データ単一情報源の原則: Cernere `spec/data/boundary.md`
