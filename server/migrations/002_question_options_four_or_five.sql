ALTER TABLE questions
  DROP CONSTRAINT IF EXISTS questions_options_json_check,
  DROP CONSTRAINT IF EXISTS questions_answer_index_check;

ALTER TABLE questions
  ADD CONSTRAINT questions_options_json_check
    CHECK (jsonb_typeof(options_json::jsonb) = 'array' AND jsonb_array_length(options_json::jsonb) IN (4, 5)),
  ADD CONSTRAINT questions_answer_index_check
    CHECK (answer_index >= 0 AND answer_index < jsonb_array_length(options_json::jsonb));
