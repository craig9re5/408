-- Create exam_papers table for Paper Netdisk feature
CREATE TABLE IF NOT EXISTS exam_papers (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT 'main',
  file_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  storage_key TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT 'other',
  year INTEGER DEFAULT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_exam_papers_subject ON exam_papers (workspace_id, subject);
CREATE INDEX IF NOT EXISTS idx_exam_papers_created_at ON exam_papers (workspace_id, created_at DESC);
