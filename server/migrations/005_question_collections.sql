CREATE TABLE IF NOT EXISTS question_collections (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  subject TEXT NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 100),
  questions_json JSONB NOT NULL CHECK (jsonb_typeof(questions_json) = 'array' AND jsonb_array_length(questions_json) BETWEEN 1 AND 50),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS question_collections_owner_idx ON question_collections(owner_id, updated_at DESC);
ALTER TABLE question_collections ENABLE ROW LEVEL SECURITY;
