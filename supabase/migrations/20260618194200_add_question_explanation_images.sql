ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS question_explanation_image_url TEXT,
  ADD COLUMN IF NOT EXISTS question_explanation_image_alt_de TEXT,
  ADD COLUMN IF NOT EXISTS question_explanation_image_prompt TEXT;

COMMENT ON COLUMN public.questions.question_explanation_image_url IS
  'Optional public image URL shown above the written explanation for a quiz question.';

COMMENT ON COLUMN public.questions.question_explanation_image_alt_de IS
  'German alt text for the optional explanation image.';

COMMENT ON COLUMN public.questions.question_explanation_image_prompt IS
  'Prompt or source note used to create the optional explanation image.';

UPDATE public.questions
SET
  question_explanation_image_url = '/question-explanations/öffentliche-sicherheit-schutzgüter.png',
  question_explanation_image_alt_de = 'Infografik: Öffentliche Sicherheit schützt Rechtsordnung, Leben, Gesundheit, Eigentum sowie Staat und Einrichtungen. Geschmack, Wetter und gute Sitten sind nicht Kern der öffentlichen Sicherheit.',
  question_explanation_image_prompt = 'Vom Nutzer freigegebenes Bild: Konzept 1, Schutzschild mit drei Bereichen für die Erklärung zur Frage "Was sind Schutzgüter der Öffentlichen Sicherheit?".'
WHERE id = 'a2396f6a-ae9e-42c0-bb5f-21790c40a73d';
