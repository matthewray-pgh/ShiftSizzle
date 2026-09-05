-- ShiftSizzle — schedule-builder redesign migrations 0004–0006, combined and
-- made idempotent so it is safe to paste into the Supabase dashboard
-- (Project → SQL Editor → New query → Run) even if some parts already ran.
--
-- Equivalent to running, in order:
--   supabase/migrations/0004_shift_times.sql
--   supabase/migrations/0005_role_coverage.sql
--   supabase/migrations/0006_call_outs.sql

-- ---- 0004: optional per-label shift time ranges -------------------------------
alter table organizations
  add column if not exists shift_times jsonb not null default '{}'::jsonb;

-- ---- 0005: the once-entered coverage-target template -------------------------
alter table organizations
  add column if not exists role_coverage jsonb not null default '{}'::jsonb;

-- ---- 0006: call-out events --------------------------------------------------
create table if not exists call_outs (
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
  unique (org_id, week_start_date, role, day, shift, employee_id)
);

create index if not exists call_outs_org_id_idx on call_outs(org_id);

drop trigger if exists call_outs_set_updated_at on call_outs;
create trigger call_outs_set_updated_at before update on call_outs
  for each row execute function set_updated_at();

alter table call_outs enable row level security;

drop policy if exists call_outs_select on call_outs;
create policy call_outs_select on call_outs for select
  using (org_id = (select org_id from current_membership()));

drop policy if exists call_outs_insert on call_outs;
create policy call_outs_insert on call_outs for insert
  with check (
    org_id = (select org_id from current_membership())
    and (select account_role from current_membership()) in ('owner','manager')
  );

drop policy if exists call_outs_update on call_outs;
create policy call_outs_update on call_outs for update
  using (
    org_id = (select org_id from current_membership())
    and (select account_role from current_membership()) in ('owner','manager')
  )
  with check (org_id = (select org_id from current_membership()));

drop policy if exists call_outs_delete on call_outs;
create policy call_outs_delete on call_outs for delete
  using (
    org_id = (select org_id from current_membership())
    and (select account_role from current_membership()) in ('owner','manager')
  );

-- Realtime: add the table to the publication if it exists and isn't FOR ALL
-- TABLES already. Harmless if it errors — call-outs still sync on next load.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table call_outs;
    exception when others then
      -- already a member, or publication is FOR ALL TABLES
      null;
    end;
  end if;
end $$;
