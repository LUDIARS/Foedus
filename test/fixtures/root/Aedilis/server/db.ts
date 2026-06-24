// fixture: Aedilis のローカル schema。 owner_user_id + display name キャッシュのみ
// (allowlist 内 → C-DATA-01/02 不発)。
import Database from 'better-sqlite3';

export function openDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reservation (
      id            TEXT PRIMARY KEY,
      facility_id   TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      start_at      INTEGER NOT NULL,
      purpose       TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS user_display_cache (
      user_id    TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}
