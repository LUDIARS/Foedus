CREATE TABLE IF NOT EXISTS relay_pairs (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_project_key TEXT NOT NULL REFERENCES managed_projects(key),
    to_project_key   TEXT NOT NULL REFERENCES managed_projects(key),
    bidirectional    BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO relay_pairs (from_project_key, to_project_key)
VALUES ('memoria', 'imperativus');
