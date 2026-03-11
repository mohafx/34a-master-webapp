-- Multi-agent explanation pipeline (pilot)

-- =====================================================
-- QUESTIONS EXTENSIONS (idempotent)
-- =====================================================
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS explanation_updated BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS explanation_updated_at TIMESTAMPTZ;

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS explanation_version TEXT;

UPDATE public.questions
SET explanation_updated = false
WHERE explanation_updated IS NULL;

-- =====================================================
-- PIPELINE RUNS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.question_explanation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  module_order_index INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'in_progress', 'completed', 'failed', 'completed_with_errors')),
  target_count INTEGER NOT NULL CHECK (target_count > 0),
  processed_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  model_code TEXT NOT NULL,
  write_mode TEXT NOT NULL DEFAULT 'direct' CHECK (write_mode IN ('direct')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_question_explanation_runs_status_created
  ON public.question_explanation_runs(status, created_at DESC);

-- =====================================================
-- PIPELINE JOBS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.question_explanation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.question_explanation_runs(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_question_explanation_jobs_run_status_created
  ON public.question_explanation_jobs(run_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_question_explanation_jobs_status_created
  ON public.question_explanation_jobs(status, created_at);

-- =====================================================
-- PIPELINE AUDIT
-- =====================================================
CREATE TABLE IF NOT EXISTS public.question_explanation_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.question_explanation_runs(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  old_explanation_de TEXT,
  old_explanation_ar TEXT,
  new_explanation_de TEXT NOT NULL,
  new_explanation_ar TEXT NOT NULL,
  written_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_question_explanation_audit_run_written
  ON public.question_explanation_audit(run_id, written_at);
