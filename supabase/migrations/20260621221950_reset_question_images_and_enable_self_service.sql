-- Reset existing quiz explanation image links and enable self-service generation.
-- Existing image assets may remain in Storage/CDN, but the app will no longer reference them.

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS question_explanation_image_status TEXT,
  ADD COLUMN IF NOT EXISTS question_explanation_image_locked_at TIMESTAMPTZ;

ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS questions_explanation_image_status_check;

ALTER TABLE public.questions
  ADD CONSTRAINT questions_explanation_image_status_check
  CHECK (
    question_explanation_image_status IS NULL
    OR question_explanation_image_status IN ('pending', 'ready', 'failed')
  );

UPDATE public.questions
SET
  question_explanation_image_url = NULL,
  question_explanation_image_alt_de = NULL,
  question_explanation_image_prompt = NULL,
  question_explanation_image_status = NULL,
  question_explanation_image_locked_at = NULL
WHERE
  question_explanation_image_url IS NOT NULL
  OR question_explanation_image_alt_de IS NOT NULL
  OR question_explanation_image_prompt IS NOT NULL
  OR question_explanation_image_status IS NOT NULL
  OR question_explanation_image_locked_at IS NOT NULL;

INSERT INTO storage.buckets (id, name, public)
VALUES ('question-explanations', 'question-explanations', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'question_explanations_public_read'
  ) THEN
    CREATE POLICY "question_explanations_public_read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'question-explanations');
  END IF;
END $$;
