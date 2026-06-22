-- Reset all existing quiz explanation image links before switching to the
-- self-service generation workflow.

UPDATE public.questions
SET
  question_explanation_image_url = NULL,
  question_explanation_image_alt_de = NULL,
  question_explanation_image_prompt = NULL
WHERE
  question_explanation_image_url IS NOT NULL
  OR question_explanation_image_alt_de IS NOT NULL
  OR question_explanation_image_prompt IS NOT NULL;
