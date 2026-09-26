CREATE TABLE IF NOT EXISTS paper_quota (
  workspace_id TEXT PRIMARY KEY,
  used_bytes INTEGER NOT NULL DEFAULT 0 CHECK (used_bytes >= 0)
);

INSERT OR IGNORE INTO paper_quota (workspace_id, used_bytes)
SELECT workspace_id, COALESCE(SUM(file_size), 0)
FROM exam_papers
GROUP BY workspace_id;
