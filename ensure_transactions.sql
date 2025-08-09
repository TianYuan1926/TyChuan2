-- ensure_transactions.sql
create extension if not exists "uuid-ossp";
create table if not exists public.transactions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  ts timestamptz not null,
  symbol text not null,
  side text not null,
  qty numeric not null,
  price numeric not null,
  fee numeric,
  exchange text,
  strategy text,
  account text,
  tags text[],
  notes text,
  attachment_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;
drop trigger if exists trg_set_updated_at on public.transactions;
create trigger trg_set_updated_at before update on public.transactions for each row execute function set_updated_at();
alter table public.transactions enable row level security;
drop policy if exists tx_sel_own on public.transactions;
drop policy if exists tx_ins_own on public.transactions;
drop policy if exists tx_upd_own on public.transactions;
drop policy if exists tx_del_own on public.transactions;
create policy tx_sel_own on public.transactions for select using (auth.uid() = user_id);
create policy tx_ins_own on public.transactions for insert with check (auth.uid() = user_id);
create policy tx_upd_own on public.transactions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy tx_del_own on public.transactions for delete using (auth.uid() = user_id);
create index if not exists idx_tx_user_ts on public.transactions(user_id, ts desc);
notify pgrst, 'reload schema';
