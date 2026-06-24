// 抽出器: Hub 連結設定 (Corpus 既定 + VantanHub プラグイン)。
//
//  - Corpus token-mode 既定: `Corpus/server/hub/tokens.ts` の makeTokenProvider が
//    既定で返すモード (passthrough)。 `.env.example` の CORPUS_TOKEN_MODE と突合。
//  - Corpus discovery 既定: `Corpus/server/hub/discovery.ts` の readDiscoveryConfig
//    既定 (mode=server) と DEFAULT_LOCAL_PROBE_PORTS。
//  - supportedCorpusApi: `Corpus/server/hub/manifest.ts` の normalize が補う corpusApi
//    既定値 (= Corpus が実装する規約バージョン)。
//  - VantanHub plugins: `VantanHub/plugins/*/index.ts` の HttpServiceConnector の
//    id と `ctx.env('*_BASE_URL')`。 `.env.example` でその env が空かを envSet に反映。

import { join } from 'node:path';
import type { DiscoveryConfig, HubModel, HubPlugin } from '../model/contract-graph.ts';
import { isDir, listSubdirs, readText, rel } from './fs-util.ts';

export function extractHubConfig(root: string): HubModel {
  const tokens = extractTokenMode(root);
  const supportedCorpusApi = extractSupportedCorpusApi(root);
  const discovery = extractDiscovery(root);
  const plugins = extractVantanHubPlugins(root);

  return {
    corpus: {
      tokenModeDefault: tokens.mode,
      supportedCorpusApi: supportedCorpusApi.value,
      discovery: discovery.config,
      sources: {
        tokenMode: tokens.source,
        discovery: discovery.source,
        corpusApi: supportedCorpusApi.source,
      },
    },
    vantanhub: { plugins },
  };
}

/** makeTokenProvider の既定分岐 + .env.example で token-mode 既定を判定。 */
function extractTokenMode(root: string): { mode: string; source: string } {
  // .env.example の CORPUS_TOKEN_MODE が一次情報 (運用既定)。
  for (const envFile of ['VantanHub/.env.example', 'Corpus/.env.example']) {
    const env = readText(join(root, envFile));
    const m = env?.match(/^\s*CORPUS_TOKEN_MODE\s*=\s*([a-z-]+)/m);
    if (m && m[1]) return { mode: m[1], source: envFile };
  }
  // env が無ければ makeTokenProvider の else 分岐 = passthrough。
  const tokensSrc = readText(join(root, 'Corpus', 'server', 'hub', 'tokens.ts'));
  if (tokensSrc && /return new PassthroughTokenProvider\(\)/.test(tokensSrc)) {
    return { mode: 'passthrough', source: 'Corpus/server/hub/tokens.ts' };
  }
  return { mode: 'passthrough', source: 'default' };
}

/** normalize の `raw.corpusApi === 'number' ? raw.corpusApi : N` の N。 */
function extractSupportedCorpusApi(root: string): {
  value: number;
  source: string;
} {
  const src = readText(join(root, 'Corpus', 'server', 'hub', 'manifest.ts'));
  const m = src?.match(/corpusApi\s*===\s*['"]number['"]\s*\?\s*[^:]+:\s*([0-9]+)/);
  if (m && m[1]) {
    return { value: Number(m[1]), source: 'Corpus/server/hub/manifest.ts' };
  }
  // 取れない場合は 1 を既定とせず明示できないが、 normalize 既定は仕様上 1。
  return { value: 1, source: 'default(1)' };
}

/** readDiscoveryConfig の既定 (CORPUS_MODE 未設定→server) + DEFAULT_LOCAL_PROBE_PORTS。 */
function extractDiscovery(root: string): {
  config: DiscoveryConfig;
  source: string;
} {
  const src = readText(join(root, 'Corpus', 'server', 'hub', 'discovery.ts'));
  let localPorts: number[] = [];
  if (src) {
    const m = src.match(/DEFAULT_LOCAL_PROBE_PORTS\s*=\s*\n?\s*['"]([0-9,]+)['"]/);
    if (m && m[1]) {
      localPorts = m[1]
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
    }
  }
  return {
    config: { mode: 'server', localPorts, serverServices: [], remoteUrl: null },
    source: src ? 'Corpus/server/hub/discovery.ts' : 'default',
  };
}

const CONNECTOR_ID_RE = /id\s*:\s*['"`]([a-z0-9-]+)['"`]/i;
const BASE_URL_ENV_RE = /env\(\s*['"`]([A-Z0-9_]+_BASE_URL)['"`]\s*\)/;

/** VantanHub の各 plugins/<id>/index.ts から connector(id, baseUrlEnv) を抽出。 */
function extractVantanHubPlugins(root: string): HubPlugin[] {
  const pluginsRoot = join(root, 'VantanHub', 'plugins');
  if (!isDir(pluginsRoot)) return [];
  const envExample = readText(join(root, 'VantanHub', '.env.example')) ?? '';

  const out: HubPlugin[] = [];
  for (const dir of listSubdirs(pluginsRoot)) {
    const file = join(pluginsRoot, dir, 'index.ts');
    const src = readText(file);
    if (!src) continue;

    // 1 ファイル内に複数 HttpServiceConnector があり得るので connector 単位で走査。
    for (const block of src.split('new HttpServiceConnector(').slice(1)) {
      const head = block.slice(0, 400);
      const idM = head.match(CONNECTOR_ID_RE);
      const envM = head.match(BASE_URL_ENV_RE);
      if (!idM || !envM) continue;
      const baseUrlEnv = envM[1] ?? '';
      out.push({
        id: idM[1] ?? '',
        connectsTo: idM[1] ?? '',
        baseUrlEnv,
        envSet: isEnvSet(envExample, baseUrlEnv),
        file: rel(root, file),
      });
    }
  }
  return out;
}

/** .env.example で `NAME=<非空>` なら true。 `NAME=` (空) は未設定 = degraded。
 *  `=` 以降は **同一行のみ** を見る (\s は改行を跨ぐので [^\n] で行末まで限定)。 */
function isEnvSet(envText: string, name: string): boolean {
  const m = envText.match(new RegExp(`^[^\\S\\n]*${name}[^\\S\\n]*=([^\\n]*)`, 'm'));
  return !!(m && m[1] !== undefined && m[1].trim().length > 0);
}
