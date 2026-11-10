CREATE TABLE IF NOT EXISTS workspace_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  subjects JSONB NOT NULL CHECK (
    jsonb_typeof(subjects) = 'array'
    AND jsonb_array_length(subjects) BETWEEN 1 AND 100
  ),
  classes JSONB NOT NULL CHECK (
    jsonb_typeof(classes) = 'array'
    AND jsonb_array_length(classes) BETWEEN 1 AND 100
  ),
  updated_at BIGINT NOT NULL
);

ALTER TABLE workspace_preferences ENABLE ROW LEVEL SECURITY;
