// 中間表現 (ContractGraph) と関連型 — 設計書 §2.2 / §2.3。
//
// 抽出器が組み立て、 ルールが純関数で評価する単一の事実モデル。 ここには
// 振る舞いを持たせない (型と列挙のみ)。 ColumnFlag は **閉じた enum** であり
// 分類は switch で行う (OCP closed-enum: registry 不要)。

// ── 列の機微分類 (閉じた集合) ────────────────────────────────────────────────

export type ColumnFlag =
  | 'oauth-token' // access/refresh/oauth トークンの自前保持
  | 'password' // password / *_secret / secret_hash 等の資格情報
  | 'personal-pii' // email / phone / 住所等の個人識別情報
  | 'display-cache' // display name 等の表示用キャッシュ (allowlist)
  | 'owner-ref' // owner_user_id / user_id 等 Cernere sub 参照 (allowlist)
  | 'plain'; // 上記いずれでもない

// ── Violation ───────────────────────────────────────────────────────────────

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Category = 'data-boundary' | 'linkage-contract' | 'security' | 'meta';

/** status='skipped' は入力不足で判定不能であることを **明示** する (無言フォールバック禁止)。 */
export type ViolationStatus = 'violation' | 'skipped';

export interface Violation {
  id: string; // 'H-LINK-01'
  severity: Severity;
  category: Category;
  subject: string; // 'aedilis' / 'Cernere.project_oauth_tokens'
  message: string;
  evidence: string[]; // ['Aedilis/server/corpus.ts:240', 'Cernere/migrations/']
  expected: string;
  actual: string;
  status: ViolationStatus;
}

// ── Cernere レジストリ / 境界モデル ──────────────────────────────────────────

export type RegistrySource = 'migrations' | 'migrations+db-export';

export interface ManagedProject {
  key: string;
  clientIdPresent: boolean;
  isActive: boolean;
  schemaDefinitionPresent: boolean;
  source: 'migrations' | 'db-export';
  evidence: string;
}

export interface OidcClient {
  clientId: string;
  redirectUris: string[];
  scopes: string[];
  isActive: boolean;
  source: 'static' | 'db-export';
}

export interface RelayPair {
  from: string;
  to: string;
  bidirectional: boolean;
  isActive: boolean;
  source: 'migrations' | 'db-export';
  evidence: string;
}

export interface ColumnRef {
  table: string;
  column: string;
  flag: ColumnFlag;
}

/**
 * Cernere 汎用プロジェクトスキーマ機構 (`projectDefinitionSchema`) に外部登録される
 * `user_data.columns`。 実体は Cernere 側の `project_data_<key>` テーブルであり、
 * per-service ローカル schema (ServiceNode.localSchema) とは別モデル。 Foedus はこれを
 * 自リポに恒久コミットせず、 `GET /api/admin/projects/schema-export` から contract-check
 * 実行のたびにライブ取得する (cernere-schema-client.ts / external-project-schema.ts)。
 * スキーマ定義の実体は常に Cernere が単一情報源。
 */
/**
 * project.data_sharing 由来の共有先。 Cernere `dataShareDefinitionSchema`
 * (Cernere/server/src/project/schema.ts) と同形。 access は抽出時点で
 * デフォルト解決済みの値として保持する (report/render 側で再度デフォルト処理しない)。
 */
export interface ExternalDataShare {
  projectKey: string;
  modules?: string[];
  access: 'read' | 'readwrite';
  description?: string;
}

export interface ExternalProjectSchema {
  key: string;
  file: string; // 由来ソースの表示用ラベル (evidence 表示用) — 現在は 'Cernere schema-export (key=<key>)' 形式
  columns: { column: string; flag: ColumnFlag }[];
  /** data_sharing 未記載を空配列と区別するため optional。 */
  dataSharing?: ExternalDataShare[];
}

export interface CernereModel {
  managedProjects: ManagedProject[];
  oidcClients: OidcClient[];
  /** 'runtime-unknown' = migrations は CREATE のみで seed 無し → 静的に列挙不能。 */
  oidcClientsSource: 'static' | 'runtime-unknown' | 'db-export';
  /**
   * `Cernere/server/service/<key>/` に schema.json テンプレートを持つサービスキー
   * (_template 除く)。 managed_projects 行そのものではなく **オンボード済みの弱い
   * シグナル**。 seed 不在でもテンプレートがあれば runtime/admin 登録の蓋然性が高い。
   */
  serviceTemplates: string[];
  relayPairs: RelayPair[];
  boundary: { holds: string[]; notHolds: string[]; docFiles: string[] };
  personalDataColumns: ColumnRef[];
  registrySource: RegistrySource;
  /** Foedus `schemas/*.json` からオーサリングされた外部管理 Cernere プロジェクトスキーマ。 */
  externalProjectSchemas: ExternalProjectSchema[];
}

// ── サービス manifest / schema モデル ────────────────────────────────────────

export interface ManifestDataEndpoint {
  id: string;
  path: string;
  scope: 'local' | 'multi';
}

export interface ManifestPanel {
  id: string;
  kind: string; // 'declarative' | 'script' | ...
}

export interface Manifest {
  service: string;
  displayName?: string;
  version?: string;
  corpusApi: number;
  auth: string;
  cernereProjectKey?: string;
  data: ManifestDataEndpoint[];
  panels: ManifestPanel[];
}

export type ManifestSource = 'literal-eval' | 'ast' | 'static-file' | 'missing';

export interface ServiceTable {
  name: string;
  columns: { name: string; flags: ColumnFlag[] }[];
}

export interface ServiceNode {
  repo: string;
  projectCode?: string;
  manifestFile?: string;
  manifest: Manifest | null;
  manifestSource: ManifestSource;
  localSchema: { tables: ServiceTable[]; schemaFile?: string };
}

// ── Hub 連結モデル ───────────────────────────────────────────────────────────

export interface DiscoveryConfig {
  mode: 'local' | 'server';
  localPorts: number[];
  serverServices: string[];
  remoteUrl: string | null;
}

export interface HubPlugin {
  id: string;
  connectsTo: string;
  baseUrlEnv: string;
  envSet: boolean;
  file: string;
}

export interface HubModel {
  corpus: {
    tokenModeDefault: string;
    /** Corpus normalize が実装するマニフェスト規約バージョン。 */
    supportedCorpusApi: number;
    discovery: DiscoveryConfig;
    sources: { tokenMode: string; discovery: string; corpusApi: string };
  };
  vantanhub: { plugins: HubPlugin[] };
}

// ── ContractGraph ────────────────────────────────────────────────────────────

export interface ContractGraph {
  root: string;
  date: string; // YYYY-MM-DD
  reposScanned: string[];
  cernere: CernereModel;
  services: ServiceNode[];
  hub: HubModel;
}
