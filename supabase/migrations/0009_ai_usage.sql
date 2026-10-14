-- Per-org AI usage. Every setup-assistant / build-schedule call that reaches
-- the model writes one row here, and the Edge Functions refuse a call once
-- an org has used its allowance for the trailing 24 hours. The allowance
-- itself is passed in by the function (supabase/functions/_shared/aiQuota.ts)
-- so it can key off the billing plan later without another migration.

create table ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  function_name text not null,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);

create index ai_usage_events_org_fn_created_idx
  on ai_usage_events(org_id, function_name, created_at desc);

alter table ai_usage_events enable row level security;

-- Owner/manager can read their org's usage. There are no write policies:
-- rows are written only by the Edge Functions under the service_role key.
create policy ai_usage_events_select on ai_usage_events for select
  using (
    org_id = (select org_id from current_membership())
    and (select account_role from current_membership()) in ('owner','manager')
  );

revoke all on ai_usage_events from anon, authenticated;
grant select on ai_usage_events to authenticated;
grant all on ai_usage_events to service_role;

-- Counts the org's calls to one function over the trailing 24 hours and
-- records a new one only if that is under `p_limit`. The advisory lock
-- serializes concurrent calls for the same (org, function), so a burst of
-- parallel requests can't all pass the check.
create or replace function consume_ai_quota(
  p_org_id uuid,
  p_user_id uuid,
  p_function text,
  p_limit integer
)
returns table(allowed boolean, used integer, event_id uuid) as $$
declare
  v_used integer;
  v_event_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_org_id::text || ':' || p_function, 0));

  select count(*) into v_used
  from ai_usage_events
  where org_id = p_org_id
    and function_name = p_function
    and created_at > now() - interval '24 hours';

  if v_used >= p_limit then
    return query select false, v_used, null::uuid;
    return;
  end if;

  insert into ai_usage_events (org_id, user_id, function_name)
  values (p_org_id, p_user_id, p_function)
  returning id into v_event_id;

  return query select true, v_used + 1, v_event_id;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function consume_ai_quota(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function consume_ai_quota(uuid, uuid, text, integer) to service_role;
