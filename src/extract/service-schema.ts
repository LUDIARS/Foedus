// 抽出器: 各サービスのローカル DB スキーマ。
//
// 入力は `server/db.ts` (better-sqlite3 系) 等の `CREATE TABLE` 文。 各カラムを
// ColumnFlag に分類する (allowlist = owner_user_id + *display*name キャッシュ)。
// 解析できるテーブルが 1 つも無いサービスは tables:[] となり、 ルール側で
// 「未解析」を skipped として扱える。

import { join } from 'node:path';
import type { ColumnFlag, ServiceTable } from '../model/contract-graph.ts';
import { classifyColumn } from './column-classifier.ts';
import { isFile, readText } from './fs-util.ts';

export interface SchemaExtract {
  tables: ServiceTable[];
  schemaFile?: string;
}

// `CREATE TABLE [IF NOT EXISTS] name ( ... )` を貪欲でなく括弧対応で切り出す。
const CREATE_TABLE_RE =
  /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?([a-zA-Z0-9_]+)["'`]?\s*\(/gi;

/** server/db.ts を主に、 無ければ server/db/ 配下の .ts を探す。 */
export function extractServiceSchema(repoAbs: string): SchemaExtract {
  const candidates = [
    join(repoAbs, 'server', 'db.ts'),
    join(repoAbs, 'server', 'db', 'index.ts'),
    join(repoAbs, 'server', 'database.ts'),
  ];
  const file = candidates.find((p) => isFile(p));
  if (!file) return { tables: [] };

  const src = readText(file);
  if (!src) return { tables: [], schemaFile: file };

  const tables: ServiceTable[] = [];
  for (const m of src.matchAll(CREATE_TABLE_RE)) {
    const name = m[1];
    if (!name) continue;
    const open = (m.index ?? 0) + m[0].length - 1; // 開き括弧位置
    const inner = sliceBalanced(src, open);
    if (inner === null) continue;
    tables.push({ name, columns: parseColumns(inner) });
  }
  return { tables, schemaFile: file };
}

/** openIdx の '(' に対応する ')' までの中身を返す。 釣り合わなければ null。 */
function sliceBalanced(src: string, openIdx: number): string | null {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return src.slice(openIdx + 1, i);
    }
  }
  return null;
}

/** CREATE TABLE 本文の各行頭からカラム名を拾う。 制約句 (PRIMARY/UNIQUE/--) は除外。 */
function parseColumns(inner: string): { name: string; flags: ColumnFlag[] }[] {
  const cols: { name: string; flags: ColumnFlag[] }[] = [];
  // ネストした括弧 (型修飾) を無視しつつトップレベルの ',' で分割する。
  const parts: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of inner) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) parts.push(buf);

  for (const part of parts) {
    const line = part.replace(/--.*$/gm, '').trim();
    if (!line) continue;
    const first = line.split(/\s+/)[0]?.replace(/["'`]/g, '');
    if (!first) continue;
    const upper = first.toUpperCase();
    // テーブル制約句はカラムではない。
    if (
      ['PRIMARY', 'UNIQUE', 'FOREIGN', 'CHECK', 'CONSTRAINT', 'INDEX'].includes(
        upper,
      )
    ) {
      continue;
    }
    cols.push({ name: first, flags: [classifyColumn(first)] });
  }
  return cols;
}
