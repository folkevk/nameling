create table if not exists public.nameling_usage_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  session_id text not null,
  event_type text not null,
  metric text,
  query_name text,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists nameling_usage_events_created_at_idx
  on public.nameling_usage_events (created_at desc);

create index if not exists nameling_usage_events_session_idx
  on public.nameling_usage_events (session_id, created_at);

create index if not exists nameling_usage_events_event_type_idx
  on public.nameling_usage_events (event_type, created_at desc);

alter table public.nameling_usage_events enable row level security;

drop policy if exists "Allow anonymous usage inserts" on public.nameling_usage_events;
create policy "Allow anonymous usage inserts"
  on public.nameling_usage_events
  for insert
  to anon
  with check (true);
