// 抽出器基盤: Cernere `GET /api/admin/projects/schema-export` への HTTP クライアント。
//
// 責務は「認証付き HTTP 取得」のみ (SRP)。 レスポンス各要素の詳細な妥当性検証・
// ExternalProjectSchema への変換は `external-project-schema.ts` が担う。
//
// 設計背景: Foedus はプロジェクトスキーマ定義 (PII フィールド構造を含む) を自リポに
// 恒久コミットしない (それ自体がデータ露出/解析対象面のリスクのため)。 Cernere が
// 単一情報源であり、 contract-check 実行のたびに Cernere から **ライブ取得** する。
// Cernere 未設定/到達不能時に空配列へ静かにフォールバックすることは無言フォールバック
// 禁止 (RULE_CODE §7.1) に反するため、 設定不備・通信失敗は必ず例外として fail-fast する。

/** `CERNERE_BASE_URL` / `FOEDUS_CERNERE_EXPORT_TOKEN` から解決した接続設定。 */
export interface CernereSchemaClientConfig {
  baseUrl: string; // 末尾スラッシュ無し
  token: string;
}

/** Cernere `schema-export` レスポンスの 1 要素 (詳細検証はしない: 素通し)。 */
export interface CernereSchemaExportEntry {
  key?: unknown;
  name?: unknown;
  description?: unknown;
  schemaDefinition?: unknown;
}

/**
 * `process.env` から接続設定を解決する。 いずれか未設定なら fail-fast (contract-check
 * が「Cernere に到達できない」ことを静かに空データとして流さないための入口検証)。
 */
export function resolveCernereSchemaClientConfig(
  env: NodeJS.ProcessEnv = process.env,
): CernereSchemaClientConfig {
  const baseUrl = env.CERNERE_BASE_URL;
  if (!baseUrl || baseUrl.trim().length === 0) {
    throw new Error(
      '環境変数 CERNERE_BASE_URL が未設定です。外部管理スキーマ (project-schema) の抽出には ' +
        'Cernere への到達先が必須です (例: CERNERE_BASE_URL=http://localhost:8787)。',
    );
  }
  const token = env.FOEDUS_CERNERE_EXPORT_TOKEN;
  if (!token || token.trim().length === 0) {
    throw new Error(
      '環境変数 FOEDUS_CERNERE_EXPORT_TOKEN が未設定です。Cernere の ' +
        'GET /api/admin/projects/schema-export は admin または project/service Bearer token を要求します。',
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ''), token };
}

/**
 * `GET {baseUrl}/api/admin/projects/schema-export` を呼び、 全登録プロジェクトの
 * スキーマメタデータ (実データは含まない) を配列で返す。 通信/認証/JSON 形状の
 * いずれかの失敗も、 呼び出し元 (contract-check) が原因を特定できるよう明確な
 * メッセージで例外化する (無言で空配列を返さない)。
 */
export async function fetchCernereProjectSchemas(
  config: CernereSchemaClientConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<CernereSchemaExportEntry[]> {
  const url = `${config.baseUrl}/api/admin/projects/schema-export`;

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'GET',
      headers: { authorization: `Bearer ${config.token}` },
    });
  } catch (e) {
    throw new Error(
      `Cernere schema-export への接続に失敗しました (${url}): ${(e as Error).message}。` +
        ' CERNERE_BASE_URL が正しいか、Cernere が起動しているか確認してください。',
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Cernere schema-export が ${res.status} ${res.statusText} を返しました (${url})。` +
        ' FOEDUS_CERNERE_EXPORT_TOKEN の権限 (admin または project/service token) を確認してください。' +
        (body ? ` レスポンス: ${body.slice(0, 300)}` : ''),
    );
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch (e) {
    throw new Error(`Cernere schema-export の応答 JSON 解析に失敗しました (${url}): ${(e as Error).message}`);
  }

  // Cernere 側の実レスポンスは { projects: [...] } でラップされている
  // (server/src/http/project-schema-handler.ts の exportProjectSchemas)。
  const parsed = (body as { projects?: unknown } | null)?.projects;

  if (!Array.isArray(parsed)) {
    throw new Error(`Cernere schema-export の応答に projects 配列がありません (${url}): ${typeof parsed}`);
  }

  return parsed as CernereSchemaExportEntry[];
}
