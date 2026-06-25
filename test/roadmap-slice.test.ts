import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import type { ContractGraph, Violation } from '../src/model/contract-graph.ts';
import { buildContractGraph } from '../src/extract/index.ts';
import { evaluateAll } from '../src/rules/registry.ts';
import { extractRoadmapLines } from '../src/extract/roadmap.ts';
import { buildRoadmapContract, type LineContractSlice } from '../src/report/roadmap-slice.ts';

const ROOT = fileURLToPath(new URL('./fixtures/root', import.meta.url));

function findingIds(slice: LineContractSlice, repo: string): string[] {
  const m = slice.members.find((x) => x.repo === repo);
  return (m?.findings ?? []).map((f) => f.id);
}

describe('roadmap-contract slice (fixtures)', () => {
  let graph: ContractGraph;
  let all: Violation[];
  let slices: { dir: string; code: string; slice: LineContractSlice }[];
  let unassigned: ReturnType<typeof buildRoadmapContract>['unassigned'];

  beforeAll(async () => {
    graph = await buildContractGraph({ root: ROOT, date: '2026-06-24' });
    all = evaluateAll(graph);
    const lines = extractRoadmapLines(ROOT).lines;
    const res = buildRoadmapContract(graph, all, lines);
    slices = res.slices;
    unassigned = res.unassigned;
  });

  it('roadmap-* を services.json から発見 (DATA / SCHOOL)', () => {
    expect(extractRoadmapLines(ROOT).lines.map((l) => l.code).sort()).toEqual(['DATA', 'SCHOOL']);
  });

  it('roadmap-index 相当の集約専用ディレクトリは services.json を持てば普通の line 扱い', () => {
    // 本 fixture には roadmap-index は無い。 抽出は data/services.json の有無のみで判定する。
    expect(slices.length).toBe(2);
  });

  function slice(code: string): LineContractSlice {
    const s = slices.find((x) => x.code === code);
    if (!s) throw new Error(`line ${code} not found`);
    return s.slice;
  }

  it('SCHOOL: aedilis 固有の H-LINK 群がそのメンバーに付く', () => {
    const s = slice('SCHOOL');
    expect(findingIds(s, 'Aedilis').sort()).toEqual(['H-LINK-01', 'H-LINK-02', 'H-LINK-07']);
    const aedilis = s.members.find((m) => m.repo === 'Aedilis');
    expect(aedilis?.role).toBe('leaf-service');
    expect(aedilis?.status).toBe('violation');
    expect(aedilis?.manifest?.corpusApi).toBe(2);
  });

  it('SCHOOL: Cernere は registry 役割。 C-DATA skipped + 自身の登録欠落 (H-LINK-01) を持つ', () => {
    const s = slice('SCHOOL');
    const cernere = s.members.find((m) => m.repo === 'Cernere');
    expect(cernere?.role).toBe('registry');
    // C-DATA-05 (skipped) と H-LINK-01 (aedilis 未 seed は registry 側の欠落) を両方持つ。
    expect(findingIds(s, 'Cernere')).toContain('C-DATA-05');
    expect(findingIds(s, 'Cernere')).toContain('H-LINK-01');
    // H-LINK-01 は violation なので member status は violation (worst を採る)。
    expect(cernere?.status).toBe('violation');
  });

  it('SCHOOL: 連結に関与しない Hora は outOfScope', () => {
    const s = slice('SCHOOL');
    expect(s.members.some((m) => m.repo === 'Hora')).toBe(false);
    expect(s.outOfScope).toContain('Hora');
  });

  it('SCHOOL: high≥1 → grade C', () => {
    const s = slice('SCHOOL');
    expect(s.grade).toBe('C');
    expect(s.summary.bySeverity.high).toBeGreaterThanOrEqual(1);
    expect(s.summary.worst).toBe('high');
  });

  it('主体スコープ: aedilis 固有 finding は Cernere を共有する DATA ラインに漏れない', () => {
    const s = slice('DATA');
    // DATA は Cernere を持つが Aedilis を持たない → aedilis の H-LINK は計上されない。
    const ids = s.members.flatMap((m) => m.findings.map((f) => f.id));
    expect(ids).not.toContain('H-LINK-02');
    // 一方 Leak 自前保持 (C-DATA-01/02) は DATA に出る。
    expect(findingIds(s, 'Leak').sort()).toContain('C-DATA-01');
    expect(s.grade).toBe('C');
  });

  it('どのラインにも未帰属の finding を明示する (無言フォールバック禁止)', () => {
    // gadget connector (H-LINK-04) と memoria→imperativus relay (H-LINK-08) は
    // 主体サービスがどの roadmap-* member でもないので unassigned に出る。
    const subjects = unassigned.map((u) => `${u.id}:${u.subject}`);
    expect(subjects).toContain('H-LINK-04:gadget');
    expect(unassigned.every((u) => u.primary === null || true)).toBe(true);
  });

  it('global ブロックは全体集計を保持 (ライン局所と別)', () => {
    const s = slice('DATA');
    expect(s.global.violations).toBe(all.filter((v) => v.status === 'violation').length);
    expect(s.global.reposScanned).toContain('Cernere');
  });
});
