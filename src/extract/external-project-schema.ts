// 抽出器: 外部管理スキーマ (Cernere `projectDefinitionSchema` 準拠)。
//
// Foedus 自身がオーサリングする Cernere ホスト型スキーマ (例: vantan_user) を
// `user_data.columns` 単位で機微分類する。 これらは Cernere 側の
// `project_data_<key>` テーブルとして永続化される想定であり、 per-service ローカル
// schema (service-schema.ts) とは別モデル (CernereModel.externalProjectSchemas) として
// 扱う。
//
// **セキュリティ上の設計 (2026-07 変更)**: スキーマ定義そのもの (PII フィールド構造
// を含む) を Foedus 自リポに恒久コミットすることは、 それ自体がデータ露出/解析対象
// 面のリスクになる。 そのため `schemas/*.json` を静的ファイルとして読む旧実装は廃止し、
// Cernere の `GET /api/admin/projects/schema-export` から **毎回ライブ取得** する
// (cernere-schema-client.ts)。 Foedus はレビュー責務 (抽出/分類/ルール/CI) のみを持ち、
// スキーマ実体データは Cernere を唯一の情報源として保持し続ける。

import type { ColumnFlag, ExternalDataShare, ExternalProjectSchema } from '../model/contract-graph.ts';
import { classifyColumn } from './column-classifier.ts';
import {
  fetchCernereProjectSchemas,
  type CernereSchemaClientConfig,
  type CernereSchemaExportEntry,
} from './cernere-schema-client.ts';

interface RawColumnDefinition {
  type?: unknown;
  module?: unknown;
  nullable?: unknown;
  description?: unknown;
}

interface RawDataShare {
  project_key?: unknown;
  modules?: unknown;
  access?: unknown;
  description?: unknown;
}

/** `schemaDefinition` の形 (旧 `schemas/*.json` ファイルと同一形状)。 */
interface RawSchemaDefinition {
  project?: { key?: unknown; name?: unknown; description?: unknown };
  data_sharing?: unknown;
  user_data?: { columns?: Record<string, RawColumnDefinition> };
}

/**
 * `name` / `full_name` は一般の classifyColumn では 'display-cache' (UI 表示キャッシュ
 * 前提の allowlist) に分類されるが、 外部管理の per-user プロフィールテーブルでは
 * それ自体が実在する個人の氏名 = PII である。 UI キャッシュ向け allowlist を素の
 * 個人データテーブルへ誤適用しないよう、 ここだけ一般分類をバイパスして直接
 * 'personal-pii' に固定する。
 */
function classifyExternalColumn(rawName: string): ColumnFlag {
  const lower = rawName.toLowerCase();
  if (lower === 'name' || lower === 'full_name') return 'personal-pii';
  return classifyColumn(rawName);
}

/**
 * project.data_sharing (Cernere `dataShareDefinitionSchema` 準拠) を解決する。
 * 未指定は空配列 (共有無しは正常系)。 project_key を欠く要素は
 * オーサリング不備として fail-fast する (無言フォールバック禁止)。
 */
function parseDataSharing(raw: unknown, label: string): ExternalDataShare[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new Error(`外部管理スキーマの data_sharing は配列である必要があります: ${label}`);
  }
  return raw.map((entry, i) => {
    const e = entry as RawDataShare;
    if (typeof e?.project_key !== 'string' || e.project_key.length === 0) {
      throw new Error(`外部管理スキーマの data_sharing[${i}] に project_key がありません: ${label}`);
    }
    if (e.modules !== undefined && !(Array.isArray(e.modules) && e.modules.every((m) => typeof m === 'string'))) {
      throw new Error(`外部管理スキーマの data_sharing[${i}].modules は string[] である必要があります: ${label}`);
    }
    if (e.access !== undefined && e.access !== 'read' && e.access !== 'readwrite') {
      throw new Error(`外部管理スキーマの data_sharing[${i}].access は 'read'|'readwrite' である必要があります: ${label}`);
    }
    if (e.description !== undefined && typeof e.description !== 'string') {
      throw new Error(`外部管理スキーマの data_sharing[${i}].description は string である必要があります: ${label}`);
    }
    return {
      projectKey: e.project_key,
      modules: e.modules as string[] | undefined,
      access: (e.access as 'read' | 'readwrite' | undefined) ?? 'read',
      description: e.description,
    };
  });
}

/**
 * schema-export の 1 要素を検証して ExternalProjectSchema へ変換する。 `key` は
 * レスポンス直下の値を正とする (schemaDefinition.project.key はオーサリング時の参考
 * 情報として一致していることが多いが、 Cernere 側の管理列である `key` の方が
 * schema-export のコントラクト上の一次情報)。 user_data.columns を欠く要素は
 * オーサリング不備として fail-fast する (無言フォールバック禁止)。
 */
function transformEntry(entry: CernereSchemaExportEntry, index: number): ExternalProjectSchema {
  const key = entry.key;
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error(`Cernere schema-export の要素[${index}] に key がありません (もしくは空文字列)`);
  }
  const label = `Cernere schema-export (key=${key})`;

  const def = entry.schemaDefinition;
  if (def === undefined || def === null || typeof def !== 'object') {
    throw new Error(`外部管理スキーマに schemaDefinition がありません: ${label}`);
  }
  const parsed = def as RawSchemaDefinition;

  const columns = parsed.user_data?.columns;
  if (columns === undefined || columns === null || typeof columns !== 'object') {
    throw new Error(`外部管理スキーマに user_data.columns がありません: ${label}`);
  }

  const dataSharing = parseDataSharing(parsed.data_sharing, label);

  return {
    key,
    file: label,
    columns: Object.keys(columns).map((column) => ({
      column,
      flag: classifyExternalColumn(column),
    })),
    dataSharing,
  };
}

/**
 * Cernere `GET /api/admin/projects/schema-export` から全登録プロジェクトのスキーマ
 * メタデータをライブ取得し、 各要素を ExternalProjectSchema へ変換する。
 *
 * `config` 省略時は環境変数 (`CERNERE_BASE_URL` / `FOEDUS_CERNERE_EXPORT_TOKEN`) から
 * 解決する (`resolveCernereSchemaClientConfig` は呼び出し元 (index.ts / cli.ts) が
 * 明示的に呼ぶ想定 — ここでは受け取った config をそのまま使う SRP を保つ)。
 */
export async function extractExternalProjectSchemas(
  config: CernereSchemaClientConfig,
  fetchImpl?: typeof fetch,
): Promise<ExternalProjectSchema[]> {
  const entries = await fetchCernereProjectSchemas(config, fetchImpl);
  return entries.map((entry, i) => transformEntry(entry, i));
}
