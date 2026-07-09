// serve: 連結契約レポートの loopback 読み取り専用 Web ビューア。
//
// Foedus は静的 CLI チェッカー (dev server 不要) という性格を保つため、 これは
// 「被レビュー対象の dev server」ではなく **生成済み静的解析結果の閲覧専用ビューア**。
// 毎リクエストで contract-check / roadmap-contract と同一パイプラインを再実行して
// 最新を返す (Hono/DB 不要、 node:http のみ)。 既定で 127.0.0.1 bind (外部公開なし)。
//
// 外部管理スキーマ (Cernere schema-export) はリクエストのたびにライブ取得するため、
// Cernere に到達できない環境では skipExternalSchema を明示指定しない限り各リクエストが
// 500 で失敗する (無言で古い/空のデータを返さない)。

import { createServer } from 'node:http';
import { buildContractGraph } from '../extract/index.ts';
import { extractRoadmapLines } from '../extract/roadmap.ts';
import { evaluateAll } from '../rules/registry.ts';
import { buildReport } from '../report/violations.ts';
import { renderContractMd } from '../report/render-md.ts';
import { buildRoadmapContract } from '../report/roadmap-slice.ts';
import { renderContractHtml, type RoadmapLineSummary } from '../report/render-html.ts';

export interface ServeOptions {
  root: string;
  port: number;
  host: string;
  cernereDbExport?: string;
  /** true なら外部管理スキーマ (Cernere schema-export) のライブ取得をスキップする
   *  (明示指定時のみ; 既定は false = 到達できなければ 500)。 */
  skipExternalSchema?: boolean;
}

interface Computed {
  reportJson: string;
  contractMd: string;
  html: string;
  roadmapIndexJson: string;
}

/** 1 リクエスト分の解析を実行して各表現を作る (常に最新の静的事実)。 */
async function compute(opts: ServeOptions): Promise<Computed> {
  const graph = await buildContractGraph({
    root: opts.root,
    cernereDbExport: opts.cernereDbExport,
    skipExternalSchema: opts.skipExternalSchema,
  });
  const all = evaluateAll(graph);
  const report = buildReport(graph, all);

  const scan = extractRoadmapLines(opts.root);
  const { slices, unassigned } = buildRoadmapContract(graph, all, scan.lines);
  const roadmapSummaries: RoadmapLineSummary[] = slices.map(({ slice }) => ({
    line: slice.line,
    grade: slice.grade,
    violations: slice.summary.violations,
    skipped: slice.summary.skipped,
    members: slice.members.length,
  }));

  return {
    reportJson: JSON.stringify(report, null, 2),
    contractMd: renderContractMd(report),
    html: renderContractHtml(report, roadmapSummaries, graph.date),
    roadmapIndexJson: JSON.stringify(
      {
        generated: graph.date,
        scope: 'Cernere+Hub',
        source: 'Foedus roadmap-contract',
        lines: slices.map(({ dir, code, slice }) => ({ dir, line: code, grade: slice.grade, summary: slice.summary })),
        unassigned,
        errors: scan.errors,
      },
      null,
      2,
    ),
  };
}

function send(res: import('node:http').ServerResponse, status: number, type: string, body: string): void {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

/** loopback ビューアを起動する (ブロッキング: 終了するまで resolve しない)。 */
export function serve(opts: ServeOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const path = (req.url ?? '/').split('?')[0];
      if (path === '/healthz') {
        send(res, 200, 'text/plain; charset=utf-8', 'ok');
        return;
      }
      // 解析は同期的に重くないが I/O があるため毎回再実行 (常に最新)。
      compute(opts)
        .then((c) => {
          switch (path) {
            case '/':
            case '/index.html':
              send(res, 200, 'text/html; charset=utf-8', c.html);
              break;
            case '/violations.json':
              send(res, 200, 'application/json; charset=utf-8', c.reportJson);
              break;
            case '/roadmap-contract.json':
              send(res, 200, 'application/json; charset=utf-8', c.roadmapIndexJson);
              break;
            case '/contract.md':
              send(res, 200, 'text/markdown; charset=utf-8', c.contractMd);
              break;
            default:
              send(res, 404, 'text/plain; charset=utf-8', 'not found');
          }
        })
        .catch((err: unknown) => {
          send(res, 500, 'text/plain; charset=utf-8', `解析失敗: ${(err as Error).message}`);
        });
    });

    server.on('error', reject);
    server.listen(opts.port, opts.host, () => {
      process.stderr.write(
        `[foedus] serve → http://${opts.host}:${opts.port}/ (loopback 読み取り専用 / root=${opts.root})\n`,
      );
    });
    // Ctrl-C で綺麗に閉じる。
    const close = () => server.close(() => resolve());
    process.on('SIGINT', close);
    process.on('SIGTERM', close);
  });
}
