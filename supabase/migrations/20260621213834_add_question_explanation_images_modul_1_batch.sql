-- Historical one-image batch applied before the self-service reset.
-- Kept to mirror remote migration history.

UPDATE public.questions
SET
  question_explanation_image_url = '/question-explanations/befugnisse-im-dienst-behörde-polizei.png',
  question_explanation_image_alt_de = 'Infografik zur Quiz-Erklärung: Behörde, Polizei, Hausrecht, Jedermannsrechte, Notwehr, Selbsthilfe.',
  question_explanation_image_prompt = 'Reset-Neustart Stil v2 (style-locked, layout-free)'
WHERE id = '61105670-c58d-4002-bd95-0754045201cc';
