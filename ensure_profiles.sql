-- ensure_profiles.sql
create extension if not exists "uuid-ossp";
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text,
  timezone text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create or replace function set_profiles_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;
drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles for each row execute function set_profiles_updated_at();
alter table public.profiles enable row level security;
drop policy if exists pr_sel_own on public.profiles;
drop policy if exists pr_upsert_own on public.profiles;
create policy pr_sel_own on public.profiles for select using (auth.uid() = user_id);
create policy pr_upsert_own on public.profiles for insert with check (auth.uid() = user_id);
create policy pr_upsert_own_upd on public.profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
notify pgrst, 'reload schema';
