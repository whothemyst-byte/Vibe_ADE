-- Applied to the Supabase project (cvithwrsgmtdajaddsab) via MCP on 2026-06-12.
-- Per-device daily usage metering for the groq-proxy edge function.

create table if not exists public.groq_usage (
  device_id text not null,
  day date not null default current_date,
  count int not null default 0,
  primary key (device_id, day)
);

-- RLS on with NO policies: clients can't touch it; the edge function uses the
-- service role, which bypasses RLS.
alter table public.groq_usage enable row level security;

-- Atomic increment-and-read for the proxy's daily quota.
create or replace function public.bump_groq_usage(p_device_id text)
returns int
language sql
security definer
set search_path = public
as $$
  insert into groq_usage (device_id, day, count)
  values (p_device_id, current_date, 1)
  on conflict (device_id, day) do update set count = groq_usage.count + 1
  returning count;
$$;

-- Only the service role (the edge function) may call it.
revoke execute on function public.bump_groq_usage(text) from public, anon, authenticated;
grant execute on function public.bump_groq_usage(text) to service_role;
