# Database Folder Policy

This folder no longer stores active SQL migration files.

## Active source of truth
- `supabase/migrations/`

## Legacy SQL archive
- Old SQL files were moved to local-only archive:
  - `local_archive/sql_legacy/database/`

## Rule
If a migration is needed, create it in `supabase/migrations/` only.
