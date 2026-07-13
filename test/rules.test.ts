import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import type { ContractGraph, Violation } from '../src/model/contract-graph.ts';
import { buildContractGraph } from '../src/extract/index.ts';
import { evaluateAll } from '../src/rules/registry.ts';
import { buildReport } from '../src/report/violations.ts';
import { renderContractMd } from '../src/report/render-md.ts';

const ROOT = fileURLToPath(new URL('./fixtures/root', import.meta.url));

function bySubject(vs: Violation[], id: string): string[] {
  return vs.filter((v) => v.id === id).map((v) => v.subject);
}

describe('contract pipeline (fixtures)', () => {
  let graph: ContractGraph;
  let all: Violation[];
  let active: Violation[];
  let skipped: Violation[];

  beforeAll(async () => {
    graph = await buildContractGraph({ root: ROOT, date: '2026-06-24', skipExternalSchema: true });
    all = evaluateAll(graph);
    active = all.filter((v) => v.status === 'violation');
    skipped = all.filter((v) => v.status === 'skipped');
  });

  it('対象サービスを corpus.ts から発見し、静的に読めない manifest は skipped にする', () => {
    expect(graph.services.map((s) => s.repo).sort()).toEqual(['Aedilis', 'Leak', 'Unextractable']);
    expect(graph.services.filter((s) => s.repo !== 'Unextractable').every((s) => s.manifestSource === 'static-ast')).toBe(true);
    expect(graph.services.find((s) => s.repo === 'Unextractable')).toMatchObject({
      manifest: null,
      manifestSource: 'skipped',
      manifestSkipReason: 'non-literal-expression',
    });
  });

  it('H-LINK-01: aedilis が managed_projects に不在で発火 (memoria=leak は不発)', () => {
    expect(bySubject(active, 'H-LINK-01')).toEqual(['aedilis']);
  });

  it('H-LINK-02: aedilis の project-token 要求 vs hub passthrough', () => {
    expect(bySubject(active, 'H-LINK-02')).toEqual(['aedilis']);
  });

  it('H-LINK-02: plugin proxy 経由 (aedilis) は TokenProvider バイパスを指摘', () => {
    const h2 = active.find((v) => v.id === 'H-LINK-02' && v.subject === 'aedilis');
    expect(h2?.message).toMatch(/plugin proxy/);
    expect(h2?.evidence).toContain('VantanHub/plugins/shared.ts');
  });

  it('H-LINK-07: aedilis の corpusApi=2 > Corpus supportedCorpusApi=1', () => {
    expect(bySubject(active, 'H-LINK-07')).toEqual(['aedilis']);
  });

  it('H-LINK-04: corpus.ts 無き接続先 gadget が発火 (aedilis は不発)', () => {
    expect(bySubject(active, 'H-LINK-04')).toEqual(['gadget']);
  });

  it('C-DATA-01 / C-DATA-02: Leak の自前トークン/PII を検出', () => {
    expect(active.filter((v) => v.id === 'C-DATA-01').length).toBe(2);
    expect(active.filter((v) => v.id === 'C-DATA-02').length).toBe(2);
    expect(active.every((v) => v.id !== 'C-DATA-01' || v.subject.startsWith('leak'))).toBe(true);
  });

  it('判定不能ルールは skipped を明示 (無言フォールバック禁止)', () => {
    const ids = new Set(skipped.map((v) => v.id));
    for (const id of ['C-DATA-03', 'C-DATA-04', 'C-DATA-05', 'C-DATA-06', 'H-LINK-03', 'H-LINK-05', 'H-LINK-06']) {
      expect(ids.has(id)).toBe(true);
    }
    // skipped は evidence を持たず status=skipped で actual に理由を持つ
    expect(skipped.every((v) => v.status === 'skipped' && v.actual.length > 0)).toBe(true);
  });

  it('H-LINK-03 は runtime-unknown を理由に skipped', () => {
    const h3 = skipped.find((v) => v.id === 'H-LINK-03');
    expect(h3?.actual).toMatch(/runtime/);
  });

  it('report 集計: high≥1 → grade C、 skipped は減点しない', () => {
    const report = buildReport(graph, all);
    expect(report.bySeverity.high).toBeGreaterThanOrEqual(1);
    expect(report.grade).toBe('C');
    expect(report.counts.skipped).toBeGreaterThan(0);
  });

  it('CONTRACT.md に skipped 別節が出る', () => {
    const md = renderContractMd(buildReport(graph, all));
    expect(md).toContain('判定不能 (skipped');
    expect(md).toContain('H-LINK-01');
  });

  it('--cernere-db-export で aedilis 補完すると H-LINK-01 が解消', async () => {
    const exp = fileURLToPath(new URL('./fixtures/db-export.json', import.meta.url));
    const g2 = await buildContractGraph({ root: ROOT, date: '2026-06-24', cernereDbExport: exp, skipExternalSchema: true });
    const a2 = evaluateAll(g2).filter((v) => v.status === 'violation');
    expect(bySubject(a2, 'H-LINK-01')).toEqual([]);
  });
});
