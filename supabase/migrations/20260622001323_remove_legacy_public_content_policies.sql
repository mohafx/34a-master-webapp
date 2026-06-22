-- Remove legacy permissive content policies that may exist in the remote baseline
-- but are not represented in the current migration history.

DO $$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('questions', 'flashcards', 'written_exam_questions', 'lessons')
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  END LOOP;
END $$;

-- QUESTIONS
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

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

-- LESSONS
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.lessons FROM anon, authenticated;
GRANT SELECT ON TABLE public.lessons TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lessons TO service_role;

CREATE POLICY lessons_public_read
ON public.lessons
FOR SELECT
TO anon, authenticated
USING (true);
