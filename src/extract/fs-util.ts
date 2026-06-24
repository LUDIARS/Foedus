// 抽出器共通の小さなファイルシステムヘルパ。 外部 glob 依存を避け Node 組み込みで完結。
//
// 責務はファイル探索 / 読み取り / パス整形のみ (SRP)。 構文解析は各抽出器が持つ。

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** ファイルを UTF-8 で読む。 存在しない / 読めない場合は null (捏造しない)。 */
export function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** root 直下のディレクトリ名一覧 (リポジトリ候補)。 */
export function listSubdirs(root: string): string[] {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/** dir 直下のファイルを拡張子で絞って絶対パスで返す (再帰しない)。 */
export function listFiles(dir: string, ext?: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && (!ext || e.name.endsWith(ext)))
      .map((e) => join(dir, e.name))
      .sort();
  } catch {
    return [];
  }
}

/** root 起点の相対パスを posix 区切りで返す (evidence 表示用)。 */
export function rel(root: string, path: string): string {
  return relative(root, path).split(sep).join('/');
}

/** 文字列内のオフセットから 1 始まりの行番号を求める。 evidence の行付与に使う。 */
export function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}
