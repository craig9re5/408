CREATE TABLE IF NOT EXISTS progress (
  workspace_id TEXT NOT NULL DEFAULT 'main',
  section_id TEXT NOT NULL,
  learned INTEGER NOT NULL DEFAULT 0 CHECK (learned IN (0, 1)),
  learned_at TEXT NOT NULL DEFAULT '',
  reviewed INTEGER NOT NULL DEFAULT 0 CHECK (reviewed IN (0, 1)),
  reviewed_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, section_id)
);

CREATE INDEX IF NOT EXISTS progress_updated_at_idx
  ON progress (workspace_id, updated_at);
