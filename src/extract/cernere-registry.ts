// 抽出器: Cernere レジストリ (managed_projects / oidc_clients / relay_pairs)。
//
// 入力は `Cernere/migrations/*.sql` の INSERT 文 (静的)。 oidc_clients は
// migrations では CREATE のみで seed が無く、 実行時登録される可能性があるため
// 静的に列挙できない → `oidcClientsSource: 'runtime-unknown'` を立て、 値を捏造
// しない (無言フォールバック禁止)。 `--cernere-db-export <json>` があれば併合し、
// registrySource を 'migrations+db-export' に上げる。

import { join } from 'node:path';
import type {
  ManagedProject,
  OidcClient,
  RelayPair,
  RegistrySource,
} from '../model/contract-graph.ts';
import { listFiles, listSubdirs, isFile, readText, rel, lineAt } from './fs-util.ts';

export interface RegistryExtract {
  managedProjects: ManagedProject[];
  oidcClients: OidcClient[];
  oidcClientsSource: 'static' | 'runtime-unknown' | 'db-export';
  serviceTemplates: string[];
  relayPairs: RelayPair[];
  registrySource: RegistrySource;
}

interface DbExportShape {
  managedProjects?: { key: string; isActive?: boolean }[];
  oidcClients?: {
    clientId: string;
    redirectUris?: string[];
    scopes?: string[];
    isActive?: boolean;
  }[];
  relayPairs?: {
    from: string;
    to: string;
    bidirectional?: boolean;
    isActive?: boolean;
  }[];
}

const MANAGED_RE =
  /INSERT\s+INTO\s+managed_projects\s*\(([^)]*)\)\s*VALUES\s*\(\s*'([^']+)'/gi;
const RELAY_RE =
  /INSERT\s+INTO\s+relay_pairs\s*\(([^)]*)\)\s*VALUES\s*\(\s*'([^']+)'\s*,\s*'([^']+)'/gi;
const OIDC_INSERT_RE = /INSERT\s+INTO\s+oidc_clients\b/i;

export function extractCernereRegistry(
  root: string,
  cernereDbExportPath?: string,
): RegistryExtract {
  const migDir = join(root, 'Cernere', 'migrations');
  const sqlFiles = listFiles(migDir, '.sql');

  // server/service/<key>/schema.json を持つサービス = Cernere オンボード済みの
  // 弱いシグナル (managed_projects 行そのものではない)。 _template は除外。
  const serviceDir = join(root, 'Cernere', 'server', 'service');
  const serviceTemplates = listSubdirs(serviceDir)
    .filter((d) => d !== '_template')
    .filter((d) => isFile(join(serviceDir, d, 'schema.json')))
    .sort();

  const managed = new Map<string, ManagedProject>();
  const relays: RelayPair[] = [];
  let anyOidcInsert = false;

  for (const file of sqlFiles) {
    const sql = readText(file);
    if (!sql) continue;
    const evBase = rel(root, file);

    for (const m of sql.matchAll(MANAGED_RE)) {
      const columns = (m[1] ?? '').toLowerCase();
      const key = m[2];
      if (!key) continue;
      const line = lineAt(sql, m.index ?? 0);
      // 既存 (先勝ち) を尊重しつつ、 列存在情報を記録する。
      if (!managed.has(key)) {
        managed.set(key, {
          key,
          clientIdPresent: columns.includes('client_id'),
          isActive: true, // is_active 既定 TRUE。 seed が明示 FALSE する例は無い。
          schemaDefinitionPresent: columns.includes('schema_definition'),
          source: 'migrations',
          evidence: `${evBase}:${line}`,
        });
      }
    }

    for (const m of sql.matchAll(RELAY_RE)) {
      const from = m[2];
      const to = m[3];
      if (!from || !to) continue;
      const line = lineAt(sql, m.index ?? 0);
      relays.push({
        from,
        to,
        bidirectional: true, // 既定 TRUE (015 のテーブル定義)。
        isActive: true,
        source: 'migrations',
        evidence: `${evBase}:${line}`,
      });
    }

    if (OIDC_INSERT_RE.test(sql)) anyOidcInsert = true;
  }

  const managedProjects = [...managed.values()].sort((a, b) =>
    a.key.localeCompare(b.key),
  );
  const oidcClients: OidcClient[] = [];
  let oidcClientsSource: RegistryExtract['oidcClientsSource'] = anyOidcInsert
    ? 'static'
    : 'runtime-unknown';
  let registrySource: RegistrySource = 'migrations';

  // ── db-export 併合 (任意) ──────────────────────────────────────────────────
  if (cernereDbExportPath) {
    const raw = readText(cernereDbExportPath);
    if (raw === null) {
      throw new Error(
        `--cernere-db-export を読めません: ${cernereDbExportPath} (パス/権限を確認)`,
      );
    }
    let parsed: DbExportShape;
    try {
      parsed = JSON.parse(raw) as DbExportShape;
    } catch (e) {
      throw new Error(
        `--cernere-db-export の JSON 解析に失敗: ${cernereDbExportPath}: ${(e as Error).message}`,
      );
    }
    registrySource = 'migrations+db-export';

    for (const mp of parsed.managedProjects ?? []) {
      if (!mp.key || managed.has(mp.key)) continue;
      managedProjects.push({
        key: mp.key,
        clientIdPresent: true,
        isActive: mp.isActive ?? true,
        schemaDefinitionPresent: false,
        source: 'db-export',
        evidence: `db-export:${cernereDbExportPath}`,
      });
    }
    for (const oc of parsed.oidcClients ?? []) {
      oidcClients.push({
        clientId: oc.clientId,
        redirectUris: oc.redirectUris ?? [],
        scopes: oc.scopes ?? [],
        isActive: oc.isActive ?? true,
        source: 'db-export',
      });
    }
    if (parsed.oidcClients !== undefined) oidcClientsSource = 'db-export';
    for (const rp of parsed.relayPairs ?? []) {
      relays.push({
        from: rp.from,
        to: rp.to,
        bidirectional: rp.bidirectional ?? true,
        isActive: rp.isActive ?? true,
        source: 'db-export',
        evidence: `db-export:${cernereDbExportPath}`,
      });
    }
    managedProjects.sort((a, b) => a.key.localeCompare(b.key));
  }

  return {
    managedProjects,
    oidcClients,
    oidcClientsSource,
    serviceTemplates,
    relayPairs: relays,
    registrySource,
  };
}
