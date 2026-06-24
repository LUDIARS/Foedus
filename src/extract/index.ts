// 抽出器の束ね: 全抽出器を呼んで ContractGraph を構築する。
//
// 対象サービスの発見は `<root>/*/server/corpus.ts` の存在で行う (glob 相当を
// readdir で実装)。 --repos でホワイトリスト絞り込み可。 Cernere/Corpus/VantanHub
// は manifest を持たなくてもレジストリ/ハブ側として常に走査される。

import { join } from 'node:path';
import type { ContractGraph, ServiceNode } from '../model/contract-graph.ts';
import { extractCernereRegistry } from './cernere-registry.ts';
import { extractCernereBoundary } from './cernere-boundary.ts';
import { extractServiceManifest } from './service-manifest.ts';
import { extractServiceSchema } from './service-schema.ts';
import { extractHubConfig } from './hub-config.ts';
import { isFile, listSubdirs, rel } from './fs-util.ts';

export interface BuildOptions {
  root: string;
  repos?: string[]; // ホワイトリスト (省略時は全 corpus.ts 保有リポ)
  cernereDbExport?: string;
  date?: string; // YYYY-MM-DD (省略時は当日)
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

export async function buildContractGraph(
  opts: BuildOptions,
): Promise<ContractGraph> {
  const { root } = opts;
  const date = opts.date ?? new Date().toISOString().slice(0, 10);

  const registry = extractCernereRegistry(root, opts.cernereDbExport);
  const boundary = extractCernereBoundary(root);
  const hub = extractHubConfig(root);

  const serviceRepos = discoverServiceRepos(root, opts.repos);
  const services: ServiceNode[] = [];
  for (const repo of serviceRepos) {
    const repoAbs = join(root, repo);
    const corpusFile = join(repoAbs, 'server', 'corpus.ts');
    const { manifest, source } = await extractServiceManifest(corpusFile);
    const schema = extractServiceSchema(repoAbs);
    services.push({
      repo,
      manifestFile: rel(root, corpusFile),
      manifest,
      manifestSource: source,
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
    },
    services,
    hub,
  };
}
