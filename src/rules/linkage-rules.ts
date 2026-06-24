// Hub 連結設計ルール (H-LINK-01〜08) — 設計書 §2.3。
//
// provider (service manifest) ↔ consumer (Cernere registry / hub config) の二側を
// 突合する。 静的に取れない入力 (oidc_clients runtime 登録 / route 解析等) は
// 'skipped' を明示する (無言フォールバック禁止)。

import type { ContractGraph, Violation } from '../model/contract-graph.ts';

const MIGRATIONS = 'Cernere/migrations/';

function managedKeySet(g: ContractGraph): Set<string> {
  return new Set(g.cernere.managedProjects.map((p) => p.key));
}

function serviceManifestNames(g: ContractGraph): Set<string> {
  const s = new Set<string>();
  for (const svc of g.services) {
    if (svc.manifest?.service) s.add(svc.manifest.service.toLowerCase());
  }
  return s;
}

/**
 * H-LINK-01 projectKey 実在性: manifest.cernereProjectKey ∉ managedProjects。
 *
 * 3 段階で判定する (H-LINK-01 追跡で判明した精緻化):
 *  - seed/db-export に存在 → 指摘なし。
 *  - 静的 seed に無いが `server/service/<key>/` テンプレートあり → **low**。
 *    Cernere オンボード済みで managed_projects 行は runtime/admin 登録の蓋然性が高い。
 *    確定には `--cernere-db-export` が要る (値を捏造しない)。
 *  - seed にも service テンプレートにも痕跡なし → **high** (真のギャップ)。
 */
export function hLink01(g: ContractGraph): Violation[] {
  const keys = managedKeySet(g);
  const templates = new Set(g.cernere.serviceTemplates);
  const isStatic = g.cernere.registrySource === 'migrations';
  const out: Violation[] = [];
  for (const svc of g.services) {
    const key = svc.manifest?.cernereProjectKey;
    if (!key) continue;
    if (keys.has(key)) continue;

    // テンプレートはオンボード済みの弱いシグナル。 静的レジストリ (migrations のみ)
    // のときだけ「runtime 登録の蓋然性」として severity を下げる。 db-export 併合済みで
    // なお不在なら runtime 行も見えているはずなので high のまま。
    if (isStatic && templates.has(key)) {
      out.push({
        id: 'H-LINK-01',
        severity: 'low',
        category: 'linkage-contract',
        subject: svc.manifest?.service ?? svc.repo,
        message: `manifest.cernereProjectKey='${key}' は migration シードに無いが Cernere/server/service/${key}/ テンプレートが存在する (オンボード済み)。 managed_projects 行は runtime/admin 登録の蓋然性が高い。 確定には --cernere-db-export が必要。`,
        evidence: [
          svc.manifestFile ?? `${svc.repo}/server/corpus.ts`,
          `Cernere/server/service/${key}/schema.json`,
        ],
        expected: `managed_projects に key='${key}' が登録されている (seed もしくは runtime)`,
        actual: `seed 済みキー: [${[...keys].sort().join(', ')}] に '${key}' 無し / service テンプレートは有り`,
        status: 'violation',
      });
      continue;
    }

    const runtimeNote = isStatic
      ? ' (--cernere-db-export 未指定のため runtime 登録分は不可視。 migration シードにも service テンプレートにも不在)'
      : ' (migration シード + db-export いずれにも不在)';
    out.push({
      id: 'H-LINK-01',
      severity: 'high',
      category: 'linkage-contract',
      subject: svc.manifest?.service ?? svc.repo,
      message: `manifest.cernereProjectKey='${key}' が Cernere managed_projects に存在しない${runtimeNote}。 project-token 発行に必要な登録が欠落している。`,
      evidence: [svc.manifestFile ?? `${svc.repo}/server/corpus.ts`, MIGRATIONS],
      expected: `managed_projects に key='${key}' が seed される`,
      actual: `seed 済みキー: [${[...keys].sort().join(', ')}] に '${key}' 無し`,
      status: 'violation',
    });
  }
  return out;
}

/** H-LINK-02 auth モード整合: project-token 要求だが hub 既定が passthrough。 */
export function hLink02(g: ContractGraph): Violation[] {
  const out: Violation[] = [];
  const hubMode = g.hub.corpus.tokenModeDefault;
  for (const svc of g.services) {
    if (svc.manifest?.auth !== 'cernere-project-token') continue;
    if (hubMode === 'cernere-project-token') continue;
    out.push({
      id: 'H-LINK-02',
      severity: 'high',
      category: 'linkage-contract',
      subject: svc.manifest?.service ?? svc.repo,
      message: `manifest.auth='cernere-project-token' だが Hub の既定 token-mode は '${hubMode}'。 passthrough ではユーザ Bearer がそのまま転送され、 PASETO project-token を要求する leaf サービスはトークンを受理できない。`,
      evidence: [svc.manifestFile ?? `${svc.repo}/server/corpus.ts`, g.hub.corpus.sources.tokenMode],
      expected: "Hub token-mode = 'cernere-project-token'",
      actual: `Hub token-mode = '${hubMode}'`,
      status: 'violation',
    });
  }
  return out;
}

/** H-LINK-03 redirect_uri 整合: oidc_clients が runtime/db-export 依存。 */
export function hLink03(g: ContractGraph): Violation[] {
  if (g.cernere.oidcClientsSource === 'runtime-unknown') {
    return [
      skipped(
        'H-LINK-03',
        'medium',
        'linkage-contract',
        'oidc_clients.redirect_uris',
        'oidc_clients は migrations では CREATE のみで seed が無く、 実行時登録される。 --cernere-db-export で補完しない限り redirect_uri 整合を判定できない。',
        'oidc_clients.redirect_uris と service publicUrl が一致',
        'oidc_clients が runtime 登録 (静的に不可視)',
      ),
    ];
  }
  // db-export/static があっても service publicUrl は層B 未抽出のため評価保留。
  return [
    skipped(
      'H-LINK-03',
      'medium',
      'linkage-contract',
      'oidc_clients.redirect_uris',
      `oidc_clients は ${g.cernere.oidcClientsSource} から取得したが、 突合に必要な各 service の publicUrl は層B 未抽出のため redirect_uri 整合は判定保留。`,
      'oidc_clients.redirect_uris と service publicUrl が一致',
      'service publicUrl 抽出が層B 未実装',
    ),
  ];
}

/** H-LINK-04 discovery 到達性: hub connector の接続先に manifest が無い。 */
export function hLink04(g: ContractGraph): Violation[] {
  const manifests = serviceManifestNames(g);
  const out: Violation[] = [];
  for (const p of g.hub.vantanhub.plugins) {
    const target = p.connectsTo.toLowerCase();
    if (manifests.has(target)) continue;
    out.push({
      id: 'H-LINK-04',
      severity: 'low',
      category: 'linkage-contract',
      subject: p.connectsTo,
      message: `Hub connector '${p.id}' (${p.baseUrlEnv}) の接続先 '${p.connectsTo}' に対応する corpus-service マニフェスト (server/corpus.ts) が発見できない。 degraded 表示になる${p.envSet ? '' : '。 加えて .env.example で ' + p.baseUrlEnv + ' が未設定'}。`,
      evidence: [p.file, ...(p.baseUrlEnv ? ['VantanHub/.env.example'] : [])],
      expected: `'${p.connectsTo}' が corpus-service.json を公開`,
      actual: `'${p.connectsTo}' のマニフェスト未発見`,
      status: 'violation',
    });
  }
  return out;
}

/** H-LINK-05 data 露出整合: hub ルート列挙が必要 → 静的判定不能。 */
export function hLink05(_g: ContractGraph): Violation[] {
  return [
    skipped(
      'H-LINK-05',
      'medium',
      'linkage-contract',
      'hub.data-relay',
      'Hub が manifest.data 宣言外のパスを中継していないかは plugin のルート定義の列挙が必要。 層B では未実装。',
      'Hub は manifest.data 宣言内のみ中継',
      'plugin ルート列挙が層B 未実装',
    ),
  ];
}

/** H-LINK-06 connector 越境: connector の永続化解析が必要 → 静的判定不能。 */
export function hLink06(_g: ContractGraph): Violation[] {
  return [
    skipped(
      'H-LINK-06',
      'medium',
      'linkage-contract',
      'hub.connector-persistence',
      'VantanHub connector が display 以外を永続化していないかは plugin の DB 書込解析が必要。 層B では未実装。',
      'connector は display 以外を永続化しない',
      'connector 書込解析が層B 未実装',
    ),
  ];
}

/** H-LINK-07 corpusApi 整合: manifest.corpusApi/panel.kind が Corpus normalize と非互換。 */
export function hLink07(g: ContractGraph): Violation[] {
  const supported = g.hub.corpus.supportedCorpusApi;
  const knownKinds = new Set(['declarative', 'script']);
  const out: Violation[] = [];
  for (const svc of g.services) {
    if (!svc.manifest) continue;
    const subject = svc.manifest.service;
    const reasons: string[] = [];
    if (svc.manifest.corpusApi > supported) {
      reasons.push(
        `corpusApi=${svc.manifest.corpusApi} は Corpus 実装の corpusApi=${supported} より新しい (declarative §13 panel は先行宣言で現行 Corpus は未実装)`,
      );
    }
    const unknown = svc.manifest.panels
      .map((p) => p.kind)
      .filter((k) => !knownKinds.has(k));
    if (unknown.length) {
      reasons.push(`未知の panel.kind: ${[...new Set(unknown)].join(', ')}`);
    }
    if (reasons.length === 0) continue;
    out.push({
      id: 'H-LINK-07',
      severity: 'medium',
      category: 'linkage-contract',
      subject,
      message: `${subject} の manifest が Corpus normalize と非互換: ${reasons.join(' / ')}。`,
      evidence: [svc.manifestFile ?? `${svc.repo}/server/corpus.ts`, g.hub.corpus.sources.corpusApi],
      expected: `corpusApi ≤ ${supported} かつ panel.kind ∈ {declarative, script}`,
      actual: `corpusApi=${svc.manifest.corpusApi}, panel.kinds=[${svc.manifest.panels.map((p) => p.kind).join(', ')}]`,
      status: 'violation',
    });
  }
  return out;
}

/** H-LINK-08 relay 双方向同意: relay_pairs が両 service の manifest で前提化。 */
export function hLink08(g: ContractGraph): Violation[] {
  const manifests = serviceManifestNames(g);
  const out: Violation[] = [];
  for (const rp of g.cernere.relayPairs) {
    const haveFrom = manifests.has(rp.from.toLowerCase());
    const haveTo = manifests.has(rp.to.toLowerCase());
    if (!haveFrom && !haveTo) {
      out.push(
        skipped(
          'H-LINK-08',
          'low',
          'linkage-contract',
          `${rp.from}→${rp.to}`,
          `relay_pair ${rp.from}↔${rp.to} の両 service とも corpus-service マニフェストが未発見で、 双方向同意 (両 manifest が peer を前提化) を検証できない。`,
          '両 service の manifest が相互に relay peer を前提化',
          '両 service のマニフェスト未発見',
        ),
      );
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
