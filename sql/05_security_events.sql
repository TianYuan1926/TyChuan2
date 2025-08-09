-- 第5步：安全审计日志（用户可见）
-- 仅本人可见，免费实现。

-- 依赖扩展（生成 UUID）
create extension if not exists "uuid-ossp";

create table if not exists public.security_events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null,
  event_type text not null,           -- login / logout / password_change / mfa_enable / mfa_disable / magic_link_login / resend_email 等
  message text,
  user_agent text,
  ip_address text,
  created_at timestamptz not null default now()
);

alter table public.security_events enable row level security;

-- 清理旧策略
drop policy if exists "sel_own_events" on public.security_events;
drop policy if exists "ins_own_events" on public.security_events;

-- 仅本人可见
create policy "sel_own_events"
on public.security_events for select
using (auth.uid() = user_id);

-- 仅本人可插入自己的事件（通过 RPC 时由函数强制写入 auth.uid()）
create policy "ins_own_events"
on public.security_events for insert
with check (auth.uid() = user_id);

-- 日志 RPC（避免前端伪造 user_id）
drop function if exists public.log_security_event(text, text, text, text);
create function public.log_security_event(
  p_event_type text,
  p_message    text,
  p_user_agent text,
  p_ip         text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.security_events (user_id, event_type, message, user_agent, ip_address)
  values (auth.uid(), p_event_type, p_message, p_user_agent, p_ip);
end;
$$;

grant execute on function public.log_security_event(text, text, text, text) to authenticated;