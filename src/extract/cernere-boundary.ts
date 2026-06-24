// 抽出器: Cernere のデータ境界 (持つ / 持たない) と個人/機微カラム。
//
// 入力:
//  - `Cernere/spec/data/*.md` の境界文書 (「持つ / 持たない」または「含む / 除く」)。
//    見つからなければ holds/notHolds は空のまま (C-DATA-07 が skipped を出す根拠)。
//  - `Cernere/server/src/db/schema.ts` の drizzle カラム定義から個人/機微カラムを抽出。
//
// schema.ts は Cernere を「個人データ単一情報源」とするための機微カラム台帳。
// 各サービスの allowlist 判定や C-DATA-* の参照に使う。

import { join } from 'node:path';
import type { ColumnRef } from '../model/contract-graph.ts';
import { classifyColumn } from './column-classifier.ts';
import { listFiles, readText } from './fs-util.ts';

export interface BoundaryExtract {
  holds: string[];
  notHolds: string[];
  docFiles: string[];
  personalDataColumns: ColumnRef[];
}

// 境界文書の語彙は一定でない。 「持つ/持たない」だけでなく「含む/除く」(太字マーカー)
// も拾う。 含む/除く は太字 `**含む**` 等に限定し「本書に含める」等の散文誤検出を避ける。
const NOT_HOLDS_PATTERNS = [
  /([^\n。]*持たない[^\n。]*)/g,
  /(\*\*\s*除く[^\n]*)/g,
];
const HOLDS_PATTERNS = [
  /([^\n。]*持つ[^\n。]*)/g,
  /(\*\*\s*含む\s*\*\*[：:][^\n]*)/g,
];

// drizzle: `export const users = pgTable("users", {` ブロックを切り出す。
const PG_TABLE_RE = /pgTable\(\s*["'`]([a-zA-Z0-9_]+)["'`]\s*,\s*\{/g;
// `email: text("email")` 形式の物理カラム名を拾う。
const COLUMN_RE =
  /\b(?:text|uuid|timestamp|bigint|boolean|jsonb|integer|customType|bytea)\s*<?[^(]*\(\s*["'`]([a-zA-Z0-9_]+)["'`]/g;

export function extractCernereBoundary(root: string): BoundaryExtract {
  const holds: string[] = [];
  const notHolds: string[] = [];
  const docFiles: string[] = [];

  const dataDir = join(root, 'Cernere', 'spec', 'data');
  for (const file of listFiles(dataDir, '.md')) {
    const md = readText(file);
    if (!md) continue;
    let matched = false;
    for (const re of NOT_HOLDS_PATTERNS) {
      for (const m of md.matchAll(re)) {
        const line = m[1]?.trim();
        if (line) {
          notHolds.push(line);
          matched = true;
        }
      }
    }
    // 「持たない/除く」を先に拾い、 残りの「持つ/含む」のみ holds へ (二重計上回避)。
    for (const re of HOLDS_PATTERNS) {
      for (const m of md.matchAll(re)) {
        const line = m[1]?.trim();
        if (line && !line.includes('持たない') && !/\*\*\s*除く/.test(line)) {
          holds.push(line);
          matched = true;
        }
      }
    }
    if (matched) docFiles.push(file.split(/[\\/]/).slice(-1)[0] ?? file);
  }

  const personalDataColumns = extractSchemaColumns(root);
  return { holds, notHolds, docFiles, personalDataColumns };
}

/** schema.ts から table×column を読み、 機微 (plain/owner-ref/display 以外) のみ返す。 */
function extractSchemaColumns(root: string): ColumnRef[] {
  const schemaPath = join(root, 'Cernere', 'server', 'src', 'db', 'schema.ts');
  const src = readText(schemaPath);
  if (!src) return [];

  // pgTable ブロックの開始位置で範囲を区切り、 各範囲内のカラムを表へ帰属させる。
  const tables: { name: string; start: number }[] = [];
  for (const m of src.matchAll(PG_TABLE_RE)) {
    tables.push({ name: m[1] ?? 'unknown', start: m.index ?? 0 });
  }

  const out: ColumnRef[] = [];
  for (const m of src.matchAll(COLUMN_RE)) {
    const colName = m[1];
    if (!colName) continue;
    const idx = m.index ?? 0;
    // この位置を含む直近の pgTable ブロックを所属テーブルとする。
    let table = 'unknown';
    for (const t of tables) {
      if (t.start <= idx) table = t.name;
      else break;
    }
    const flag = classifyColumn(colName);
    if (flag === 'oauth-token' || flag === 'password' || flag === 'personal-pii') {
      out.push({ table, column: colName, flag });
    }
  }
  return out;
}
