// C-DATA-08 (外部管理スキーマの個人データ棚卸し) の単体テスト。
//
// cData08 は g.cernere.externalProjectSchemas のみを読む純関数なので、
// 他の抽出器を経由せず最小の ContractGraph フィクスチャを直接組み立てて検証する。

import { describe, it, expect } from 'vitest';
import type { ContractGraph } from '../src/model/contract-graph.ts';
import { cData08 } from '../src/rules/data-rules.ts';
import { buildReport } from '../src/report/violations.ts';
import { renderContractMd } from '../src/report/render-md.ts';

function minimalGraph(overrides: Partial<ContractGraph['cernere']> = {}): ContractGraph {
  return {
    root: '/fake/root',
    date: '2026-07-09',
    reposScanned: ['Cernere', 'Corpus', 'VantanHub'],
    cernere: {
      managedProjects: [],
      oidcClients: [],
      oidcClientsSource: 'runtime-unknown',
      serviceTemplates: [],
      relayPairs: [],
      boundary: { holds: [], notHolds: [], docFiles: [] },
      personalDataColumns: [],
      registrySource: 'migrations',
      externalProjectSchemas: [],
      ...overrides,
    },
    services: [],
    hub: {
      corpus: {
        tokenModeDefault: 'passthrough',
        supportedCorpusApi: 1,
        discovery: { mode: 'local', localPorts: [], serverServices: [], remoteUrl: null },
        sources: { tokenMode: 'static', discovery: 'static', corpusApi: 'static' },
      },
      vantanhub: { plugins: [] },
    },
  };
}

describe('cData08', () => {
  it('personal-pii / oauth-token / password 列を棚卸しし low severity の violation を出す', () => {
    const g = minimalGraph({
      externalProjectSchemas: [
        {
          key: 'vantan_user',
          file: 'Foedus/schemas/vantan_user.json',
          columns: [
            { column: 'name', flag: 'personal-pii' },
            { column: 'department_name', flag: 'plain' },
            { column: 'grade', flag: 'plain' },
            { column: 'access_token', flag: 'oauth-token' },
          ],
        },
      ],
    });

    const out = cData08(g);
    // plain 列は棚卸し対象外。
    expect(out).toHaveLength(2);
    expect(out.every((v) => v.id === 'C-DATA-08' && v.status === 'violation' && v.severity === 'low')).toBe(true);

    const nameFinding = out.find((v) => v.subject === 'external:vantan_user.name');
    expect(nameFinding?.category).toBe('data-boundary');
    expect(nameFinding?.evidence).toEqual(['Foedus/schemas/vantan_user.json']);

    const tokenFinding = out.find((v) => v.subject === 'external:vantan_user.access_token');
    expect(tokenFinding?.category).toBe('security');
  });

  it('外部管理スキーマが無ければ何も出さない', () => {
    expect(cData08(minimalGraph())).toEqual([]);
  });

  it('CONTRACT.md / violations.json に外部管理スキーマ節が反映される', () => {
    const g = minimalGraph({
      externalProjectSchemas: [
        {
          key: 'vantan_user',
          file: 'Foedus/schemas/vantan_user.json',
          columns: [{ column: 'name', flag: 'personal-pii' }],
        },
      ],
    });
    const all = cData08(g);
    const report = buildReport(g, all);
    expect(report.externalProjectSchemas).toHaveLength(1);
    expect(report.externalProjectSchemas[0]?.key).toBe('vantan_user');

    const md = renderContractMd(report);
    expect(md).toContain('## 外部管理スキーマ (external:vantan_user)');
    expect(md).toContain('Foedus/schemas/vantan_user.json');
    expect(md).toContain('| name | personal-pii |');
  });
});
