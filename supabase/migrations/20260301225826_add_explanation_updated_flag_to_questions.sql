alter table public.questions
  add column if not exists explanation_updated boolean not null default false;

update public.questions
set explanation_updated = (coalesce(explanation_de,'') ~ '^\s*###\s*1\.');;
