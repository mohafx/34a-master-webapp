-- Lock down public content tables exposed through Supabase Data API.
-- Browser clients may read public previews/free content only; server-side
-- workers continue to use the service_role key and bypass RLS as before.

-- Stop future public-schema objects from being exposed to browser roles by default.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE USAGE, SELECT ON SEQUENCES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- QUESTIONS
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access" ON public.questions;
DROP POLICY IF EXISTS "Premium View All Questions" ON public.questions;
DROP POLICY IF EXISTS "Public View Free Questions" ON public.questions;
DROP POLICY IF EXISTS "Allow public update for questions" ON public.questions;
DROP POLICY IF EXISTS "Admin can update questions" ON public.questions;
DROP POLICY IF EXISTS questions_select_free_content ON public.questions;
DROP POLICY IF EXISTS questions_select_premium_content ON public.questions;
DROP POLICY IF EXISTS questions_admin_update ON public.questions;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.questions FROM anon, authenticated;
GRANT SELECT ON TABLE public.questions TO anon, authenticated;
GRANT UPDATE ON TABLE public.questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.questions TO service_role;

CREATE POLICY questions_select_free_content
ON public.questions
FOR SELECT
TO anon, authenticated
USING (is_free IS TRUE);

CREATE POLICY questions_select_premium_content
ON public.questions
FOR SELECT
TO authenticated
USING (
  auth.jwt() ->> 'email' = 'm.almajzoub1@gmail.com'
  OR EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.user_id = auth.uid()
      AND (
        s.status IN ('active', 'trialing')
        OR (s.status = 'canceled' AND s.current_period_end > now())
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.access_grants ag
    WHERE ag.user_id = auth.uid()
      AND ag.status = 'active'
      AND ag.starts_at <= now()
      AND ag.ends_at > now()
  )
);

CREATE POLICY questions_admin_update
ON public.questions
FOR UPDATE
TO authenticated
USING (auth.jwt() ->> 'email' = 'm.almajzoub1@gmail.com')
WITH CHECK (auth.jwt() ->> 'email' = 'm.almajzoub1@gmail.com');

-- FLASHCARDS
ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS flashcards_select_free_content ON public.flashcards;
DROP POLICY IF EXISTS flashcards_select_premium_content ON public.flashcards;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.flashcards FROM anon, authenticated;
GRANT SELECT ON TABLE public.flashcards TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.flashcards TO service_role;

CREATE POLICY flashcards_select_free_content
ON public.flashcards
FOR SELECT
TO anon, authenticated
USING (is_free IS TRUE);

CREATE POLICY flashcards_select_premium_content
ON public.flashcards
FOR SELECT
TO authenticated
USING (
  auth.jwt() ->> 'email' = 'm.almajzoub1@gmail.com'
  OR EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.user_id = auth.uid()
      AND (
        s.status IN ('active', 'trialing')
        OR (s.status = 'canceled' AND s.current_period_end > now())
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.access_grants ag
    WHERE ag.user_id = auth.uid()
      AND ag.status = 'active'
      AND ag.starts_at <= now()
      AND ag.ends_at > now()
  )
);

-- WRITTEN EXAM QUESTIONS
ALTER TABLE public.written_exam_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can update written exam questions" ON public.written_exam_questions;
DROP POLICY IF EXISTS written_exam_questions_select_premium_content ON public.written_exam_questions;
DROP POLICY IF EXISTS written_exam_questions_admin_update ON public.written_exam_questions;

REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.written_exam_questions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.written_exam_questions FROM authenticated;
GRANT SELECT, UPDATE ON TABLE public.written_exam_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.written_exam_questions TO service_role;

CREATE POLICY written_exam_questions_select_premium_content
ON public.written_exam_questions
FOR SELECT
TO authenticated
USING (
  auth.jwt() ->> 'email' = 'm.almajzoub1@gmail.com'
  OR EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.user_id = auth.uid()
      AND (
        s.status IN ('active', 'trialing')
        OR (s.status = 'canceled' AND s.current_period_end > now())
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.access_grants ag
    WHERE ag.user_id = auth.uid()
      AND ag.status = 'active'
      AND ag.starts_at <= now()
      AND ag.ends_at > now()
  )
);

CREATE POLICY written_exam_questions_admin_update
ON public.written_exam_questions
FOR UPDATE
TO authenticated
USING (auth.jwt() ->> 'email' = 'm.almajzoub1@gmail.com')
WITH CHECK (auth.jwt() ->> 'email' = 'm.almajzoub1@gmail.com');

-- LESSONS remain publicly readable because the current app has no lessons_preview
-- endpoint yet. Browser writes are still closed.
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lessons_public_read ON public.lessons;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.lessons FROM anon, authenticated;
GRANT SELECT ON TABLE public.lessons TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lessons TO service_role;

CREATE POLICY lessons_public_read
ON public.lessons
FOR SELECT
TO anon, authenticated
USING (true);

-- Public preview views stay exposed; the old catalog view with correct answers is not.
GRANT SELECT ON TABLE public.questions_preview TO anon, authenticated;
GRANT SELECT ON TABLE public.flashcards_preview TO anon, authenticated;
GRANT SELECT ON TABLE public.modules TO anon, authenticated;
REVOKE SELECT ON TABLE public.question_catalog_public FROM anon, authenticated;

DO $$
BEGIN
  IF to_regclass('public.question_catalog_public') IS NOT NULL THEN
    EXECUTE 'ALTER VIEW public.question_catalog_public SET (security_invoker = true)';
  END IF;
EXCEPTION
  WHEN others THEN
    -- Older Postgres versions may not support security_invoker on views.
    -- The explicit revoke above is the actual access control for this view.
    NULL;
END $$;

-- Pipeline tables are operational internals. They must not be reachable from
-- anon/authenticated clients; Edge Functions and local workers use service_role.
DO $$
DECLARE
  pipeline_table regclass;
  pipeline_tables regclass[] := ARRAY[
    'public.question_explanation_runs'::regclass,
    'public.question_explanation_jobs'::regclass,
    'public.question_explanation_audit'::regclass,
    'public.written_exam_regen_runs'::regclass,
    'public.written_exam_regen_jobs'::regclass,
    'public.written_exam_regen_candidates'::regclass,
    'public.written_exam_regen_audit'::regclass,
    'public.lesson_image_runs'::regclass,
    'public.lesson_image_jobs'::regclass,
    'public.lesson_image_audit'::regclass
  ];
  policy_name text;
BEGIN
  FOREACH pipeline_table IN ARRAY pipeline_tables LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', pipeline_table);
    EXECUTE format('REVOKE ALL ON TABLE %s FROM anon, authenticated', pipeline_table);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %s TO service_role', pipeline_table);

    policy_name := replace(pipeline_table::text, '.', '_') || '_service_role_all';
    EXECUTE format('DROP POLICY IF EXISTS %I ON %s', policy_name, pipeline_table);
    EXECUTE format(
      'CREATE POLICY %I ON %s FOR ALL TO service_role USING (true) WITH CHECK (true)',
      policy_name,
      pipeline_table
    );
  END LOOP;
END $$;
