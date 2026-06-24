// 抽出器: 各サービスの `server/corpus.ts` の `export const corpusManifest`。
//
// 主手段: esbuild で当該ファイルを bundle (format:esm, platform:node, write:false)
//   → 一時 .mjs に書き出し dynamic import → `corpusManifest` を読む。 corpusManifest
//   は純リテラル (Aedilis/Bibliotheca 実例で確認済) なので副作用なく評価できる。
//   副作用 import を含んでも壊れないよう、 エントリ以外の import は空モジュールへ
//   stub する resolve プラグインを噛ませる (リテラルは import 値を参照しない)。
// 副手段: eval 不能時は正規表現で service/cernereProjectKey/auth/corpusApi/panel.kind
//   を抽出する (manifestSource:'ast')。 両方不能なら manifestSource:'missing'。

import { build, type Plugin } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  Manifest,
  ManifestDataEndpoint,
  ManifestPanel,
  ManifestSource,
} from '../model/contract-graph.ts';

export interface ManifestExtract {
  manifest: Manifest | null;
  source: ManifestSource;
}

/** エントリ以外の全 import を空 CJS モジュールへ差し替える。 名前付き import も
 *  実行時 undefined になるだけで compile エラーにならない (CJS interop)。 */
function stubExternalsPlugin(entryAbs: string): Plugin {
  return {
    name: 'foedus-stub-externals',
    setup(b) {
      b.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === 'entry-point') return null;
        if (args.path === entryAbs) return null;
        return { path: args.path, namespace: 'foedus-stub' };
      });
      b.onLoad({ filter: /.*/, namespace: 'foedus-stub' }, () => ({
        contents: 'module.exports = {};',
        loader: 'js',
      }));
    },
  };
}

export async function extractServiceManifest(
  corpusFileAbs: string,
): Promise<ManifestExtract> {
  // ── 主手段: esbuild bundle → dynamic import ────────────────────────────────
  const viaEval = await tryEval(corpusFileAbs);
  if (viaEval) return { manifest: viaEval, source: 'literal-eval' };

  // ── 副手段: 正規表現抽出 ───────────────────────────────────────────────────
  const viaRegex = tryRegex(corpusFileAbs);
  if (viaRegex) return { manifest: viaRegex, source: 'ast' };

  return { manifest: null, source: 'missing' };
}

async function tryEval(corpusFileAbs: string): Promise<Manifest | null> {
  let dir: string | null = null;
  try {
    const result = await build({
      entryPoints: [corpusFileAbs],
      bundle: true,
      platform: 'node',
      format: 'esm',
      write: false,
      logLevel: 'silent',
      plugins: [stubExternalsPlugin(corpusFileAbs)],
    });
    const out = result.outputFiles?.[0]?.text;
    if (!out) return null;

    dir = mkdtempSync(join(tmpdir(), 'foedus-'));
    const mjs = join(dir, 'manifest.mjs');
    writeFileSync(mjs, out, 'utf8');
    const mod = (await import(pathToFileURL(mjs).href)) as {
      corpusManifest?: unknown;
    };
    return coerceManifest(mod.corpusManifest);
  } catch {
    return null;
  } finally {
    if (dir) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // 一時ディレクトリの掃除は best-effort。 失敗しても解析結果に影響しない。
      }
    }
  }
}

/** 評価で得た任意値を Manifest 型へ整形。 service が無ければ無効 → null。 */
function coerceManifest(raw: unknown): Manifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.service !== 'string' || !o.service) return null;

  const data: ManifestDataEndpoint[] = Array.isArray(o.data)
    ? (o.data as unknown[])
        .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object')
        .map((d) => ({
          id: String(d.id ?? ''),
          path: String(d.path ?? ''),
          scope: d.scope === 'multi' ? 'multi' : 'local',
        }))
    : [];

  const panels: ManifestPanel[] = Array.isArray(o.panels)
    ? (o.panels as unknown[])
        .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
        .map((p) => ({
          id: String(p.id ?? ''),
          kind: typeof p.kind === 'string' ? p.kind : 'script',
        }))
    : [];

  return {
    service: o.service,
    displayName: typeof o.displayName === 'string' ? o.displayName : undefined,
    version: typeof o.version === 'string' ? o.version : undefined,
    corpusApi: typeof o.corpusApi === 'number' ? o.corpusApi : 1,
    auth: typeof o.auth === 'string' ? o.auth : 'none',
    cernereProjectKey:
      typeof o.cernereProjectKey === 'string' ? o.cernereProjectKey : undefined,
    data,
    panels,
  };
}

// ── 正規表現フォールバック ─────────────────────────────────────────────────────

function tryRegex(corpusFileAbs: string): Manifest | null {
  // fs-util を使わず直接読む (このパスは eval 失敗時のみ)。
  let src: string;
  try {
    src = readFileSync(corpusFileAbs, 'utf8');
  } catch {
    return null;
  }
  // corpusManifest リテラルの本文を粗く切り出す。
  const start = src.search(/export\s+const\s+corpusManifest\b/);
  if (start < 0) return null;
  const body = src.slice(start);

  const service = pick(body, /service\s*:\s*['"`]([^'"`]+)['"`]/);
  if (!service) return null;
  const cernereProjectKey = pick(
    body,
    /cernereProjectKey\s*:\s*['"`]([^'"`]+)['"`]/,
  );
  const auth = pick(body, /auth\s*:\s*['"`]([^'"`]+)['"`]/) ?? 'none';
  const corpusApiStr = pick(body, /corpusApi\s*:\s*([0-9]+)/);
  const corpusApi = corpusApiStr ? Number(corpusApiStr) : 1;

  const panels: ManifestPanel[] = [];
  for (const m of body.matchAll(/kind\s*:\s*['"`]([a-zA-Z]+)['"`]/g)) {
    if (m[1]) panels.push({ id: '', kind: m[1] });
  }

  return {
    service,
    corpusApi,
    auth,
    cernereProjectKey: cernereProjectKey ?? undefined,
    data: [],
    panels,
  };
}

function pick(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m && m[1] ? m[1] : null;
}
