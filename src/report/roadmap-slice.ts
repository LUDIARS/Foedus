// 出力モデル: 事業ライン別 連結契約スライス (data/contract.json) — 層B の派生出力。
//
// 大域の ContractGraph + 全 Violation を、 各 roadmap-<line> の members[] に投影する。
// 「このラインのサービスが Cernere↔Hub 連結契約上どういう役割で、 どの finding に
// 触れているか」をラインごとに 1 ファイル (data/contract.json) で持たせる。
//
// 重要: 契約事実は二重管理しない。 ここは graph/violations を **読んで振り分ける**
// だけで、 新たな判定 (ルール) は足さない。 ライン未割当の finding は別ラインに属する
// ものとして単に落とす (各ラインは自分の members に触れる finding のみ持つ)。

import type { ContractGraph, Severity, Violation } from '../model/contract-graph.ts';
import { computeGrade, type Grade } from './grade.ts';
import type { RoadmapLine } from '../extract/roadmap.ts';
import type { SeverityCounts } from './violations.ts';

export type MemberRole =
  | 'registry' // Cernere (個人データ単一情報源 / project-token 発行)
  | 'hub:corpus' // Corpus (汎用 hub / TokenProvider)
  | 'hub:vantanhub' // VantanHub (学校 hub / plugin proxy)
  | 'leaf-service' // server/corpus.ts manifest を公開する被連結サービス
  | 'service-no-manifest' // corpus.ts はあるが manifest 抽出不能
  | 'connector-target' // VantanHub connector の接続先だが manifest 未発見
  | 'relay-peer'; // Cernere relay_pairs の端点

export type MemberStatus = 'ok' | 'violation' | 'unverified';

export interface MemberManifestSummary {
  corpusApi: number;
  auth: string;
  cernereProjectKey?: string;
  dataEndpoints: number;
  panels: number;
  source: string;
}

export interface MemberFinding {
  id: string;
  severity: Severity;
  status: Violation['status'];
  message: string;
  evidence: string[];
}

export interface MemberContract {
  repo: string;
  role: MemberRole;
  manifest: MemberManifestSummary | null;
  status: MemberStatus;
  findings: MemberFinding[];
}

export interface LineContractSlice {
  generated: string;
  line: string; // ライン code
  title: string;
  scope: 'Cernere+Hub';
  source: 'Foedus roadmap-contract';
  global: {
    grade: Grade;
    violations: number;
    skipped: number;
    reposScanned: string[];
    registrySource: string;
    oidcClientsSource: string;
  };
  grade: Grade; // ライン局所 (このラインの members に触れる violation のみ)
  summary: {
    violations: number;
    skipped: number;
    bySeverity: SeverityCounts;
    worst: Severity | null;
  };
  members: MemberContract[];
  outOfScope: string[]; // Cernere↔Hub 連結に関与しないメンバー (透明性のため明示)
}

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low'];

/** finding の同一性キー (1 finding が複数メンバーに触れても集計では 1 件)。 */
function findingKey(v: Violation): string {
  return `${v.id}|${v.subject}|${v.status}`;
}

/** root 直下のリポ名 (evidence の先頭セグメント) を小文字で返す。 */
function evidenceRepoKeys(v: Violation): string[] {
  return v.evidence
    .map((e) => e.split('/')[0]?.toLowerCase() ?? '')
    .filter(Boolean);
}

const INFRA_KEYS = new Set(['cernere', 'corpus', 'vantanhub']);

/** subject を小文字 token 化する。 */
function subjectTokens(v: Violation): string[] {
  return v.subject.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * finding が触れるリポを小文字キー集合で返す (表示用: そのラインの全 member に対し
 * 「このメンバーがこの finding に絡むか」を判定)。
 *  1. evidence の先頭パスセグメント (常にリポ名)。
 *  2. subject を token 化し、 既知リポ集合に当たるもの (relay 端点/connector 先も解決)。
 *  3. 空なら category/subject から infra リポへフォールバック
 *     (hub.* → Corpus/VantanHub、 oidc/データ系 → Cernere)。 値は捏造せず既知集合内のみ。
 */
function attributeRepoKeys(v: Violation, knownKeys: Set<string>): Set<string> {
  const hits = new Set<string>();
  for (const k of evidenceRepoKeys(v)) {
    if (knownKeys.has(k)) hits.add(k);
  }
  for (const tok of subjectTokens(v)) {
    if (knownKeys.has(tok)) hits.add(tok);
  }
  if (hits.size > 0) return hits;

  const s = v.subject.toLowerCase();
  if (s.startsWith('hub.')) {
    for (const k of ['corpus', 'vantanhub']) if (knownKeys.has(k)) hits.add(k);
  } else if (s.startsWith('oidc') || v.category === 'data-boundary' || v.category === 'security' || v.category === 'meta') {
    if (knownKeys.has('cernere')) hits.add('cernere');
  }
  return hits;
}

/**
 * finding の **主体リポ** (1 つ) を返す。 ラインへの帰属判定はこれで行う:
 * finding はその主体サービスが member であるラインにのみ計上する。
 * これにより共有 infra (Cernere) が他ラインのサービス固有ギャップ
 * (例: aedilis 未登録) を引きずらない。
 *
 *  - subject/evidence の **非 infra** リポを最優先 (leaf/connector/relay が主体)。
 *  - 非 infra が無ければ infra へ (hub.* → Corpus、 データ/oidc 系 → Cernere)。
 */
function primaryRepoKey(v: Violation, knownKeys: Set<string>): string | null {
  for (const tok of subjectTokens(v)) {
    if (knownKeys.has(tok) && !INFRA_KEYS.has(tok)) return tok;
  }
  for (const k of evidenceRepoKeys(v)) {
    if (knownKeys.has(k) && !INFRA_KEYS.has(k)) return k;
  }
  const s = v.subject.toLowerCase();
  if (s.startsWith('hub.')) {
    if (knownKeys.has('corpus')) return 'corpus';
    if (knownKeys.has('vantanhub')) return 'vantanhub';
  }
  if (knownKeys.has('cernere')) return 'cernere';
  // 最後の手段: subject/evidence の既知リポ (infra 含む)。
  for (const tok of subjectTokens(v)) if (knownKeys.has(tok)) return tok;
  for (const k of evidenceRepoKeys(v)) if (knownKeys.has(k)) return k;
  return null;
}

function roleOf(repo: string, g: ContractGraph): MemberRole | null {
  const lc = repo.toLowerCase();
  if (lc === 'cernere') return 'registry';
  if (lc === 'corpus') return 'hub:corpus';
  if (lc === 'vantanhub') return 'hub:vantanhub';
  const svc = g.services.find((s) => s.repo.toLowerCase() === lc);
  if (svc) return svc.manifest ? 'leaf-service' : 'service-no-manifest';
  if (g.hub.vantanhub.plugins.some((p) => p.connectsTo.toLowerCase() === lc)) {
    return 'connector-target';
  }
  if (g.cernere.relayPairs.some((rp) => rp.from.toLowerCase() === lc || rp.to.toLowerCase() === lc)) {
    return 'relay-peer';
  }
  return null;
}

function manifestSummary(repo: string, g: ContractGraph): MemberManifestSummary | null {
  const svc = g.services.find((s) => s.repo.toLowerCase() === repo.toLowerCase());
  if (!svc?.manifest) return null;
  const m = svc.manifest;
  return {
    corpusApi: m.corpusApi,
    auth: m.auth,
    cernereProjectKey: m.cernereProjectKey,
    dataEndpoints: m.data.length,
    panels: m.panels.length,
    source: svc.manifestSource,
  };
}

function worstSeverity(counts: SeverityCounts): Severity | null {
  for (const s of SEVERITY_ORDER) if (counts[s] > 0) return s;
  return null;
}

/** 既知リポキー集合 (graph 由来 + 全 roadmap members)。 subject token の解決に使う。 */
function buildKnownKeys(g: ContractGraph, lines: RoadmapLine[]): Set<string> {
  const keys = new Set<string>();
  for (const r of g.reposScanned) keys.add(r.toLowerCase());
  for (const s of g.services) keys.add(s.repo.toLowerCase());
  for (const p of g.hub.vantanhub.plugins) keys.add(p.connectsTo.toLowerCase());
  for (const rp of g.cernere.relayPairs) {
    keys.add(rp.from.toLowerCase());
    keys.add(rp.to.toLowerCase());
  }
  for (const line of lines) for (const m of line.members) keys.add(m.repo.toLowerCase());
  return keys;
}

export interface UnassignedFinding {
  id: string;
  severity: Severity;
  status: Violation['status'];
  subject: string;
  primary: string | null;
}

export interface RoadmapContractResult {
  slices: { dir: string; code: string; slice: LineContractSlice }[];
  /** 主体リポがどのラインの member にも属さない finding (どのラインにも計上されない)。
   *  無言で落とさず明示する (無言フォールバック禁止 = RULE_CODE §7.1)。 */
  unassigned: UnassignedFinding[];
}

/**
 * 全ラインのスライスを構築する。 各 finding はその evidence/subject が触れる
 * リポキーを持ち、 ライン内の member.repo に一致するものへ振り分ける。
 * どのラインにも帰属しない finding は unassigned に明示する。
 */
export function buildRoadmapContract(
  g: ContractGraph,
  all: Violation[],
  lines: RoadmapLine[],
): RoadmapContractResult {
  const knownKeys = buildKnownKeys(g, lines);
  const allMemberKeys = new Set<string>();
  for (const line of lines) for (const m of line.members) allMemberKeys.add(m.repo.toLowerCase());

  // finding ごとに「触れるリポ集合 (表示用)」と「主体リポ (帰属用)」を前計算。
  const attributed = all.map((v) => ({
    v,
    keys: attributeRepoKeys(v, knownKeys),
    primary: primaryRepoKey(v, knownKeys),
  }));

  const unassigned: UnassignedFinding[] = attributed
    .filter((a) => a.primary === null || !allMemberKeys.has(a.primary))
    .map((a) => ({
      id: a.v.id,
      severity: a.v.severity,
      status: a.v.status,
      subject: a.v.subject,
      primary: a.primary,
    }));

  const globalViolations = all.filter((v) => v.status === 'violation');
  const globalSkipped = all.filter((v) => v.status === 'skipped');
  const globalBy = countBySeverity(globalViolations);

  const slices = lines.map((line) => {
    const memberContracts: MemberContract[] = [];
    const outOfScope: string[] = [];
    const lineFindingKeys = new Set<string>(); // ライン集計の重複排除
    const memberKeys = new Set(line.members.map((m) => m.repo.toLowerCase()));

    // このラインに帰属する finding = 主体リポがこのラインの member であるもの。
    const inScope = attributed.filter((a) => a.primary !== null && memberKeys.has(a.primary));

    for (const member of line.members) {
      const key = member.repo.toLowerCase();
      const touching = inScope.filter((a) => a.keys.has(key));
      const findings: MemberFinding[] = touching.map((a) => ({
        id: a.v.id,
        severity: a.v.severity,
        status: a.v.status,
        message: a.v.message,
        evidence: a.v.evidence,
      }));
      const role = roleOf(member.repo, g);

      if (role === null && findings.length === 0) {
        outOfScope.push(member.repo);
        continue;
      }

      for (const a of touching) lineFindingKeys.add(findingKey(a.v));

      memberContracts.push({
        repo: member.repo,
        role: role ?? 'leaf-service',
        manifest: manifestSummary(member.repo, g),
        status: memberStatus(findings),
        findings,
      });
    }

    // ライン集計 (member 横断で重複排除した finding 集合)。
    const lineViolations = dedupByKey(
      all.filter((v) => v.status === 'violation' && lineFindingKeys.has(findingKey(v))),
    );
    const lineSkipped = dedupByKey(
      all.filter((v) => v.status === 'skipped' && lineFindingKeys.has(findingKey(v))),
    );
    const by = countBySeverity(lineViolations);

    const slice: LineContractSlice = {
      generated: g.date,
      line: line.code,
      title: line.title,
      scope: 'Cernere+Hub',
      source: 'Foedus roadmap-contract',
      global: {
        grade: computeGrade(globalBy),
        violations: globalViolations.length,
        skipped: globalSkipped.length,
        reposScanned: g.reposScanned,
        registrySource: g.cernere.registrySource,
        oidcClientsSource: g.cernere.oidcClientsSource,
      },
      grade: computeGrade(by),
      summary: {
        violations: lineViolations.length,
        skipped: lineSkipped.length,
        bySeverity: by,
        worst: worstSeverity(by),
      },
      members: memberContracts,
      outOfScope,
    };
    return { dir: line.dir, code: line.code, slice };
  });

  return { slices, unassigned };
}

function memberStatus(findings: MemberFinding[]): MemberStatus {
  if (findings.some((f) => f.status === 'violation')) return 'violation';
  if (findings.some((f) => f.status === 'skipped')) return 'unverified';
  return 'ok';
}

function dedupByKey(vs: Violation[]): Violation[] {
  const seen = new Set<string>();
  const out: Violation[] = [];
  for (const v of vs) {
    const k = findingKey(v);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

function countBySeverity(violations: Violation[]): SeverityCounts {
  const counts: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const v of violations) counts[v.severity as Severity]++;
  return counts;
}
