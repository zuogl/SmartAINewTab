ALTER TABLE oauth_flows ADD COLUMN client_state TEXT;
ALTER TABLE oauth_flows ADD COLUMN code_challenge TEXT;
ALTER TABLE oauth_flows ADD COLUMN client_key TEXT;

CREATE INDEX oauth_flows_client_pending_idx
ON oauth_flows(client_key, status, expires_at);

CREATE TABLE vault_deletion_jobs (
  user_id TEXT PRIMARY KEY,
  object_prefix TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('vault', 'account')),
  queued_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX vault_deletion_jobs_queued_idx
ON vault_deletion_jobs(queued_at);
