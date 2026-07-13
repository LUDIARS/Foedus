// 出力モデル: violations.json の構造と集計 — 設計書 §2.4 / §3.3。
//
// status='violation' のみを bySeverity に集計し、 status='skipped' は別配列に
// 分離する (判定不能を件数に混ぜない = 透明性)。

import type {
  ContractGraph,
  ExternalProjectSchema,
  ManifestSkipReason,
  Severity,
  Violation,
} from '../model/contract-graph.ts';
import { computeGrade, type Grade } from './grade.ts';

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface ContractReport {
  date: string;
  scope: 'Cernere+Hub';
  reposScanned: string[];
  registrySource: string;
  oidcClientsSource: string;
  grade: Grade;
  violations: Violation[]; // status='violation' のみ
  skipped: Violation[]; // status='skipped' のみ
  bySeverity: SeverityCounts;
  counts: { violations: number; skipped: number };
  /** Extraction is degraded whenever any discovered corpus.ts was skipped. */
  manifestScan: {
    status: 'complete' | 'degraded';
    scanned: number;
    extracted: number;
    skipped: { repo: string; manifestFile?: string; reason: ManifestSkipReason }[];
  };
  /** Foedus `schemas/*.json` からオーサリングされた外部管理 Cernere プロジェクトスキーマ。 */
  externalProjectSchemas: ExternalProjectSchema[];
}

export function buildReport(
  g: ContractGraph,
  all: Violation[],
): ContractReport {
  const violations = all.filter((v) => v.status === 'violation');
  const skipped = all.filter((v) => v.status === 'skipped');
  const bySeverity = countBySeverity(violations);
  const manifestSkipped = g.services
    .filter((service) => service.manifestSource === 'skipped')
    .map((service) => ({
      repo: service.repo,
      manifestFile: service.manifestFile,
      // A skipped source is constructed with a reason by the extractor. Keep a
      // defensive fallback so reports can never claim a complete scan.
      reason: service.manifestSkipReason ?? 'invalid-manifest',
    }));
  return {
    date: g.date,
    scope: 'Cernere+Hub',
    reposScanned: g.reposScanned,
    registrySource: g.cernere.registrySource,
    oidcClientsSource: g.cernere.oidcClientsSource,
    grade: computeGrade(bySeverity),
    violations,
    skipped,
    bySeverity,
    counts: { violations: violations.length, skipped: skipped.length },
    manifestScan: {
      status: manifestSkipped.length === 0 ? 'complete' : 'degraded',
      scanned: g.services.length,
      extracted: g.services.length - manifestSkipped.length,
      skipped: manifestSkipped,
    },
    externalProjectSchemas: g.cernere.externalProjectSchemas,
  };
}

function countBySeverity(violations: Violation[]): SeverityCounts {
  const counts: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const v of violations) counts[v.severity as Severity]++;
  return counts;
}
