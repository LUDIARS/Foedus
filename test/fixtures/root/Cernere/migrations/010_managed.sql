CREATE TABLE IF NOT EXISTS managed_projects (
    key                 TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    client_id           TEXT NOT NULL UNIQUE,
    client_secret_hash  TEXT NOT NULL,
    schema_definition   JSONB NOT NULL DEFAULT '{}',
    is_active           BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO managed_projects (key, name, client_id, client_secret_hash, schema_definition)
VALUES (
    'memoria',
    'Memoria',
    gen_random_uuid()::text,
    crypt(gen_random_uuid()::text, gen_salt('bf', 12)),
    '{}'
)
ON CONFLICT (key) DO NOTHING;
