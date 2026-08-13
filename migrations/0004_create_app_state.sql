CREATE TABLE IF NOT EXISTS app_state (
  workspace_id TEXT NOT NULL DEFAULT 'main',
  schema_version INTEGER NOT NULL DEFAULT 1,
  project_settings TEXT NOT NULL DEFAULT '{}',
  plan_history TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id)
);

INSERT OR IGNORE INTO app_state (
  workspace_id,
  schema_version,
  project_settings,
  plan_history
) VALUES (
  'main',
  1,
  '{"408":{"examDate":"2026-12-19"},"math":{"examDate":"2026-12-19"}}',
  '[]'
);
