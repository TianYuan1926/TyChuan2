-- ensure_plans.sql
create extension if not exists "uuid-ossp";
create table if not exists public.plans (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  symbol text not null,
  side text,
  entry numeric,
  stop numeric,
  take numeric,
  leverage integer,
  size numeric,
  plan_time timestamptz,
  logic text,
  status text default 'open',
  created_at timestamptz default now()
);
alter table public.plans enable row level security;
drop policy if exists pl_sel_own on public.plans;
drop policy if exists pl_ins_own on public.plans;
drop policy if exists pl_upd_own on public.plans;
drop policy if exists pl_del_own on public.plans;
create policy pl_sel_own on public.plans for select using (auth.uid() = user_id);
create policy pl_ins_own on public.plans for insert with check (auth.uid() = user_id);
create policy pl_upd_own on public.plans for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy pl_del_own on public.plans for delete using (auth.uid() = user_id);
create index if not exists idx_pl_user_time on public.plans(user_id, plan_time desc);
notify pgrst, 'reload schema';
