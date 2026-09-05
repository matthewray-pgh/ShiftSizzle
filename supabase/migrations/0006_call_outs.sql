-- Call-out events (§6). A call-out is not a plain unfilled slot — the shift
-- WAS covered and now isn't. We log a minimal durable record so a shift can
-- surface as "needs coverage" (derived: an unresolved row exists for it) and
-- so employee-level reliability reporting can be built later without a data
-- migration. No reason field in this pass; broadcast/notify-staff resolution
-- is deferred (resolved_via is only 'manual' | null for now).

create table call_outs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  week_start_date date not null,
  role text not null,
  day text not null,
  shift text not null,
  employee_id uuid not null,
  called_out_at timestamptz not null default now(),
  resolved_via text check (resolved_via in ('manual','broadcast')),
  covered_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One row per person per scheduled slot; a repeat "mark called out" upserts.
  unique (org_id, week_start_date, role, day, shift, employee_id)
);

create index call_outs_org_id_idx on call_outs(org_id);

create trigger call_outs_set_updated_at before update on call_outs
  for each row execute function set_updated_at();

alter table call_outs enable row level security;

-- Same shape as schedule_records: org-wide read, owner/manager write.
create policy call_outs_select on call_outs for select
  using (org_id = (select org_id from current_membership()));

create policy call_outs_insert on call_outs for insert
  with check (
    org_id = (select org_id from current_membership())
    and (select account_role from current_membership()) in ('owner','manager')
  );

create policy call_outs_update on call_outs for update
  using (
    org_id = (select org_id from current_membership())
    and (select account_role from current_membership()) in ('owner','manager')
  )
  with check (org_id = (select org_id from current_membership()));

create policy call_outs_delete on call_outs for delete
  using (
    org_id = (select org_id from current_membership())
    and (select account_role from current_membership()) in ('owner','manager')
  );

-- If this project's realtime publication is not FOR ALL TABLES, also run:
--   alter publication supabase_realtime add table call_outs;
