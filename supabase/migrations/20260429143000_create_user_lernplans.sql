-- TikTok funnel Lernplan storage.
-- Plans are created as pending_payment before checkout and become visible only after payment.

create table if not exists public.user_lernplans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  user_email text,
  source text not null default 'tiktok_funnel',
  status text not null default 'pending_payment',
  plan_json jsonb not null,
  weak_topics text[] not null default '{}',
  test_score integer,
  test_total integer,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  constraint user_lernplans_source_check check (source in ('tiktok_funnel')),
  constraint user_lernplans_status_check check (status in ('pending_payment', 'active'))
);

create index if not exists idx_user_lernplans_user_active
  on public.user_lernplans (user_id, status, activated_at desc);

create index if not exists idx_user_lernplans_email_source
  on public.user_lernplans (lower(user_email), source, status);

alter table public.user_lernplans enable row level security;

drop policy if exists "Users can read own active lernplans" on public.user_lernplans;
create policy "Users can read own active lernplans"
  on public.user_lernplans
  for select
  to authenticated
  using (
    auth.uid() = user_id
    and status = 'active'
  );
