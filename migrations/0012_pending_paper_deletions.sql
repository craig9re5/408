CREATE TABLE IF NOT EXISTS pending_paper_deletions (
  storage_key TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size >= 0),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pending_paper_deletions_workspace
ON pending_paper_deletions (workspace_id, created_at);
