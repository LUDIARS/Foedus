-- oidc_clients は CREATE のみ。 seed は無く実行時登録される (静的に列挙不能)。
CREATE TABLE IF NOT EXISTS oidc_clients (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           TEXT NOT NULL UNIQUE,
    client_secret_hash  TEXT NOT NULL,
    name                TEXT NOT NULL,
    redirect_uris       JSONB NOT NULL DEFAULT '[]',
    scopes              JSONB NOT NULL DEFAULT '["openid","email","profile"]'
);
