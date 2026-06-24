// foedus CLI — 設計書 §2.6。
//
//   foedus contract-check --root <dir> [--repos a,b] [--cernere-db-export f.json]
//                         [--json|--md] [--out <dir>] [--ci]
//
// 既定は exit 0 (レビュー用途優先)。 --ci 指定時のみ critical/high 違反で exit 1。
// 前提 (root の存在等) は入口で検証し、 満たさなければ即エラー (fail-fast)。

import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildContractGraph } from './extract/index.ts';
import { evaluateAll } from './rules/registry.ts';
import { buildReport } from './report/violations.ts';
import { renderContractMd } from './report/render-md.ts';

interface CliArgs {
  command: string;
  root?: string;
  repos?: string[];
  cernereDbExport?: string;
  json: boolean;
  md: boolean;
  out?: string;
  ci: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { command: argv[0] ?? '', json: false, md: false, ci: false };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--root':
        args.root = argv[++i];
        break;
      case '--repos':
        args.repos = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
        break;
      case '--cernere-db-export':
        args.cernereDbExport = argv[++i];
        break;
      case '--out':
        args.out = argv[++i];
        break;
      case '--json':
        args.json = true;
        break;
      case '--md':
        args.md = true;
        break;
      case '--ci':
        args.ci = true;
        break;
      case '-h':
      case '--help':
        args.command = 'help';
        break;
      default:
        throw new Error(`未知の引数: ${a}`);
    }
  }
  return args;
}

const USAGE = `foedus — Cernere↔Hub 連結契約チェッカー (層B)

使い方:
  foedus contract-check --root <Ars dir> [options]

options:
  --root <dir>               走査ルート (例 E:/Document/Ars) [必須]
  --repos a,b,c              対象サービスを絞る (既定: corpus.ts 保有リポ全部)
  --cernere-db-export <f>    runtime 登録分 (managed_projects/oidc_clients) を JSON 補完
  --json                     violations.json を出力 (--out 無しなら stdout)
  --md                       CONTRACT.md を出力 (--out 無しなら stdout)
  --out <dir>                出力先ディレクトリ (violations.json + CONTRACT.md)
  --ci                       critical/high 違反があれば exit 1 (既定は exit 0)
`;

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === 'help' || args.command === '') {
    process.stdout.write(USAGE);
    return 0;
  }
  if (args.command !== 'contract-check') {
    process.stderr.write(`未知のコマンド: ${args.command}\n\n${USAGE}`);
    return 2;
  }

  // ── fail-fast 入口検証 ─────────────────────────────────────────────────────
  if (!args.root) {
    process.stderr.write('--root は必須です。\n');
    return 2;
  }
  const root = resolve(args.root);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    process.stderr.write(`--root が存在しないかディレクトリではありません: ${root}\n`);
    return 2;
  }
  if (args.cernereDbExport && !existsSync(args.cernereDbExport)) {
    process.stderr.write(`--cernere-db-export が見つかりません: ${args.cernereDbExport}\n`);
    return 2;
  }

  // ── 抽出 → 評価 → 集計 ─────────────────────────────────────────────────────
  const graph = await buildContractGraph({
    root,
    repos: args.repos,
    cernereDbExport: args.cernereDbExport,
  });
  const all = evaluateAll(graph);
  const report = buildReport(graph, all);

  const json = JSON.stringify(report, null, 2);
  const md = renderContractMd(report);

  // ── 出力 ────────────────────────────────────────────────────────────────
  if (args.out) {
    mkdirSync(args.out, { recursive: true });
    const wantJson = args.json || !args.md;
    const wantMd = args.md || !args.json;
    if (wantJson) writeFileSync(join(args.out, 'violations.json'), json, 'utf8');
    if (wantMd) writeFileSync(join(args.out, 'CONTRACT.md'), md, 'utf8');
    process.stderr.write(
      `[foedus] grade=${report.grade} violations=${report.counts.violations} skipped=${report.counts.skipped} → ${args.out}\n`,
    );
  } else if (args.json) {
    process.stdout.write(json + '\n');
  } else if (args.md) {
    process.stdout.write(md + '\n');
  } else {
    printSummary(report);
  }

  // ── 終了コード ──────────────────────────────────────────────────────────
  if (args.ci && (report.bySeverity.critical > 0 || report.bySeverity.high > 0)) {
    return 1;
  }
  return 0;
}

function printSummary(report: ReturnType<typeof buildReport>): void {
  const s = report.bySeverity;
  const out: string[] = [];
  out.push(`grade: ${report.grade}`);
  out.push(
    `violations: ${report.counts.violations} (critical=${s.critical} high=${s.high} medium=${s.medium} low=${s.low})`,
  );
  out.push(`skipped: ${report.counts.skipped}`);
  out.push('');
  for (const v of report.violations) {
    out.push(`  [${v.severity}] ${v.id} ${v.subject}`);
  }
  process.stdout.write(out.join('\n') + '\n');
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    process.stderr.write(`[foedus] 失敗: ${(err as Error).message}\n`);
    process.exitCode = 2;
  });
