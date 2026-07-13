// foedus CLI — 設計書 §2.6 / §2.7。
//
//   foedus contract-check    --root <dir> [--repos a,b] [--cernere-db-export f.json]
//                            [--json|--md] [--out <dir>] [--ci] [--skip-external-schema]
//   foedus roadmap-contract  --root <dir> [--cernere-db-export f.json] [--repos a,b]
//                            [--out <dir>] [--dry] [--skip-external-schema]
//   foedus serve             --root <dir> [--port 17340] [--host 127.0.0.1] [--cernere-db-export f]
//                            [--skip-external-schema]
//
// 既定は exit 0 (レビュー用途優先)。 --ci 指定時は critical/high 違反または
// manifest 抽出が degraded なら exit 1。
// 前提 (root の存在等) は入口で検証し、 満たさなければ即エラー (fail-fast)。
//
// 外部管理スキーマ (Cernere schema-export) は環境変数 CERNERE_BASE_URL /
// FOEDUS_CERNERE_EXPORT_TOKEN からライブ取得する (extract/cernere-schema-client.ts)。
// 未設定・到達不能なら fail-fast する。 Cernere に到達できないことが分かっている
// 環境 (例: 現状の CI) でのみ --skip-external-schema を明示指定し、 degraded 実行
// (外部管理スキーマの棚卸し (C-DATA-08) を省略) を選べる。

import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildContractGraph } from './extract/index.ts';
import { extractRoadmapLines } from './extract/roadmap.ts';
import { evaluateAll } from './rules/registry.ts';
import { buildReport } from './report/violations.ts';
import { renderContractMd } from './report/render-md.ts';
import { buildRoadmapContract } from './report/roadmap-slice.ts';
import { serve } from './serve/server.ts';

/** serve の既定ポート。 LUDIARS PORT-MAP の loopback only レンジ (17000-17999)。 */
const DEFAULT_SERVE_PORT = 17340;
const DEFAULT_SERVE_HOST = '127.0.0.1';

interface CliArgs {
  command: string;
  root?: string;
  repos?: string[];
  cernereDbExport?: string;
  json: boolean;
  md: boolean;
  out?: string;
  ci: boolean;
  dry: boolean;
  port?: number;
  host?: string;
  skipExternalSchema: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    command: argv[0] ?? '',
    json: false,
    md: false,
    ci: false,
    dry: false,
    skipExternalSchema: false,
  };
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
      case '--port': {
        const p = Number(argv[++i]);
        if (!Number.isInteger(p) || p < 1 || p > 65535) {
          throw new Error(`--port は 1-65535 の整数: ${argv[i]}`);
        }
        args.port = p;
        break;
      }
      case '--host':
        args.host = argv[++i];
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
      case '--dry':
        args.dry = true;
        break;
      case '--skip-external-schema':
        args.skipExternalSchema = true;
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
  foedus contract-check   --root <Ars dir> [options]
  foedus roadmap-contract --root <Ars dir> [options]   # 連結契約を事業ライン別に投影

環境変数 (外部管理スキーマのライブ取得に必須。 --skip-external-schema 指定時は不要):
  CERNERE_BASE_URL             Cernere の到達先 (例: http://localhost:8787)
  FOEDUS_CERNERE_EXPORT_TOKEN  GET /api/admin/projects/schema-export 用の Bearer token
                                (admin または project/service token)

contract-check options:
  --root <dir>               走査ルート (例 E:/Document/Ars) [必須]
  --repos a,b,c              対象サービスを絞る (既定: corpus.ts 保有リポ全部)
  --cernere-db-export <f>    runtime 登録分 (managed_projects/oidc_clients) を JSON 補完
  --json                     violations.json を出力 (--out 無しなら stdout)
  --md                       CONTRACT.md を出力 (--out 無しなら stdout)
  --out <dir>                出力先ディレクトリ (violations.json + CONTRACT.md)
  --ci                       critical/high 違反または manifest 抽出が degraded なら exit 1 (既定は exit 0)
  --skip-external-schema     外部管理スキーマ (Cernere schema-export) のライブ取得を
                              明示的にスキップする (Cernere に到達できない環境向け。
                              C-DATA-08 の棚卸しが空になる degraded モード)

roadmap-contract options:
  --root <dir>               走査ルート (roadmap-* を含む) [必須]
  --cernere-db-export <f>    runtime 登録分を JSON 補完
  --repos a,b,c              対象サービスを絞る
  --out <dir>                集約 index (roadmap-contract.json) も書き出す
  --dry                      ファイルを書かずに振り分け結果だけ表示する
  --skip-external-schema     外部管理スキーマのライブ取得を明示的にスキップする

serve options (loopback 読み取り専用ビューア):
  --root <dir>               走査ルート [必須]
  --port <n>                 待受ポート (既定 ${DEFAULT_SERVE_PORT})
  --host <addr>              bind アドレス (既定 ${DEFAULT_SERVE_HOST} = 外部公開なし)
  --cernere-db-export <f>    runtime 登録分を JSON 補完
  --skip-external-schema     外部管理スキーマのライブ取得を明示的にスキップする
`;

/** --root / --cernere-db-export の fail-fast 入口検証。 解決済み root を返す。 */
function validateRoot(args: CliArgs): string {
  if (!args.root) {
    throw new Error('--root は必須です。');
  }
  const root = resolve(args.root);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`--root が存在しないかディレクトリではありません: ${root}`);
  }
  if (args.cernereDbExport && !existsSync(args.cernereDbExport)) {
    throw new Error(`--cernere-db-export が見つかりません: ${args.cernereDbExport}`);
  }
  return root;
}

/** --skip-external-schema 指定時、 degraded 実行であることを明示的に警告する。 */
function warnIfExternalSchemaSkipped(args: CliArgs): void {
  if (args.skipExternalSchema) {
    process.stderr.write(
      '[foedus] --skip-external-schema 指定: 外部管理スキーマ (Cernere schema-export) の' +
        ' ライブ取得を省略します。C-DATA-08 (外部管理スキーマの個人データ棚卸し) は' +
        ' 0 件になります (この実行は degraded モードです)。\n',
    );
  }
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === 'help' || args.command === '') {
    process.stdout.write(USAGE);
    return 0;
  }
  switch (args.command) {
    case 'contract-check':
      return runContractCheck(args);
    case 'roadmap-contract':
      return runRoadmapContract(args);
    case 'serve':
      return runServe(args);
    default:
      process.stderr.write(`未知のコマンド: ${args.command}\n\n${USAGE}`);
      return 2;
  }
}

async function runContractCheck(args: CliArgs): Promise<number> {
  const root = validateRoot(args);
  warnIfExternalSchemaSkipped(args);

  // ── 抽出 → 評価 → 集計 ─────────────────────────────────────────────────────
  const graph = await buildContractGraph({
    root,
    repos: args.repos,
    cernereDbExport: args.cernereDbExport,
    skipExternalSchema: args.skipExternalSchema,
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
  if (
    args.ci &&
    (report.bySeverity.critical > 0 ||
      report.bySeverity.high > 0 ||
      report.manifestScan.status === 'degraded')
  ) {
    return 1;
  }
  return 0;
}

/**
 * roadmap-contract: 連結契約を事業ライン別に投影し、 各 roadmap-<line>/data/contract.json
 * を書き出す。 契約事実は contract-check と同一パイプライン (graph→evaluateAll) を共有し、
 * ここでは振り分けるだけ (二重管理しない)。
 */
async function runRoadmapContract(args: CliArgs): Promise<number> {
  const root = validateRoot(args);
  warnIfExternalSchemaSkipped(args);

  const graph = await buildContractGraph({
    root,
    repos: args.repos,
    cernereDbExport: args.cernereDbExport,
    skipExternalSchema: args.skipExternalSchema,
  });
  const all = evaluateAll(graph);

  const scan = extractRoadmapLines(root);
  if (scan.lines.length === 0) {
    process.stderr.write(`[foedus] roadmap-* が ${root} に見つかりません (data/services.json 必須)。\n`);
    for (const e of scan.errors) process.stderr.write(`  - ${e.dir}: ${e.message}\n`);
    return 2;
  }

  const { slices, unassigned } = buildRoadmapContract(graph, all, scan.lines);

  for (const { dir, slice } of slices) {
    const dataDir = join(root, dir, 'data');
    const target = join(dataDir, 'contract.json');
    const body = JSON.stringify(slice, null, 2);
    if (!args.dry) {
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(target, body + '\n', 'utf8');
    }
    const s = slice.summary;
    process.stderr.write(
      `[foedus] ${slice.line.padEnd(16)} grade=${slice.grade} ` +
        `members=${slice.members.length} violations=${s.violations} skipped=${s.skipped} ` +
        `${args.dry ? '(dry)' : '→ ' + dir + '/data/contract.json'}\n`,
    );
  }
  for (const e of scan.errors) {
    process.stderr.write(`[foedus] skip ${e.dir}: ${e.message}\n`);
  }

  // どのラインにも帰属しなかった finding を明示する (無言で落とさない)。
  if (unassigned.length > 0) {
    process.stderr.write(
      `[foedus] どのラインにも未帰属の finding ${unassigned.length} 件 (主体サービスが roadmap-* の member 不在):\n`,
    );
    for (const u of unassigned) {
      process.stderr.write(`  - [${u.severity}/${u.status}] ${u.id} ${u.subject} (primary=${u.primary ?? 'なし'})\n`);
    }
  }

  // 集約 index は --out 指定時のみ (HTTP 非経由 consumer 用の可搬スナップショット)。
  if (args.out) {
    mkdirSync(args.out, { recursive: true });
    const index = {
      generated: graph.date,
      scope: 'Cernere+Hub' as const,
      source: 'Foedus roadmap-contract',
      lines: slices.map(({ dir, code, slice }) => ({
        dir,
        line: code,
        grade: slice.grade,
        summary: slice.summary,
      })),
      unassigned,
      errors: scan.errors,
    };
    writeFileSync(join(args.out, 'roadmap-contract.json'), JSON.stringify(index, null, 2) + '\n', 'utf8');
    process.stderr.write(`[foedus] index → ${join(args.out, 'roadmap-contract.json')}\n`);
  }

  return 0;
}

/**
 * serve: 連結契約レポートの loopback 読み取り専用 Web ビューア。 被レビュー対象の
 * dev server ではなく、 生成済み静的解析結果の閲覧専用 (毎リクエスト再解析で最新)。
 */
async function runServe(args: CliArgs): Promise<number> {
  const root = validateRoot(args);
  warnIfExternalSchemaSkipped(args);
  await serve({
    root,
    port: args.port ?? DEFAULT_SERVE_PORT,
    host: args.host ?? DEFAULT_SERVE_HOST,
    cernereDbExport: args.cernereDbExport,
    skipExternalSchema: args.skipExternalSchema,
  });
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
  out.push(
    `manifest scan: ${report.manifestScan.status} (extracted=${report.manifestScan.extracted} skipped=${report.manifestScan.skipped.length})`,
  );
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
