// Foedus CLI ビルド — esbuild で src/cli.ts を dist/cli.js に bundle する。
//
// 依存 (esbuild 本体) は外部化して node_modules から実行時解決する。 CLI は
// service-manifest 抽出のため esbuild を実行時にも呼ぶので external 必須。

import { build } from 'esbuild';
import { chmodSync } from 'node:fs';

const outfile = 'dist/cli.js';

await build({
  entryPoints: ['src/cli.ts'],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external', // esbuild 等 node_modules 依存は外部化
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'info',
});

try {
  chmodSync(outfile, 0o755);
} catch {
  // Windows では chmod は no-op。 bin 実行は node 経由なので問題ない。
}

console.log(`[build] wrote ${outfile}`);
