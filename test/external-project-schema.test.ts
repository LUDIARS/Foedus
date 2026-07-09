import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { extractExternalProjectSchemas } from '../src/extract/external-project-schema.ts';
import { buildContractGraph } from '../src/extract/index.ts';
import { evaluateAll } from '../src/rules/registry.ts';
import { buildReport } from '../src/report/violations.ts';
import { renderContractMd } from '../src/report/render-md.ts';

const ROOT = fileURLToPath(new URL('./fixtures/external-schema-root', import.meta.url));
const NO_SCHEMAS_ROOT = fileURLToPath(new URL('./fixtures/root', import.meta.url));
const BAD_KEY_ROOT = fileURLToPath(new URL('./fixtures/external-schema-bad-key-root', import.meta.url));
const BAD_COLUMNS_ROOT = fileURLToPath(new URL('./fixtures/external-schema-bad-columns-root', import.meta.url));
const BAD_JSON_ROOT = fileURLToPath(new URL('./fixtures/external-schema-bad-json-root', import.meta.url));
const E2E_ROOT = fileURLToPath(new URL('./fixtures/e2e-external-schema-root', import.meta.url));

describe('extractExternalProjectSchemas', () => {
  it('Foedus/schemas/*.json から project.key + columns を抽出し分類する', () => {
    const out = extractExternalProjectSchemas(ROOT);
    expect(out).toHaveLength(1);
    const schema = out[0];
    expect(schema?.key).toBe('vantan_user');
    expect(schema?.file).toBe('Foedus/schemas/vantan_user.json');

    const flags = Object.fromEntries((schema?.columns ?? []).map((c) => [c.column, c.flag]));
    // 'name' は一般 classifyColumn では display-cache だが、 外部管理の per-user
    // プロフィールでは実在の氏名 = PII なので override される。
    expect(flags.name).toBe('personal-pii');
    // 一般の classifyColumn ルートも通常どおり効く (email は元々 personal-pii)。
    expect(flags.email).toBe('personal-pii');
    // department_name / grade / desired_job はどの分類ルールにも当たらず plain。
    expect(flags.department_name).toBe('plain');
    expect(flags.grade).toBe('plain');
    expect(flags.desired_job).toBe('plain');
  });

  it('Foedus/schemas ディレクトリが無ければ空配列 (未オーサリングはエラーではない)', () => {
    expect(extractExternalProjectSchemas(NO_SCHEMAS_ROOT)).toEqual([]);
  });

  it('project.key を欠く JSON は fail-fast で例外 (無言フォールバック禁止)', () => {
    expect(() => extractExternalProjectSchemas(BAD_KEY_ROOT)).toThrow(/project\.key/);
  });

  it('user_data.columns を欠く JSON は fail-fast で例外', () => {
    expect(() => extractExternalProjectSchemas(BAD_COLUMNS_ROOT)).toThrow(/user_data\.columns/);
  });

  it('壊れた JSON は fail-fast で例外', () => {
    expect(() => extractExternalProjectSchemas(BAD_JSON_ROOT)).toThrow(/JSON 解析/);
  });
});

describe('外部管理スキーマ end-to-end (contract-check パイプライン全体を通す)', () => {
  it('buildContractGraph → evaluateAll → buildReport → CONTRACT.md に vantan_user が現れる', async () => {
    const graph = await buildContractGraph({ root: E2E_ROOT, date: '2026-07-09' });
    expect(graph.cernere.externalProjectSchemas.map((s) => s.key)).toEqual(['vantan_user']);

    const all = evaluateAll(graph);
    const c08 = all.filter((v) => v.id === 'C-DATA-08' && v.status === 'violation');
    // フィクスチャの personal-pii 列 (name, email) の分だけ棚卸しされる。
    expect(c08.map((v) => v.subject).sort()).toEqual([
      'external:vantan_user.email',
      'external:vantan_user.name',
    ]);

    const report = buildReport(graph, all);
    expect(report.externalProjectSchemas).toHaveLength(1);
    const md = renderContractMd(report);
    expect(md).toContain('## 外部管理スキーマ (external:vantan_user)');
  });
});
