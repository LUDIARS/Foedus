// 抽出器: 外部管理スキーマ (Cernere `projectDefinitionSchema` 準拠の `schemas/*.json`)。
//
// Foedus 自身がオーサリングする Cernere ホスト型スキーマ (例: vantan_user) を発見し、
// `user_data.columns` を既存の classifyColumn で機微分類する。 これらは Cernere 側の
// `project_data_<key>` テーブルとして永続化される想定であり、 per-service ローカル
// schema (service-schema.ts) とは別モデル (CernereModel.externalProjectSchemas) として
// 扱う。 ファイルは `<root>/Foedus/schemas/*.json` 固定 (root は --root、 Foedus は
// その直下の兄弟リポ名 — 絶対パスをハードコードしない)。

import { join } from 'node:path';
import type { ColumnFlag, ExternalProjectSchema } from '../model/contract-graph.ts';
import { classifyColumn } from './column-classifier.ts';
import { listFiles, readText, rel } from './fs-util.ts';

interface RawColumnDefinition {
  type?: unknown;
  module?: unknown;
  nullable?: unknown;
  description?: unknown;
}

interface RawProjectSchema {
  project?: { key?: unknown; name?: unknown; description?: unknown };
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

interface ParsedProjectSchema {
  key: string;
  columns: Record<string, RawColumnDefinition>;
}

/**
 * 1 ファイル分の最小妥当性検証。 project.key / user_data.columns を欠く JSON は
 * オーサリング側の不備であり、 値を捏造せず即エラーにする (無言フォールバック禁止)。
 */
function parseProjectSchema(file: string): ParsedProjectSchema {
  const raw = readText(file);
  if (raw === null) {
    throw new Error(`外部管理スキーマを読めません: ${file} (パス/権限を確認)`);
  }

  let parsed: RawProjectSchema;
  try {
    parsed = JSON.parse(raw) as RawProjectSchema;
  } catch (e) {
    throw new Error(`外部管理スキーマの JSON 解析に失敗: ${file}: ${(e as Error).message}`);
  }

  const key = parsed.project?.key;
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error(`外部管理スキーマに project.key がありません: ${file}`);
  }
  const columns = parsed.user_data?.columns;
  if (columns === undefined || columns === null || typeof columns !== 'object') {
    throw new Error(`外部管理スキーマに user_data.columns がありません: ${file}`);
  }

  return { key, columns };
}

/** `<root>/Foedus/schemas/*.json` を読み、 各ファイルを ExternalProjectSchema へ変換する。 */
export function extractExternalProjectSchemas(root: string): ExternalProjectSchema[] {
  const schemasDir = join(root, 'Foedus', 'schemas');
  const files = listFiles(schemasDir, '.json');

  return files.map((file) => {
    const parsed = parseProjectSchema(file);
    return {
      key: parsed.key,
      file: rel(root, file),
      columns: Object.keys(parsed.columns).map((column) => ({
        column,
        flag: classifyExternalColumn(column),
      })),
    };
  });
}
