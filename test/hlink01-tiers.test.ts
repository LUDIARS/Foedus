import { describe, it, expect } from 'vitest';
import type {
  ContractGraph,
  Manifest,
  RegistrySource,
} from '../src/model/contract-graph.ts';
import { hLink01 } from '../src/rules/linkage-rules.ts';

// H-LINK-01 の 3 段階判定 (projectKey 追跡で精緻化) を隔離して検証する。
// 完全パイプライン (rules.test.ts) を乱さないよう最小 ContractGraph を手組みする。

function graph(opts: {
  projectKey: string;
  managedKeys: string[];
  serviceTemplates: string[];
  registrySource?: RegistrySource;
}): ContractGraph {
  const manifest: Manifest = {
    service: opts.projectKey,
    corpusApi: 1,
    auth: 'cernere-project-token',
    cernereProjectKey: opts.projectKey,
    data: [],
    panels: [],
  };
  return {
    root: '/x',
    date: '2026-06-24',
    reposScanned: [],
    cernere: {
      managedProjects: opts.managedKeys.map((key) => ({
        key,
        clientIdPresent: true,
        isActive: true,
        schemaDefinitionPresent: true,
        source: 'migrations',
        evidence: 'Cernere/migrations/x.sql:1',
      })),
      oidcClients: [],
      oidcClientsSource: 'runtime-unknown',
      serviceTemplates: opts.serviceTemplates,
      relayPairs: [],
      boundary: { holds: [], notHolds: [], docFiles: [] },
      personalDataColumns: [],
      registrySource: opts.registrySource ?? 'migrations',
      externalProjectSchemas: [],
    },
    services: [
      {
        repo: opts.projectKey,
        manifestFile: `${opts.projectKey}/server/corpus.ts`,
        manifest,
        manifestSource: 'static-ast',
        localSchema: { tables: [] },
      },
    ],
    hub: {
      corpus: {
        tokenModeDefault: 'passthrough',
        supportedCorpusApi: 1,
        discovery: { mode: 'server', localPorts: [], serverServices: [], remoteUrl: null },
        sources: { tokenMode: 'x', discovery: 'x', corpusApi: 'x' },
      },
      vantanhub: { plugins: [] },
    },
  };
}

describe('H-LINK-01 3 段階判定', () => {
  it('seed 済み → 指摘なし', () => {
    const v = hLink01(graph({ projectKey: 'memoria', managedKeys: ['memoria'], serviceTemplates: [] }));
    expect(v).toEqual([]);
  });

  it('seed 無し + service テンプレート有り → low (runtime 登録の蓋然性)', () => {
    const v = hLink01(
      graph({ projectKey: 'bibliotheca', managedKeys: ['memoria'], serviceTemplates: ['bibliotheca'] }),
    );
    expect(v).toHaveLength(1);
    expect(v[0]?.severity).toBe('low');
    expect(v[0]?.message).toMatch(/server\/service\/bibliotheca/);
  });

  it('seed 無し + テンプレートも無し → high (真のギャップ)', () => {
    const v = hLink01(
      graph({ projectKey: 'aedilis', managedKeys: ['memoria'], serviceTemplates: ['bibliotheca'] }),
    );
    expect(v).toHaveLength(1);
    expect(v[0]?.severity).toBe('high');
  });

  it('db-export 併合済みなら テンプレート有りでも high (runtime 行が見えるはず)', () => {
    const v = hLink01(
      graph({
        projectKey: 'bibliotheca',
        managedKeys: ['memoria'],
        serviceTemplates: ['bibliotheca'],
        registrySource: 'migrations+db-export',
      }),
    );
    expect(v).toHaveLength(1);
    expect(v[0]?.severity).toBe('high');
  });
});
