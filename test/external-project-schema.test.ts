// extractExternalProjectSchemas は Cernere `GET /api/admin/projects/schema-export`
// をライブ取得する (schemas/*.json ファイル読み込みは廃止)。 ここでは実ネットワークを
// 使わず、 fetchImpl (typeof fetch) を差し替えて Cernere 応答を模擬する。

import { describe, it, expect } from 'vitest';
import { extractExternalProjectSchemas } from '../src/extract/external-project-schema.ts';
import type { CernereSchemaClientConfig } from '../src/extract/cernere-schema-client.ts';
import { buildContractGraph } from '../src/extract/index.ts';
import { evaluateAll } from '../src/rules/registry.ts';
import { buildReport } from '../src/report/violations.ts';
import { renderContractMd } from '../src/report/render-md.ts';
import { fileURLToPath } from 'node:url';

const CONFIG: CernereSchemaClientConfig = { baseUrl: 'http://fake-cernere.test', token: 'test-token' };
const EXPECTED_URL = 'http://fake-cernere.test/api/admin/projects/schema-export';

/** 200 OK + JSON body を返す fetchImpl を作る。 */
function jsonFetch(body: unknown, status = 200): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    expect(String(input)).toBe(EXPECTED_URL);
    expect((init?.headers as Record<string, string> | undefined)?.authorization).toBe(`Bearer ${CONFIG.token}`);
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

const VANTAN_USER_SCHEMA_DEFINITION = {
  project: {
    key: 'vantan_user',
    name: 'Vantan User Profile',
    description: '学科登録・学年・氏名・希望職種などの学生プロフィール共通スキーマ',
  },
  data_sharing: [
    { project_key: 'aedilis', modules: ['profile'], access: 'read', description: '施設予約・出席記録のため共有' },
  ],
  user_data: {
    columns: {
      department_name: { type: 'text', module: 'profile', nullable: false },
      grade: { type: 'integer', module: 'profile', nullable: false },
      name: { type: 'text', module: 'profile', nullable: false },
      desired_job: { type: 'text', module: 'profile', nullable: true },
      email: { type: 'text', module: 'profile', nullable: true },
    },
  },
};

describe('extractExternalProjectSchemas (Cernere schema-export ライブ取得)', () => {
  it('成功: 複数プロジェクトを ExternalProjectSchema[] へ変換する', async () => {
    const fetchImpl = jsonFetch({
      projects: [
        { key: 'vantan_user', name: 'Vantan User Profile', description: '...', schemaDefinition: VANTAN_USER_SCHEMA_DEFINITION },
        {
          key: 'other_proj',
          name: 'Other',
          description: '...',
          schemaDefinition: { project: { key: 'other_proj' }, user_data: { columns: { foo: { type: 'text' } } } },
        },
      ],
    });

    const out = await extractExternalProjectSchemas(CONFIG, fetchImpl);
    expect(out).toHaveLength(2);

    const vantan = out.find((s) => s.key === 'vantan_user');
    expect(vantan?.file).toBe('Cernere schema-export (key=vantan_user)');
    const flags = Object.fromEntries((vantan?.columns ?? []).map((c) => [c.column, c.flag]));
    // 'name' は一般 classifyColumn では display-cache だが、 外部管理の per-user
    // プロフィールでは実在の氏名 = PII なので override される。
    expect(flags.name).toBe('personal-pii');
    // 一般の classifyColumn ルートも通常どおり効く (email は元々 personal-pii)。
    expect(flags.email).toBe('personal-pii');
    expect(flags.department_name).toBe('plain');
    expect(flags.grade).toBe('plain');
    expect(flags.desired_job).toBe('plain');
    expect(vantan?.dataSharing).toEqual([
      { projectKey: 'aedilis', modules: ['profile'], access: 'read', description: '施設予約・出席記録のため共有' },
    ]);

    const other = out.find((s) => s.key === 'other_proj');
    expect(other?.columns.map((c) => c.column)).toEqual(['foo']);
    expect(other?.dataSharing).toEqual([]);
  });

  it('空配列: プロジェクト未登録は空配列 (エラーではない)', async () => {
    const out = await extractExternalProjectSchemas(CONFIG, jsonFetch({ projects: [] }));
    expect(out).toEqual([]);
  });

  it('ネットワーク失敗は明確な例外を投げる', async () => {
    const failingFetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    await expect(extractExternalProjectSchemas(CONFIG, failingFetch)).rejects.toThrow(/接続に失敗/);
  });

  it('認証失敗 (401) は明確な例外を投げる', async () => {
    const fetchImpl = (async () =>
      new Response('unauthorized', { status: 401, statusText: 'Unauthorized' })) as unknown as typeof fetch;

    await expect(extractExternalProjectSchemas(CONFIG, fetchImpl)).rejects.toThrow(/401/);
  });

  it('応答が配列でない場合は明確な例外を投げる (壊れた応答)', async () => {
    const fetchImpl = jsonFetch({ not: 'an array' });
    await expect(extractExternalProjectSchemas(CONFIG, fetchImpl)).rejects.toThrow(/配列/);
  });

  it('要素に key が無い場合は fail-fast で例外', async () => {
    const fetchImpl = jsonFetch({ projects: [{ name: 'no key', description: '', schemaDefinition: {} }] });
    await expect(extractExternalProjectSchemas(CONFIG, fetchImpl)).rejects.toThrow(/key/);
  });

  it('schemaDefinition.user_data.columns が無い場合は fail-fast で例外', async () => {
    const fetchImpl = jsonFetch({ projects: [{ key: 'broken', name: '', description: '', schemaDefinition: { project: { key: 'broken' } } }] });
    await expect(extractExternalProjectSchemas(CONFIG, fetchImpl)).rejects.toThrow(/user_data\.columns/);
  });

  it('応答 JSON の解析に失敗した場合は明確な例外を投げる', async () => {
    const fetchImpl = (async () =>
      new Response('{ not valid json,,,', { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
    await expect(extractExternalProjectSchemas(CONFIG, fetchImpl)).rejects.toThrow(/JSON 解析/);
  });
});

describe('外部管理スキーマ end-to-end (contract-check パイプライン全体を通す)', () => {
  const ROOT = fileURLToPath(new URL('./fixtures/root', import.meta.url));

  it('buildContractGraph → evaluateAll → buildReport → CONTRACT.md に vantan_user が現れる', async () => {
    const fetchImpl = jsonFetch({
      projects: [
        { key: 'vantan_user', name: 'Vantan User Profile', description: '...', schemaDefinition: VANTAN_USER_SCHEMA_DEFINITION },
      ],
    });

    const graph = await buildContractGraph({
      root: ROOT,
      date: '2026-07-09',
      cernereSchemaClient: CONFIG,
      fetchImpl,
    });
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

  it('CERNERE_BASE_URL / トークン未設定時、 buildContractGraph は skipExternalSchema 無指定なら fail-fast する', async () => {
    const savedBaseUrl = process.env.CERNERE_BASE_URL;
    const savedToken = process.env.FOEDUS_CERNERE_EXPORT_TOKEN;
    delete process.env.CERNERE_BASE_URL;
    delete process.env.FOEDUS_CERNERE_EXPORT_TOKEN;
    try {
      await expect(buildContractGraph({ root: ROOT, date: '2026-07-09' })).rejects.toThrow(/CERNERE_BASE_URL/);
    } finally {
      if (savedBaseUrl !== undefined) process.env.CERNERE_BASE_URL = savedBaseUrl;
      if (savedToken !== undefined) process.env.FOEDUS_CERNERE_EXPORT_TOKEN = savedToken;
    }
  });

  it('skipExternalSchema: true なら env 未設定でも空配列で進む (明示的 degraded モード)', async () => {
    const savedBaseUrl = process.env.CERNERE_BASE_URL;
    const savedToken = process.env.FOEDUS_CERNERE_EXPORT_TOKEN;
    delete process.env.CERNERE_BASE_URL;
    delete process.env.FOEDUS_CERNERE_EXPORT_TOKEN;
    try {
      const graph = await buildContractGraph({ root: ROOT, date: '2026-07-09', skipExternalSchema: true });
      expect(graph.cernere.externalProjectSchemas).toEqual([]);
    } finally {
      if (savedBaseUrl !== undefined) process.env.CERNERE_BASE_URL = savedBaseUrl;
      if (savedToken !== undefined) process.env.FOEDUS_CERNERE_EXPORT_TOKEN = savedToken;
    }
  });
});
