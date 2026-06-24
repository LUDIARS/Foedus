// spec/data/rules/<id>.md を生成する (1 ファイル 1 ルール)。 内容は設計書 §2.3 由来。
// 一度生成すれば手編集してよい (この生成器は雛形の初期化用)。

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'spec', 'data', 'rules');
mkdirSync(outDir, { recursive: true });

const rules = [
  ['C-DATA-01', 'high', 'security', '単一情報源 (token)',
    'OAuth トークンは Cernere project_oauth_tokens に集約され、各サービスは自前保持しない。',
    'service-schema が ColumnFlag=oauth-token の列を検出したら violation。',
    'service localSchema (server/db.ts の CREATE TABLE)。',
    '静的に判定可能。'],
  ['C-DATA-02', 'high', 'data-boundary', '単一情報源 (PII)',
    '個人識別情報は Cernere 単一情報源。ローカルは owner_user_id (owner-ref) と display name キャッシュ (display-cache) のみ。',
    'ColumnFlag=personal-pii の列が allowlist 外で存在したら violation。',
    'service-schema + cernere-boundary の機微カラム台帳。',
    '静的に判定可能。'],
  ['C-DATA-03', 'medium', 'data-boundary', 'キャッシュ越境',
    'display-cache 列は読み取り専用 (Cernere が権威)、書込系経路で source of truth 化しない。',
    'display-cache 列への書込ルートの有無。',
    'service-schema + ルート定義。',
    'ルート/ハンドラ解析が必要で層B 未実装 → skipped。'],
  ['C-DATA-04', 'medium', 'data-boundary', 'opt-out 伝播',
    'opt-out → project_oauth_tokens 削除 → relay 失効が end-to-end で閉じる。',
    'user_data_optouts からの削除経路の到達性。',
    'cernere-registry + boundary + 削除経路。',
    '到達解析が必要で層B 未実装 → skipped (層C 横断フロー完全性で評価)。'],
  ['C-DATA-05', 'high', 'security', '機微暗号化境界',
    'totp_secret / google_*_token / *refresh* は暗号化ヘルパ (encryptSecret) 経由で書込。',
    '機微列が平文書込されていないか。',
    'cernere schema + 書込箇所。',
    '書込箇所の解析が必要で層B 未実装 → skipped。'],
  ['C-DATA-06', 'medium', 'security', 'claim 最小化',
    'userinfo / connected は宣言 scope の属性のみ返す。',
    '宣言 scope 外の属性を返していないか。',
    'oidc-handler + scope 定義。',
    'OIDC ハンドラ解析が必要で層B 未実装 → skipped。'],
  ['C-DATA-07', 'low', 'meta', '境界文書同期',
    'spec の「持つ/持たない」宣言と実 schema が一致する。',
    'boundary 文書の holds/notHolds と schema の乖離。',
    'cernere-boundary (spec/data/*.md) vs schema。',
    '文書抽出は静的可。意味的 diff は層C へ委譲。文書欠落時は skipped。'],
  ['H-LINK-01', 'high', 'linkage-contract', 'projectKey 実在性',
    'manifest.cernereProjectKey が Cernere managed_projects に存在する。',
    'manifest.cernereProjectKey ∉ managedProjects(keys) なら violation。',
    'service-manifest × cernere-registry(managed_projects)。',
    '静的に判定可能 (migrations primary)。runtime 登録分は --cernere-db-export で補完、未指定なら不可視を message に明示。'],
  ['H-LINK-02', 'high', 'linkage-contract', 'auth モード整合',
    "manifest.auth='cernere-project-token' のとき Hub も project-token を発行できる。",
    "manifest.auth='cernere-project-token' かつ Hub 既定 token-mode≠'cernere-project-token' なら violation。",
    'service-manifest.auth × hub-config.tokenModeDefault (.env.example CORPUS_TOKEN_MODE)。',
    '静的に判定可能。'],
  ['H-LINK-03', 'medium', 'linkage-contract', 'redirect_uri 整合',
    'oidc_clients.redirect_uris と service publicUrl が一致する。',
    'redirect_uris と publicUrl の突合。',
    'cernere-registry(oidc_clients) × env。',
    'oidc_clients は runtime 登録 (migrations CREATE のみ)。--cernere-db-export 無し→skipped。publicUrl 未抽出のため現状は常に skipped。'],
  ['H-LINK-04', 'low', 'linkage-contract', 'discovery 到達性',
    'Hub connector の接続先が corpus-service マニフェストを公開している。',
    'connector.connectsTo に対応する manifest (server/corpus.ts) が無ければ violation。',
    'hub-config(plugins) × service-manifest 集合。',
    '静的に判定可能 (低 severity / degraded)。'],
  ['H-LINK-05', 'medium', 'linkage-contract', 'data 露出整合',
    'Hub は manifest.data 宣言内のパスのみ中継する。',
    '宣言外パスの中継の有無。',
    'hub routes × manifest.data。',
    'plugin ルート列挙が必要で層B 未実装 → skipped。'],
  ['H-LINK-06', 'medium', 'linkage-contract', 'connector 越境',
    'VantanHub connector は display 以外を永続化しない。',
    'connector が display 外を DB 書込していないか。',
    'hub plugins の DB 書込。',
    'connector 書込解析が必要で層B 未実装 → skipped。'],
  ['H-LINK-07', 'medium', 'linkage-contract', 'corpusApi 整合',
    'manifest.corpusApi / panel.kind が Corpus normalize と互換である。',
    'manifest.corpusApi > Corpus supportedCorpusApi、または panel.kind が {declarative,script} 外なら violation。',
    'service-manifest × Corpus/server/hub/manifest.ts (normalize)。',
    '静的に判定可能。'],
  ['H-LINK-08', 'low', 'linkage-contract', 'relay 双方向同意',
    'relay_pairs が両 service の manifest で前提化されている。',
    '両 service の manifest が peer を前提化しているか。',
    'cernere-registry(relay_pairs) × service-manifest 集合。',
    '両 service のマニフェスト未発見時は skipped。'],
];

for (const [id, severity, category, title, ideal, judge, evidence, status] of rules) {
  const path = join(outDir, `${id}.md`);
  const body = `# ${id} — ${title}

- **severity**: ${severity}
- **category**: ${category}

## 正とする状態

${ideal}

## 判定

${judge}

## 根拠 (抽出元)

${evidence}

## evidence の取り方 / 判定可能性

${status}
`;
  writeFileSync(path, body, 'utf8');
}

console.log(`[gen-rule-specs] wrote ${rules.length} rule specs to ${outDir}`);
