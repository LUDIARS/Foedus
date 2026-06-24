// fixture: 自前で OAuth トークン (access_token/refresh_token) と PII (email/phone)
// を保持 → C-DATA-01 (token) / C-DATA-02 (PII) が発火する。
export const schema = `
  CREATE TABLE IF NOT EXISTS tokens (
    id            TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    access_token  TEXT,
    refresh_token TEXT
  );
  CREATE TABLE IF NOT EXISTS contacts (
    user_id TEXT PRIMARY KEY,
    email   TEXT,
    phone_number TEXT
  );
`;
