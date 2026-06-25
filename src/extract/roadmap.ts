// 抽出器: 事業ライン別ロードマップ (`<root>/roadmap-*/data/services.json`)。
//
// roadmap-<line> リポは LUDIARS の事業ライン正本 (project_business_line_roadmaps)。
// 各リポの data/services.json が「そのラインに属するサービス (members[])」を持つ。
// Foedus はこれを読んで Cernere↔Hub 連結契約をライン単位にスライスする (層B の派生出力)。
//
// 正本は各 roadmap-* の data/services.json。 ここでは **読み取りのみ** で値を捏造しない
// (無言フォールバック禁止 = RULE_CODE §7.1)。 services.json が無い/壊れている roadmap-*
// は errors に明示して飛ばす。

import { join } from 'node:path';
import { isDir, listSubdirs, readText } from './fs-util.ts';

/** roadmap-<line> の data/services.json の members[] 1 件 (契約スライスに必要な最小フィールド)。 */
export interface RoadmapMember {
  repo: string;
  role: string;
  importance: number;
  status: string;
  statusLabel?: string;
  completion: number | null;
  note?: string;
  lines: string[];
}

export interface RoadmapLine {
  dir: string; // 'roadmap-personal-ai'
  code: string; // 'PERSONAL-AI'
  title: string;
  visibility?: string;
  members: RoadmapMember[];
}

export interface RoadmapScan {
  lines: RoadmapLine[];
  errors: { dir: string; message: string }[];
}

/**
 * `<root>/roadmap-*` を走査し、 各リポの data/services.json から事業ラインと
 * メンバー構成を抽出する。 roadmap-index は集約専用で services.json を持たないため除外。
 */
export function extractRoadmapLines(root: string): RoadmapScan {
  const lines: RoadmapLine[] = [];
  const errors: { dir: string; message: string }[] = [];

  const dirs = listSubdirs(root).filter(
    (n) => /^roadmap-/.test(n) && n !== 'roadmap-index',
  );

  for (const dir of dirs) {
    const repoAbs = join(root, dir);
    if (!isDir(repoAbs)) continue;
    const svcPath = join(repoAbs, 'data', 'services.json');
    const raw = readText(svcPath);
    if (raw === null) {
      errors.push({ dir, message: 'data/services.json が無い (読めない)' });
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      errors.push({ dir, message: `services.json パース失敗: ${(e as Error).message}` });
      continue;
    }
    const obj = parsed as { line?: Record<string, unknown>; members?: unknown[] };
    const lineMeta = obj.line ?? {};
    const code = String(lineMeta.code ?? lineMeta.id ?? dir.replace(/^roadmap-/, '').toUpperCase());
    const members: RoadmapMember[] = Array.isArray(obj.members)
      ? obj.members.map((m) => normalizeMember(m as Record<string, unknown>))
      : [];
    lines.push({
      dir,
      code,
      title: String(lineMeta.title ?? code),
      visibility: lineMeta.visibility ? String(lineMeta.visibility) : undefined,
      members,
    });
  }

  return { lines, errors };
}

function normalizeMember(m: Record<string, unknown>): RoadmapMember {
  return {
    repo: String(m.repo ?? ''),
    role: String(m.role ?? ''),
    importance: typeof m.importance === 'number' ? m.importance : 1,
    status: String(m.status ?? ''),
    statusLabel: m.statusLabel ? String(m.statusLabel) : undefined,
    completion: typeof m.completion === 'number' ? m.completion : null,
    note: m.note ? String(m.note) : undefined,
    lines: Array.isArray(m.lines) ? m.lines.map(String) : [],
  };
}
