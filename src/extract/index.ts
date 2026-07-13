// 抽出器の束ね: 全抽出器を呼んで ContractGraph を構築する。
//
// 対象サービスの発見は `<root>/*/server/corpus.ts` の存在で行う (glob 相当を
// readdir で実装)。 --repos でホワイトリスト絞り込み可。 Cernere/Corpus/VantanHub
// は manifest を持たなくてもレジストリ/ハブ側として常に走査される。
//
// 外部管理スキーマ (externalProjectSchemas) のみ他の抽出器と性質が異なる: ローカル
// ファイル/git チェックアウトの静的解析ではなく、 Cernere への **ライブ HTTP 取得**
// (cernere-schema-client.ts)。 CERNERE_BASE_URL / FOEDUS_CERNERE_EXPORT_TOKEN が
// 未設定・到達不能な場合は fail-fast する (無言で空配列にしない)。 CI 等で Cernere に
// 到達できないことが分かっている場合のみ、 呼び出し元が明示的に `skipExternalSchema`
// を指定して degraded 実行を選べる (黙って自動フォールバックはしない)。

import { join } from 'node:path';
import type { ContractGraph, ExternalProjectSchema, ServiceNode } from '../model/contract-graph.ts';
import { extractCernereRegistry } from './cernere-registry.ts';
import { extractCernereBoundary } from './cernere-boundary.ts';
import { extractServiceManifest } from './service-manifest.ts';
import { extractServiceSchema } from './service-schema.ts';
import { extractHubConfig } from './hub-config.ts';
import { extractExternalProjectSchemas } from './external-project-schema.ts';
import {
  resolveCernereSchemaClientConfig,
  type CernereSchemaClientConfig,
} from './cernere-schema-client.ts';
import { isFile, listSubdirs, rel } from './fs-util.ts';

export interface BuildOptions {
  root: string;
  repos?: string[]; // ホワイトリスト (省略時は全 corpus.ts 保有リポ)
  cernereDbExport?: string;
  date?: string; // YYYY-MM-DD (省略時は当日)
  /**
   * true の場合、 外部管理スキーマ (Cernere schema-export) のライブ取得を行わず
   * 空配列を使う。 Cernere に到達できない環境 (例: 現状の CI) 向けの **明示的**
   * degraded モード。 未指定時の既定は false (= fail-fast: 到達できなければ例外)。
   */
  skipExternalSchema?: boolean;
  /** テスト/呼び出し元からの config 注入用。 省略時は環境変数から解決する。 */
  cernereSchemaClient?: CernereSchemaClientConfig;
  /** テスト用の fetch 差し替え。 */
  fetchImpl?: typeof fetch;
}

/** root 直下で server/corpus.ts を持つリポジトリ名を返す。 */
export function discoverServiceRepos(root: string, repos?: string[]): string[] {
  const all = listSubdirs(root).filter((name) =>
    isFile(join(root, name, 'server', 'corpus.ts')),
  );
  if (!repos || repos.length === 0) return all;
  const allow = new Set(repos);
  return all.filter((name) => allow.has(name));
}

async function resolveExternalProjectSchemas(opts: BuildOptions): Promise<ExternalProjectSchema[]> {
  if (opts.skipExternalSchema) return [];
  const config = opts.cernereSchemaClient ?? resolveCernereSchemaClientConfig();
  return extractExternalProjectSchemas(config, opts.fetchImpl);
}

export async function buildContractGraph(
  opts: BuildOptions,
): Promise<ContractGraph> {
  const { root } = opts;
  const date = opts.date ?? new Date().toISOString().slice(0, 10);

  const registry = extractCernereRegistry(root, opts.cernereDbExport);
  const boundary = extractCernereBoundary(root);
  const hub = extractHubConfig(root);
  const externalProjectSchemas = await resolveExternalProjectSchemas(opts);

  const serviceRepos = discoverServiceRepos(root, opts.repos);
  const services: ServiceNode[] = [];
  for (const repo of serviceRepos) {
    const repoAbs = join(root, repo);
    const corpusFile = join(repoAbs, 'server', 'corpus.ts');
    const { manifest, source, skipReason } = await extractServiceManifest(corpusFile);
    const schema = extractServiceSchema(repoAbs);
    services.push({
      repo,
      manifestFile: rel(root, corpusFile),
      manifest,
      manifestSource: source,
      manifestSkipReason: skipReason,
      localSchema: {
        tables: schema.tables,
        schemaFile: schema.schemaFile ? rel(root, schema.schemaFile) : undefined,
      },
    });
  }

  const reposScanned = [
    'Cernere',
    'Corpus',
    'VantanHub',
    ...serviceRepos.filter((r) => !['Cernere', 'Corpus', 'VantanHub'].includes(r)),
  ];

  return {
    root,
    date,
    reposScanned,
    cernere: {
      managedProjects: registry.managedProjects,
      oidcClients: registry.oidcClients,
      oidcClientsSource: registry.oidcClientsSource,
      serviceTemplates: registry.serviceTemplates,
      relayPairs: registry.relayPairs,
      boundary: {
        holds: boundary.holds,
        notHolds: boundary.notHolds,
        docFiles: boundary.docFiles,
      },
      personalDataColumns: boundary.personalDataColumns,
      registrySource: registry.registrySource,
      externalProjectSchemas,
    },
    services,
    hub,
  };
}
