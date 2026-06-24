// CONTRACT.md レンダリング — 設計書 §2.4。
//
// 人間向けの表。 severity 別に違反を並べ、 skipped (判定不能) を **別節** で
// 明示する (無言フォールバック禁止の可観測化)。

import type { Severity, Violation } from '../model/contract-graph.ts';
import type { ContractReport } from './violations.ts';

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low'];

export function renderContractMd(r: ContractReport): string {
  const lines: string[] = [];
  lines.push('# Cernere ↔ Hub 連結契約レポート (CONTRACT.md)');
  lines.push('');
  lines.push(`> 生成: ${r.date} / scope: ${r.scope} / 総合グレード: **${r.grade}**`);
  lines.push('>');
  lines.push(
    `> registry: ${r.registrySource} / oidc_clients: ${r.oidcClientsSource} / 走査リポ: ${r.reposScanned.join(', ')}`,
  );
  lines.push('');

  // ── サマリ ──────────────────────────────────────────────────────────────
  lines.push('## サマリ');
  lines.push('');
  lines.push('| severity | 件数 |');
  lines.push('|---|---|');
  for (const sev of SEVERITY_ORDER) {
    lines.push(`| ${sev} | ${r.bySeverity[sev]} |`);
  }
  lines.push(`| **violation 合計** | **${r.counts.violations}** |`);
  lines.push(`| skipped (判定不能) | ${r.counts.skipped} |`);
  lines.push('');

  // ── 違反 ────────────────────────────────────────────────────────────────
  lines.push('## 違反 (violation)');
  lines.push('');
  if (r.violations.length === 0) {
    lines.push('検出された違反はありません。');
    lines.push('');
  } else {
    const sorted = [...r.violations].sort(
      (a, b) =>
        SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
        a.id.localeCompare(b.id),
    );
    lines.push('| ID | severity | subject | message | evidence |');
    lines.push('|---|---|---|---|---|');
    for (const v of sorted) lines.push(rowFor(v));
    lines.push('');
  }

  // ── skipped (判定不能) ───────────────────────────────────────────────────
  lines.push('## 判定不能 (skipped — 入力不足で評価できなかった項目)');
  lines.push('');
  lines.push(
    '以下は値を捏造せず明示的に skip した項目 (無言フォールバック禁止 / RULE_CODE §7.1)。',
  );
  lines.push('');
  if (r.skipped.length === 0) {
    lines.push('skipped はありません。');
    lines.push('');
  } else {
    lines.push('| ID | severity | subject | 理由 (actual) | message |');
    lines.push('|---|---|---|---|---|');
    for (const v of r.skipped) {
      lines.push(
        `| ${v.id} | ${v.severity} | ${esc(v.subject)} | ${esc(v.actual)} | ${esc(v.message)} |`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

function rowFor(v: Violation): string {
  const ev = v.evidence.map((e) => `\`${e}\``).join('<br>');
  return `| ${v.id} | ${v.severity} | ${esc(v.subject)} | ${esc(v.message)} | ${ev} |`;
}

/** Markdown テーブルセル用エスケープ (パイプ / 改行)。 */
function esc(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
