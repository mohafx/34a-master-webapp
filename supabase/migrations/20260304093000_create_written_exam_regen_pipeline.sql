-- Written exam regeneration pipeline (pilot, single-question capable)

-- =====================================================
-- WRITTEN EXAM EXTENSIONS
-- =====================================================
ALTER TABLE public.written_exam_questions
  ADD COLUMN IF NOT EXISTS difficulty_level TEXT;

ALTER TABLE public.written_exam_questions
  ADD COLUMN IF NOT EXISTS regeneration_version TEXT;

ALTER TABLE public.written_exam_questions
  ADD COLUMN IF NOT EXISTS regenerated_at TIMESTAMPTZ;

ALTER TABLE public.written_exam_questions
  ADD COLUMN IF NOT EXISTS legal_review_state TEXT;

ALTER TABLE public.written_exam_questions
  DROP CONSTRAINT IF EXISTS written_exam_questions_difficulty_level_check;

ALTER TABLE public.written_exam_questions
  ADD CONSTRAINT written_exam_questions_difficulty_level_check
  CHECK (difficulty_level IS NULL OR difficulty_level IN ('EASY', 'MEDIUM', 'HARD')) NOT VALID;

ALTER TABLE public.written_exam_questions
  DROP CONSTRAINT IF EXISTS written_exam_questions_legal_review_state_check;

ALTER TABLE public.written_exam_questions
  ADD CONSTRAINT written_exam_questions_legal_review_state_check
  CHECK (
    legal_review_state IS NULL
    OR legal_review_state IN ('pending', 'needs_manual', 'verified')
  ) NOT VALID;

-- =====================================================
-- HELPER FUNCTIONS FOR STRUCTURE CHECKS
-- =====================================================
CREATE OR REPLACE FUNCTION public.written_exam_normalized_letters(answer TEXT)
RETURNS TEXT[]
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE
    WHEN answer IS NULL OR btrim(answer) = '' THEN ARRAY[]::TEXT[]
    ELSE regexp_split_to_array(regexp_replace(upper(answer), '\\s', '', 'g'), ',')
  END;
$$;

CREATE OR REPLACE FUNCTION public.written_exam_option_count(
  answer_a TEXT,
  answer_b TEXT,
  answer_c TEXT,
  answer_d TEXT,
  answer_e TEXT,
  answer_f TEXT
)
RETURNS INTEGER
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT
    (CASE WHEN NULLIF(btrim(answer_a), '') IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN NULLIF(btrim(answer_b), '') IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN NULLIF(btrim(answer_c), '') IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN NULLIF(btrim(answer_d), '') IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN NULLIF(btrim(answer_e), '') IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN NULLIF(btrim(answer_f), '') IS NOT NULL THEN 1 ELSE 0 END);
$$;

-- =====================================================
-- STRUCTURE CHECKS (GATED BY difficulty_level FOR PILOT SAFETY)
-- =====================================================
ALTER TABLE public.written_exam_questions
  DROP CONSTRAINT IF EXISTS written_exam_questions_option_count_check;

ALTER TABLE public.written_exam_questions
  ADD CONSTRAINT written_exam_questions_option_count_check
  CHECK (
    difficulty_level IS NULL OR
    public.written_exam_option_count(
      answer_a_de,
      answer_b_de,
      answer_c_de,
      answer_d_de,
      answer_e_de,
      answer_f_de
    ) IN (5, 6)
  ) NOT VALID;

ALTER TABLE public.written_exam_questions
  DROP CONSTRAINT IF EXISTS written_exam_questions_no_option_gap_check;

ALTER TABLE public.written_exam_questions
  ADD CONSTRAINT written_exam_questions_no_option_gap_check
  CHECK (
    difficulty_level IS NULL OR
    NULLIF(btrim(answer_e_de), '') IS NOT NULL
  ) NOT VALID;

ALTER TABLE public.written_exam_questions
  DROP CONSTRAINT IF EXISTS written_exam_questions_correct_answer_format_check;

ALTER TABLE public.written_exam_questions
  ADD CONSTRAINT written_exam_questions_correct_answer_format_check
  CHECK (
    difficulty_level IS NULL OR
    regexp_replace(upper(correct_answer), '\\s', '', 'g') ~ '^[A-F](,[A-F])?$'
  ) NOT VALID;

ALTER TABLE public.written_exam_questions
  DROP CONSTRAINT IF EXISTS written_exam_questions_correct_answer_distinct_check;

ALTER TABLE public.written_exam_questions
  ADD CONSTRAINT written_exam_questions_correct_answer_distinct_check
  CHECK (
    difficulty_level IS NULL OR
    cardinality(public.written_exam_normalized_letters(correct_answer)) = 1 OR
    (public.written_exam_normalized_letters(correct_answer))[1] IS DISTINCT FROM (public.written_exam_normalized_letters(correct_answer))[2]
  ) NOT VALID;

ALTER TABLE public.written_exam_questions
  DROP CONSTRAINT IF EXISTS written_exam_questions_correct_answer_option_presence_check;

ALTER TABLE public.written_exam_questions
  ADD CONSTRAINT written_exam_questions_correct_answer_option_presence_check
  CHECK (
    difficulty_level IS NULL OR
    (
      POSITION('E' IN regexp_replace(upper(correct_answer), '\\s', '', 'g')) = 0
      OR NULLIF(btrim(answer_e_de), '') IS NOT NULL
    )
  ) NOT VALID;

ALTER TABLE public.written_exam_questions
  DROP CONSTRAINT IF EXISTS written_exam_questions_target_structure_match_check;

ALTER TABLE public.written_exam_questions
  ADD CONSTRAINT written_exam_questions_target_structure_match_check
  CHECK (
    difficulty_level IS NULL OR
    target_structure = (
      public.written_exam_option_count(
        answer_a_de,
        answer_b_de,
        answer_c_de,
        answer_d_de,
        answer_e_de,
        answer_f_de
      )::TEXT ||
      '_opts|' ||
      cardinality(public.written_exam_normalized_letters(correct_answer))::TEXT ||
      '_correct'
    )
  ) NOT VALID;

-- =====================================================
-- PIPELINE RUNS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.written_exam_regen_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'in_progress', 'completed', 'failed', 'completed_with_errors', 'approved', 'applied')),
  target_count INTEGER NOT NULL CHECK (target_count > 0),
  processed_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  model_code TEXT NOT NULL,
  prompt_version TEXT NOT NULL DEFAULT 'written_exam_regen_v1',
  write_mode TEXT NOT NULL DEFAULT 'direct' CHECK (write_mode IN ('direct')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  applied_at TIMESTAMPTZ,
  applied_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_written_exam_regen_runs_status_created
  ON public.written_exam_regen_runs(status, created_at DESC);

-- =====================================================
-- PIPELINE JOBS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.written_exam_regen_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.written_exam_regen_runs(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.written_exam_questions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'retry', 'in_progress', 'committed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  worker_id TEXT,
  locked_at TIMESTAMPTZ,
  error_message TEXT,
  input_json JSONB,
  output_json JSONB,
  validation_json JSONB,
  write_mode TEXT NOT NULL DEFAULT 'direct' CHECK (write_mode IN ('direct')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_written_exam_regen_jobs_run_status_created
  ON public.written_exam_regen_jobs(run_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_written_exam_regen_jobs_status_created
  ON public.written_exam_regen_jobs(status, created_at);

-- =====================================================
-- PIPELINE CANDIDATES
-- =====================================================
CREATE TABLE IF NOT EXISTS public.written_exam_regen_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.written_exam_regen_runs(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.written_exam_questions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'generated'
    CHECK (status IN ('generated', 'approved', 'applied', 'rejected')),
  candidate_json JSONB NOT NULL,
  validation_json JSONB,
  verifier_json JSONB,
  approved BOOLEAN NOT NULL DEFAULT false,
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  applied_at TIMESTAMPTZ,
  applied_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_written_exam_regen_candidates_run_status
  ON public.written_exam_regen_candidates(run_id, status, created_at);

-- =====================================================
-- PIPELINE AUDIT
-- =====================================================
CREATE TABLE IF NOT EXISTS public.written_exam_regen_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.written_exam_regen_runs(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.written_exam_questions(id) ON DELETE CASCADE,
  old_question_json JSONB NOT NULL,
  new_question_json JSONB NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_written_exam_regen_audit_run_applied
  ON public.written_exam_regen_audit(run_id, applied_at);
