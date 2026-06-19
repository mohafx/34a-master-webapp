# Scripts (Active)

This folder only keeps the active operational scripts.

## Active scripts
- `run-explanation-pilot.ts` - local-first question explanation pipeline runner.
- `run-explanation-pilot-edge.ts` - edge-function pipeline runner.
- `run-question-explanation-images.ts` - local-first quiz explanation image runner (OpenAI Image API + review gate).
- `question-explanation-image-utils.ts` - shared helpers for quiz explanation image manifests and migrations.
- `run-lesson-image-pilot.ts` - local-first lesson image pipeline runner (Worker API + Supabase Storage).
- `read-batch.ts` - reads and formats batch review content.
- `admin_configure_free_tier.ts` - admin helper for free-tier configuration.
- `transition-access.mjs` - admin helper for the paywall transition grant dry-run/apply/status flow.

## Output location for review files
- Default: `local_archive/batch_reviews/`
- Optional override: `EXPLANATION_REVIEW_OUTPUT_DIR`

Example:
```bash
EXPLANATION_REVIEW_OUTPUT_DIR=local_archive/batch_reviews npm run pilot:explanations -- --module-order=1 --count=5
```

Lesson image example (first image in module 1 / lesson 1):
```bash
npm run pilot:lesson-images -- --module-order=1 --lesson-order=1 --count=1 --style=sachkunde_real_clean
```

Quiz explanation image dry-run (no OpenAI image cost):
```bash
npm run pilot:question-images -- --module-order=1 --count=2 --dry-run --stage=generate
```

Quiz explanation image batch for missing module 1 images:
```bash
npm run pilot:question-images -- --module-order=1 --only-missing --stage=generate
```

After review, create `approved.json` with approved question IDs and commit only those assets:
```bash
npm run pilot:question-images -- --stage=commit --manifest=local_archive/question_explanation_images/<run-id>/manifest.json --approved-file=local_archive/question_explanation_images/<run-id>/approved.json
supabase db push --dry-run
supabase db push
```

Required for real generation: `OPENAI_API_KEY`. Optional overrides:
`QUESTION_IMAGE_MODEL` (default `gpt-image-2`), `QUESTION_IMAGE_SIZE` (default `1536x864`),
`QUESTION_IMAGE_QUALITY` (default `medium`), `QUESTION_IMAGE_TIMEOUT_MS` (default `180000`),
`QUESTION_IMAGE_BRIEF_MODEL` (optional JSON brief model).

Paywall transition examples:
```bash
npm run transition:dry-run
npm run transition:apply
npm run transition:status
```

## Legacy scripts
Older one-off scripts were moved to:
- `local_archive/legacy_scripts/`
