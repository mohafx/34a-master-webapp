# Scripts (Active)

This folder only keeps the active operational scripts.

## Active scripts
- `run-explanation-pilot.ts` - local-first question explanation pipeline runner.
- `run-explanation-pilot-edge.ts` - edge-function pipeline runner.
- `run-lesson-image-pilot.ts` - local-first lesson image pipeline runner (Worker API + Supabase Storage).
- `read-batch.ts` - reads and formats batch review content.
- `admin_configure_free_tier.ts` - admin helper for free-tier configuration.

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

## Legacy scripts
Older one-off scripts were moved to:
- `local_archive/legacy_scripts/`
