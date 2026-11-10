ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS image_data TEXT;

ALTER TABLE questions
  DROP CONSTRAINT IF EXISTS questions_image_data_check;

ALTER TABLE questions
  ADD CONSTRAINT questions_image_data_check CHECK (
    image_data IS NULL
    OR (
      char_length(image_data) <= 115000
      AND image_data ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]*={0,2}$'
    )
  );
