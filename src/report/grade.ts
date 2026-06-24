// グレード導出 (AIFormat 流用) — 設計書 §2.4。
//
//   critical ≥ 1 → D
//   high     ≥ 1 → C
//   medium | low のみ → B
//   0 → A
//
// skipped は判定不能であり減点しない (件数に含めない)。

import type { SeverityCounts } from './violations.ts';

export type Grade = 'A' | 'B' | 'C' | 'D';

export function computeGrade(counts: SeverityCounts): Grade {
  if (counts.critical >= 1) return 'D';
  if (counts.high >= 1) return 'C';
  if (counts.medium >= 1 || counts.low >= 1) return 'B';
  return 'A';
}
