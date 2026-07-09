// データの持ち方ルール (C-DATA-01〜07) — 設計書 §2.3。
//
// 各ルールは ContractGraph → Violation[] の純関数。 静的に判定可能なものは
// 'violation'、 入力 (書込経路解析 / OIDC ハンドラ等) が無く判定不能なものは
// 'skipped' を **明示** する (無言フォールバック禁止 = RULE_CODE §7.1)。

import type { ContractGraph, Violation } from '../model/contract-graph.ts';

const CERNERE_TOKEN_STORE = 'Cernere.project_oauth_tokens';

/** C-DATA-01 単一情報源(token): サービスが oauth-token 列を自前保持。 */
export function cData01(g: ContractGraph): Violation[] {
  const out: Violation[] = [];
  for (const svc of g.services) {
    const subject = svc.manifest?.service ?? svc.repo;
    for (const table of svc.localSchema.tables) {
      for (const col of table.columns) {
        if (col.flags.includes('oauth-token')) {
          out.push({
            id: 'C-DATA-01',
            severity: 'high',
            category: 'security',
            subject: `${subject}.${table.name}.${col.name}`,
            message: `サービス ${subject} がローカルに OAuth トークン列 ${table.name}.${col.name} を保持している。 トークンは Cernere ${CERNERE_TOKEN_STORE} に単一情報源化すべき。`,
            evidence: [svc.localSchema.schemaFile ?? `${svc.repo}/server/db.ts`],
            expected: `トークンは ${CERNERE_TOKEN_STORE} に集約`,
            actual: `${subject} がローカル列 ${col.name} を保持`,
            status: 'violation',
          });
        }
      }
    }
  }
  return out;
}

/** C-DATA-02 単一情報源(PII): personal-pii 列が allowlist 外で存在。 */
export function cData02(g: ContractGraph): Violation[] {
  const out: Violation[] = [];
  for (const svc of g.services) {
    const subject = svc.manifest?.service ?? svc.repo;
    for (const table of svc.localSchema.tables) {
      for (const col of table.columns) {
        if (col.flags.includes('personal-pii')) {
          out.push({
            id: 'C-DATA-02',
            severity: 'high',
            category: 'data-boundary',
            subject: `${subject}.${table.name}.${col.name}`,
            message: `サービス ${subject} が個人識別情報 ${table.name}.${col.name} を自前保持している。 個人データは Cernere 単一情報源 (allowlist: owner_user_id + display name キャッシュ) に限るべき。`,
            evidence: [svc.localSchema.schemaFile ?? `${svc.repo}/server/db.ts`],
            expected: '個人データは Cernere に集約。 ローカルは owner-ref + display-cache のみ',
            actual: `${subject} がローカル PII 列 ${col.name} を保持`,
            status: 'violation',
          });
        }
      }
    }
  }
  return out;
}

/** C-DATA-03 キャッシュ越境: 書込経路解析が必要 → 静的判定不能。 */
export function cData03(_g: ContractGraph): Violation[] {
  return [
    skipped(
      'C-DATA-03',
      'medium',
      'data-boundary',
      'display-cache',
      'display-cache 列が書込系経路 (source of truth 化) を持つかはルート/ハンドラ解析が必要。 層B では未実装。 層C (LLM) もしくは route 抽出の追加で評価する。',
      'display-cache は読み取り専用 (Cernere が権威)',
      'ルート解析が無く書込経路を静的に追跡できない',
    ),
  ];
}

/** C-DATA-04 opt-out 伝播: 削除経路の到達解析が必要 → 静的判定不能。 */
export function cData04(g: ContractGraph): Violation[] {
  const note = g.cernere.personalDataColumns.length
    ? 'Cernere に user_data_optouts / project_oauth_tokens は存在するが、 opt-out→token削除→relay失効の到達性は静的に追えない。'
    : 'opt-out 伝播の評価には削除経路の到達解析が必要。';
  return [
    skipped(
      'C-DATA-04',
      'medium',
      'data-boundary',
      'opt-out-propagation',
      `${note} 層C (横断フロー完全性) で評価する。`,
      'opt-out → token 削除 → relay 失効が end-to-end で閉じる',
      '削除経路の到達解析が層B 未実装',
    ),
  ];
}

/** C-DATA-05 機微暗号化境界: 書込箇所の暗号化ヘルパ経由判定が必要 → 静的判定不能。 */
export function cData05(g: ContractGraph): Violation[] {
  const sensitive = g.cernere.personalDataColumns
    .map((c) => `${c.table}.${c.column}`)
    .slice(0, 8);
  return [
    skipped(
      'C-DATA-05',
      'high',
      'security',
      'Cernere.sensitive-columns',
      `機微列 (${sensitive.join(', ') || '抽出なし'}) が暗号化ヘルパ (encryptSecret) 経由で書かれているかは書込箇所の解析が必要。 層B では未実装。`,
      'totp_secret / google_*_token / *refresh* は暗号化して書込',
      '書込箇所の静的解析が層B 未実装',
    ),
  ];
}

/** C-DATA-06 claim 最小化: userinfo/connected の scope 解析が必要 → 静的判定不能。 */
export function cData06(_g: ContractGraph): Violation[] {
  return [
    skipped(
      'C-DATA-06',
      'medium',
      'security',
      'oidc.userinfo',
      'userinfo / connected が宣言 scope 外の属性を返すかは OIDC ハンドラ解析が必要。 層B では未実装。',
      'userinfo は宣言 scope の属性のみ返す',
      'OIDC ハンドラ解析が層B 未実装',
    ),
  ];
}

/** C-DATA-07 境界文書同期: spec の持つ/持たないと schema の乖離。 */
export function cData07(g: ContractGraph): Violation[] {
  const { holds, notHolds, docFiles } = g.cernere.boundary;
  if (holds.length === 0 && notHolds.length === 0) {
    return [
      skipped(
        'C-DATA-07',
        'low',
        'meta',
        'Cernere.spec/data',
        'Cernere/spec/data/*.md に「持つ/持たない」記述が見つからず、 境界文書と schema の乖離を判定できない。',
        'spec の境界宣言と実 schema が一致',
        '境界文書 (持つ/持たない) が未検出',
      ),
    ];
  }
  // 抽出はできたが意味的 diff は層C (LLM) に委譲する。 静的事実のみ skipped で残す。
  return [
    skipped(
      'C-DATA-07',
      'low',
      'meta',
      'Cernere.spec/data',
      `境界文書を ${docFiles.join(', ')} から抽出 (holds:${holds.length} / notHolds:${notHolds.length})。 schema との意味的乖離判定は層C へ委譲。`,
      'spec の境界宣言と実 schema が一致',
      '意味的 diff は層B 範囲外 (事実のみ抽出)',
    ),
  ];
}

/**
 * C-DATA-08 外部管理スキーマの個人データ棚卸し: `graph.cernere.externalProjectSchemas`
 * (Foedus `schemas/*.json` 経由で Cernere にオーサリングされた per-user プロフィール等)
 * の機微列を一覧化する。 この機構自体が Cernere 単一情報源化の**正規経路**であり
 * C-DATA-01/02 (自前保持の是正) とは逆に「意図通り Cernere に置かれている」ことの
 * 確認が目的。 そのため severity は低め (low) の review-focused な violation とし、
 * critical/high 側の是正対象とは明確に区別する (C-DATA-07 と同様の informational 事実提示)。
 */
export function cData08(g: ContractGraph): Violation[] {
  const out: Violation[] = [];
  for (const schema of g.cernere.externalProjectSchemas) {
    for (const col of schema.columns) {
      if (!['personal-pii', 'oauth-token', 'password'].includes(col.flag)) continue;
      const category: Violation['category'] =
        col.flag === 'personal-pii' ? 'data-boundary' : 'security';
      out.push({
        id: 'C-DATA-08',
        severity: 'low',
        category,
        subject: `external:${schema.key}.${col.column}`,
        message: `外部管理スキーマ ${schema.key} (${schema.file}) の列 ${col.column} は機微分類 ${col.flag}。 Cernere 汎用プロジェクトスキーマ機構経由でホストされる個人データとして棚卸しのため記録 (是正指示ではなくレビュー観点)。`,
        evidence: [schema.file],
        expected: '機微列は Cernere project-schema 経由で単一情報源化 (本件は想定通りの配置)',
        actual: `${schema.key}.${col.column} が ${col.flag} として外部管理スキーマに存在`,
        status: 'violation',
      });
    }
  }
  return out;
}

function skipped(
  id: string,
  severity: Violation['severity'],
  category: Violation['category'],
  subject: string,
  message: string,
  expected: string,
  actual: string,
): Violation {
  return { id, severity, category, subject, message, evidence: [], expected, actual, status: 'skipped' };
}
