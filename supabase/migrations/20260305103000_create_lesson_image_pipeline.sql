-- Lesson image generation pipeline (local worker pilot)

-- =====================================================
-- LESSONS EXTENSIONS
-- =====================================================
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS image_status TEXT NOT NULL DEFAULT 'none';

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS image_prompt TEXT;

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS image_style_code TEXT;

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS image_model_code TEXT;

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS image_generated_at TIMESTAMPTZ;

ALTER TABLE public.lessons
  DROP CONSTRAINT IF EXISTS lessons_image_status_check;

ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_image_status_check
  CHECK (
    image_status IN ('none', 'queued', 'in_progress', 'generated', 'failed')
  ) NOT VALID;

-- =====================================================
-- PIPELINE RUNS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.lesson_image_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID REFERENCES public.modules(id) ON DELETE SET NULL,
  module_order_index INTEGER,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'in_progress', 'completed', 'failed', 'completed_with_errors')),
  target_count INTEGER NOT NULL CHECK (target_count > 0),
  processed_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  style_code TEXT NOT NULL,
  model_code TEXT NOT NULL,
  bucket_name TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_lesson_image_runs_status_created
  ON public.lesson_image_runs(status, created_at DESC);

-- =====================================================
-- PIPELINE JOBS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.lesson_image_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.lesson_image_runs(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'retry', 'in_progress', 'committed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  worker_id TEXT,
  locked_at TIMESTAMPTZ,
  error_message TEXT,
  input_json JSONB,
  output_json JSONB,
  validation_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_image_jobs_run_status_created
  ON public.lesson_image_jobs(run_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_lesson_image_jobs_status_created
  ON public.lesson_image_jobs(status, created_at);

-- =====================================================
-- PIPELINE AUDIT
-- =====================================================
CREATE TABLE IF NOT EXISTS public.lesson_image_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.lesson_image_runs(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  old_image_url TEXT,
  new_image_url TEXT NOT NULL,
  image_path TEXT NOT NULL,
  prompt_used TEXT,
  style_code TEXT,
  model_code TEXT,
  written_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lesson_image_audit_run_written
  ON public.lesson_image_audit(run_id, written_at);
