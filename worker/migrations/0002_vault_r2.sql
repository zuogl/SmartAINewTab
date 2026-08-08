ALTER TABLE vaults ADD COLUMN object_key TEXT;
ALTER TABLE vaults ADD COLUMN object_size INTEGER;

CREATE UNIQUE INDEX vaults_object_key_idx ON vaults(object_key)
WHERE object_key IS NOT NULL;

CREATE TABLE pending_r2_deletions (
  object_key TEXT PRIMARY KEY,
  queued_at INTEGER NOT NULL
);

CREATE INDEX pending_r2_deletions_queued_idx
ON pending_r2_deletions(queued_at);
