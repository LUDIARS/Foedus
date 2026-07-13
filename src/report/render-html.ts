// 出力: 連結契約レポートの HTML ビュー (serve コマンド用)。
//
// CONTRACT.md と同じ事実を、 loopback Web ビューア向けに自己完結 HTML
// (インライン CSS / ダークテーマ) で描画する。 依存なし (テンプレート文字列のみ)。
// roadmap スライスの grade 表も併載する。 ここは描画専用 (判定はしない)。

import type { ContractReport } from './violations.ts';
import type { Grade } from './grade.ts';

export interface RoadmapLineSummary {
  line: string;
  grade: Grade;
  violations: number;
  skipped: number;
  members: number;
}

const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function sevChip(sev: string): string {
  return `<span class="sev sev-${esc(sev)}">${esc(sev)}</span>`;
}

function violationRows(report: ContractReport): string {
  if (report.violations.length === 0) {
    return `<tr><td colspan="4" class="na">違反なし</td></tr>`;
  }
  return report.violations
    .map(
      (v) => `
      <tr>
        <td>${sevChip(v.severity)}</td>
        <td class="mono">${esc(v.id)}</td>
        <td class="subj">${esc(v.subject)}</td>
        <td class="msg">${esc(v.message)}</td>
      </tr>`,
    )
    .join('');
}

function skippedRows(report: ContractReport): string {
  if (report.skipped.length === 0) return `<tr><td colspan="3" class="na">なし</td></tr>`;
  return report.skipped
    .map(
      (v) => `
      <tr>
        <td class="mono">${esc(v.id)}</td>
        <td class="subj">${esc(v.subject)}</td>
        <td class="msg">${esc(v.actual)}</td>
      </tr>`,
    )
    .join('');
}

function roadmapRows(lines: RoadmapLineSummary[]): string {
  if (lines.length === 0) return '';
  const rows = lines
    .map(
      (l) => `
      <tr>
        <td class="subj">${esc(l.line)}</td>
        <td><span class="grade g-${esc(l.grade)}">${esc(l.grade)}</span></td>
        <td>${l.members}</td>
        <td>${l.violations}</td>
        <td>${l.skipped}</td>
      </tr>`,
    )
    .join('');
  return `
  <h2>事業ライン別 (roadmap-contract)</h2>
  <table>
    <thead><tr><th>ライン</th><th>grade</th><th>members</th><th>違反</th><th>未検証</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export function renderContractHtml(
  report: ContractReport,
  roadmap: RoadmapLineSummary[],
  generatedAt: string,
): string {
  const s = report.bySeverity;
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Foedus — Cernere↔Hub 連結契約</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #0e1014; color: #d6dae0; font-family: "Segoe UI", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", sans-serif; line-height: 1.6; }
  .wrap { max-width: 1100px; margin: 0 auto; padding: 32px 20px 80px; }
  header.top { display: flex; align-items: center; gap: 14px; border-bottom: 1px solid #232733; padding-bottom: 18px; }
  .icon { font-size: 40px; }
  h1 { margin: 0; font-size: 24px; }
  .sub { color: #8b93a1; font-size: 13px; }
  h2 { font-size: 16px; margin: 34px 0 12px; color: #e6eaf0; border-left: 3px solid #7fc7e8; padding-left: 10px; }
  .grade { display: inline-block; font-weight: 700; padding: 1px 10px; border-radius: 6px; }
  .g-A { background: #14301f; color: #7ddba2; } .g-B { background: #2e2616; color: #efc56a; }
  .g-C { background: #34270f; color: #f0b15a; } .g-D { background: #34191c; color: #f0a0a8; }
  .kpis { display: flex; flex-wrap: wrap; gap: 12px; margin: 22px 0 8px; }
  .kpi { background: #151922; border: 1px solid #232733; border-radius: 10px; padding: 12px 16px; min-width: 120px; }
  .kpi .label { font-size: 11px; color: #7e8696; text-transform: uppercase; letter-spacing: .04em; }
  .kpi .val { font-size: 22px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #1d212b; vertical-align: top; }
  th { color: #8b93a1; font-weight: 500; font-size: 12px; }
  td.mono { font-family: ui-monospace, Consolas, monospace; white-space: nowrap; color: #cfd6e0; }
  td.subj { white-space: nowrap; color: #eef1f5; font-weight: 600; }
  td.msg { color: #aab2c0; font-size: 12px; }
  .na { color: #5a6170; }
  .sev { display: inline-block; font-size: 10px; font-weight: 600; padding: 1px 7px; border-radius: 4px; text-transform: uppercase; }
  .sev-critical { background: #4a1116; color: #ff9aa6; } .sev-high { background: #3a1a1d; color: #f0a0a8; }
  .sev-medium { background: #322611; color: #efc56a; } .sev-low { background: #232733; color: #9aa2b1; }
  a { color: #7fc7e8; } footer { margin-top: 44px; padding-top: 14px; border-top: 1px solid #232733; color: #6f7787; font-size: 12px; }
  code { background: #1a1f29; padding: 1px 5px; border-radius: 4px; font-size: 12px; }
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <div class="icon">🤝</div>
    <div>
      <h1>Foedus — Cernere↔Hub 連結契約 <span class="grade g-${esc(report.grade)}">${esc(report.grade)}</span></h1>
      <div class="sub">層B 横断静的チェッカー · scope ${esc(report.scope)} · 生成 ${esc(generatedAt)}</div>
    </div>
  </header>

  <div class="kpis">
    <div class="kpi"><div class="label">manifest scan</div><div class="val" style="font-size:14px">${esc(report.manifestScan.status)} (${report.manifestScan.extracted}/${report.manifestScan.scanned})</div></div>
    <div class="kpi"><div class="label">違反</div><div class="val">${report.counts.violations}</div></div>
    <div class="kpi"><div class="label">未検証 (skipped)</div><div class="val">${report.counts.skipped}</div></div>
    <div class="kpi"><div class="label">critical / high</div><div class="val">${s.critical} / ${s.high}</div></div>
    <div class="kpi"><div class="label">medium / low</div><div class="val">${s.medium} / ${s.low}</div></div>
    <div class="kpi"><div class="label">registry</div><div class="val" style="font-size:14px">${esc(report.registrySource)}</div></div>
  </div>

  <h2>違反 (violation)</h2>
  <table>
    <thead><tr><th>severity</th><th>ID</th><th>subject</th><th>message</th></tr></thead>
    <tbody>${violationRows(report)}</tbody>
  </table>

  <h2>判定不能 (skipped — 入力不足で評価できなかった項目)</h2>
  <p class="sub">値を捏造せず明示的に skip した項目 (無言フォールバック禁止 / RULE_CODE §7.1)。</p>
  <table>
    <thead><tr><th>ID</th><th>subject</th><th>理由</th></tr></thead>
    <tbody>${skippedRows(report)}</tbody>
  </table>
${roadmapRows(roadmap)}
  <footer>
    Foedus (code Fd) · loopback 読み取り専用ビューア · 静的解析の結果を毎リクエスト再生成 ·
    機械可読: <a href="/violations.json"><code>/violations.json</code></a> ·
    <a href="/roadmap-contract.json"><code>/roadmap-contract.json</code></a> ·
    <a href="/contract.md"><code>/contract.md</code></a>
  </footer>
</div>
</body>
</html>`;
}
