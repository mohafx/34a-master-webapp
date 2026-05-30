
ALTER TABLE written_exam_questions
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
;
