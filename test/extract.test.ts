import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { extractCernereRegistry } from '../src/extract/cernere-registry.ts';
import { extractCernereBoundary } from '../src/extract/cernere-boundary.ts';
import { extractServiceManifest } from '../src/extract/service-manifest.ts';
import { extractServiceSchema } from '../src/extract/service-schema.ts';
import { extractHubConfig } from '../src/extract/hub-config.ts';

const ROOT = fileURLToPath(new URL('./fixtures/root', import.meta.url));

describe('cernere-registry', () => {
  it('managed_projects の key を seed から抽出 (memoria のみ)', () => {
    const r = extractCernereRegistry(ROOT);
    expect(r.managedProjects.map((p) => p.key)).toEqual(['memoria']);
    expect(r.registrySource).toBe('migrations');
  });

  it('relay_pairs を from→to で抽出', () => {
    const r = extractCernereRegistry(ROOT);
    expect(r.relayPairs).toHaveLength(1);
    expect(r.relayPairs[0]).toMatchObject({ from: 'memoria', to: 'imperativus', bidirectional: true });
  });

  it('oidc_clients は CREATE のみ → runtime-unknown (値を捏造しない)', () => {
    const r = extractCernereRegistry(ROOT);
    expect(r.oidcClientsSource).toBe('runtime-unknown');
    expect(r.oidcClients).toEqual([]);
  });

  it('--cernere-db-export で managed_projects を併合し registrySource を上げる', () => {
    const exp = join(ROOT, '..', 'db-export.json');
    const r = extractCernereRegistry(ROOT, exp);
    expect(r.registrySource).toBe('migrations+db-export');
    expect(r.managedProjects.map((p) => p.key)).toContain('aedilis');
    expect(r.oidcClientsSource).toBe('db-export');
  });

  it('server/service/<key>/ テンプレートをオンボード信号として抽出 (_template 除外)', () => {
    const r = extractCernereRegistry(ROOT);
    expect(r.serviceTemplates).toContain('leaksvc');
    expect(r.serviceTemplates).not.toContain('_template');
  });
});

describe('cernere-boundary', () => {
  it('持つ/持たない + 含む/除く 記述と機微カラムを抽出', () => {
    const b = extractCernereBoundary(ROOT);
    expect(b.holds.length).toBeGreaterThan(0);
    expect(b.notHolds.length).toBeGreaterThan(0);
    // 「含む / 除く」語彙も拾う (C-DATA-07 誤検知の修正)
    expect(b.holds.some((h) => h.includes('含む'))).toBe(true);
    expect(b.notHolds.some((h) => h.includes('除く'))).toBe(true);
    const cols = b.personalDataColumns.map((c) => `${c.table}.${c.column}`);
    expect(cols).toContain('users.email');
    expect(cols).toContain('users.totp_secret');
    expect(cols).toContain('users.google_access_token');
  });
});

describe('service-manifest (esbuild eval)', () => {
  it('Aedilis の corpusManifest をリテラル評価で抽出', async () => {
    const file = join(ROOT, 'Aedilis', 'server', 'corpus.ts');
    const { manifest, source } = await extractServiceManifest(file);
    expect(source).toBe('literal-eval');
    expect(manifest?.service).toBe('aedilis');
    expect(manifest?.corpusApi).toBe(2);
    expect(manifest?.auth).toBe('cernere-project-token');
    expect(manifest?.cernereProjectKey).toBe('aedilis');
    expect(manifest?.panels[0]?.kind).toBe('declarative');
  });
});

describe('service-schema', () => {
  it('Leak の CREATE TABLE からトークン/PII 列を分類', () => {
    const s = extractServiceSchema(join(ROOT, 'Leak'));
    const flags = s.tables.flatMap((t) => t.columns.map((c) => `${c.name}:${c.flags[0]}`));
    expect(flags).toContain('access_token:oauth-token');
    expect(flags).toContain('refresh_token:oauth-token');
    expect(flags).toContain('email:personal-pii');
    expect(flags).toContain('phone_number:personal-pii');
  });

  it('Aedilis は allowlist 内 (token/PII 無し)', () => {
    const s = extractServiceSchema(join(ROOT, 'Aedilis'));
    const sensitive = s.tables.flatMap((t) =>
      t.columns.filter((c) =>
        ['oauth-token', 'password', 'personal-pii'].includes(c.flags[0] ?? 'plain'),
      ),
    );
    expect(sensitive).toEqual([]);
  });
});

describe('hub-config', () => {
  it('token-mode 既定 passthrough / supportedCorpusApi=1 / plugin connector を抽出', () => {
    const h = extractHubConfig(ROOT);
    expect(h.corpus.tokenModeDefault).toBe('passthrough');
    expect(h.corpus.supportedCorpusApi).toBe(1);
    const ids = h.vantanhub.plugins.map((p) => p.connectsTo).sort();
    expect(ids).toEqual(['aedilis', 'gadget']);
    const aedilis = h.vantanhub.plugins.find((p) => p.connectsTo === 'aedilis');
    expect(aedilis?.baseUrlEnv).toBe('AEDILIS_BASE_URL');
    expect(aedilis?.envSet).toBe(false); // .env.example で空 = degraded
  });
});
