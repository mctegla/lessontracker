-- ============================================================================
-- Lesson Tracker: initial schema
-- Run this in the Supabase SQL Editor (or via `supabase db push`).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user, mirrors Base44's "User.role" field
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_date timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user is created
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role) values (new.id, 'user');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- google_calendar_tokens: replaces Base44's hidden "googlecalendar" connector
-- ---------------------------------------------------------------------------
create table if not exists public.google_calendar_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text,
  updated_at timestamptz not null default now()
);

alter table public.google_calendar_tokens enable row level security;

-- Only edge functions (using the service role key) read/write this table.
-- No client-side policies are added on purpose: the frontend should never
-- see raw Google tokens directly.

-- ---------------------------------------------------------------------------
-- trackers
-- ---------------------------------------------------------------------------
create table if not exists public.trackers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  lesson_event_name text not null,
  alternate_lesson_event_names text[] not null default '{}',
  package_size numeric not null default 4,
  early_warning_value numeric not null default 2,
  early_warning_unit text not null default 'lessons' check (early_warning_unit in ('lessons', 'days')),
  recurring boolean not null default true,
  reminder_event_title text not null default 'Lesson package due',
  warning_event_title text not null default 'Lesson package running low',
  scan_calendar_id text,
  target_calendar_id text,
  tracking_start_date date,
  package_start_date date not null,
  cost_per_package numeric,
  color text not null default 'blue' check (color in ('blue','emerald','amber','purple','rose','cyan','orange','pink')),
  active boolean not null default true,
  package_number numeric not null default 0,
  warning_event_id text,
  due_event_id text,
  last_synced timestamptz,
  last_sync_error text,
  last_alert text,
  last_computed jsonb,
  created_date timestamptz not null default now()
);

alter table public.trackers enable row level security;

create policy "trackers_all_own" on public.trackers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- purchase_logs
-- ---------------------------------------------------------------------------
create table if not exists public.purchase_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tracker_id uuid not null references public.trackers(id) on delete cascade,
  tracker_name text,
  date_purchased date not null,
  package_size numeric,
  cost numeric,
  source text not null default 'manual' check (source in ('auto', 'manual')),
  package_number numeric,
  package_start_date date,
  created_date timestamptz not null default now()
);

alter table public.purchase_logs enable row level security;

create policy "purchase_logs_all_own" on public.purchase_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists purchase_logs_tracker_idx on public.purchase_logs(tracker_id);

-- ---------------------------------------------------------------------------
-- app_notifications
-- ---------------------------------------------------------------------------
create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tracker_id uuid not null references public.trackers(id) on delete cascade,
  tracker_name text,
  type text not null check (type in ('warning','due','reconnect','alert')),
  message text not null,
  package_number numeric,
  cleared boolean not null default false,
  created_date timestamptz not null default now()
);

alter table public.app_notifications enable row level security;

create policy "app_notifications_all_own" on public.app_notifications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists app_notifications_tracker_idx on public.app_notifications(tracker_id);

-- ---------------------------------------------------------------------------
-- Realtime: enable so the frontend's live "subscribe" calls keep working
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.trackers;
alter publication supabase_realtime add table public.app_notifications;

-- ---------------------------------------------------------------------------
-- Scheduled sync: re-run syncTrackers for every user every 30 minutes.
-- Requires the pg_cron and pg_net extensions (enable both under
-- Database > Extensions in the Supabase dashboard first).
-- Replace the two placeholders below with your project's values
-- (Project Settings > API) before running this block.
-- ---------------------------------------------------------------------------
-- select cron.schedule(
--   'lesson-tracker-sync',
--   '*/30 * * * *',
--   $$
--   select net.http_post(
--     url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/sync-trackers',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer YOUR-SERVICE-ROLE-KEY'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
