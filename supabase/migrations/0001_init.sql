-- ShiftSizzle: organizations, roster, schedules, and multi-tenant membership/auth.
-- See docs/ (or the "Supabase Auth + Multi-Tenant Persistence" plan) for the
-- rationale behind the table split (employee_availability separated from
-- employees so staff can self-edit only their own availability) and the
-- settings-as-columns choice on `organizations`.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'ShiftSizzle',
  location_name text not null default '',
  scheduler_name text not null default '',
  publish_notifications boolean not null default true,
  shift_types text[] not null default array['Open','Mid','Close'],
  additional_team_roles text[] not null default '{}',
  week_starts_on text not null default '',
  operating_hours jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table employees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  title text not null default '',
  roles text[] not null default '{}',
  contact text not null default '',
  email text not null default '',
  shifts_per_week int not null default 5,
  status text not null check (status in ('active','archived')) default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index employees_org_id_idx on employees(org_id);

-- Split out from employees so staff can self-edit ONLY this table, never
-- the rest of their (or anyone else's) roster row.
create table employee_availability (
  employee_id uuid primary key references employees(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  availability jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index employee_availability_org_id_idx on employee_availability(org_id);

-- One row per (org, week, role). Mirrors the client's schedules[] history AND
-- doubles as the persisted "live canvas" — draft rows ARE the in-progress
-- week; save/publish just flips status. Derived review output (coverage
-- gaps, shift-cap alerts) is cheap to recompute client-side and is not
-- persisted here.
create table schedule_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  week_label text not null default '',
  start_date date not null,
  end_date date not null,
  role text not null,
  status text not null check (status in ('draft','published')) default 'draft',
  requirements jsonb not null default '{}'::jsonb,
  assignments jsonb not null default '{}'::jsonb,
  notes text not null default '',
  saved_at timestamptz,
  published_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, start_date, role)
);

create index schedule_records_org_id_idx on schedule_records(org_id);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  employee_id uuid references employees(id) on delete set null,
  account_role text not null check (account_role in ('owner','manager','staff')),
  status text not null check (status in ('invited','active','disabled')) default 'invited',
  invited_email text not null,
  invited_by uuid references auth.users(id),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, invited_email)
);

create index memberships_org_id_idx on memberships(org_id);
create index memberships_user_id_idx on memberships(user_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger organizations_set_updated_at before update on organizations
  for each row execute function set_updated_at();
create trigger employees_set_updated_at before update on employees
  for each row execute function set_updated_at();
create trigger employee_availability_set_updated_at before update on employee_availability
  for each row execute function set_updated_at();
create trigger schedule_records_set_updated_at before update on schedule_records
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Helper: current caller's active membership. security definer + fixed
-- search_path avoids the classic recursive-RLS trap of a `memberships`
-- policy querying `memberships` through the normal (RLS-checked) path.
-- v1 assumption: one active membership per auth user, no org-switcher yet.
-- ---------------------------------------------------------------------------

create or replace function current_membership()
returns table(org_id uuid, account_role text, employee_id uuid) as $$
  select org_id, account_role, employee_id from memberships
  where user_id = auth.uid() and status = 'active'
  limit 1;
$$ language sql stable security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- Bootstrap RPC: first-time signup creates an org + owner membership
-- atomically. Callable by any authenticated user; a user who already has an
-- active membership calling this again just creates a second org they own
-- (fine for v1 — no org-switcher UI, but nothing stops multi-org owners).
-- ---------------------------------------------------------------------------

create or replace function create_organization(org_name text)
returns uuid as $$
declare
  new_org_id uuid;
begin
  insert into organizations (name) values (org_name)
  returning id into new_org_id;

  insert into memberships (org_id, user_id, account_role, status, invited_email, accepted_at)
  values (new_org_id, auth.uid(), 'owner', 'active', auth.email(), now());

  return new_org_id;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- Invite acceptance: when an invited user's auth.users row is provisioned
-- (via auth.admin.inviteUserByEmail from the invite-member Edge Function),
-- flip the matching membership from 'invited' to 'active'. Fires at
-- provisioning time, before the invitee even opens the email — atomic, and
-- doesn't depend on the invitee's browser completing anything.
-- ---------------------------------------------------------------------------

create or replace function handle_new_membership_user()
returns trigger as $$
begin
  update memberships
  set user_id = new.id, status = 'active', accepted_at = now()
  where id = (new.raw_user_meta_data->>'invited_membership_id')::uuid;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_membership_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table organizations enable row level security;
alter table employees enable row level security;
alter table employee_availability enable row level security;
alter table schedule_records enable row level security;
alter table memberships enable row level security;

-- organizations: any active member can read; only owner/manager can update;
-- no client insert policy — orgs are created only via create_organization().
create policy organizations_select on organizations for select
  using (id = (select org_id from current_membership()));

create policy organizations_update on organizations for update
  using (
    id = (select org_id from current_membership())
    and (select account_role from current_membership()) in ('owner','manager')
  );

-- memberships: owner/manager manage all rows in their org; staff can see
-- only their own row (so they can't enumerate other members' invite state).
create policy memberships_select_manager on memberships for select
  using (
    org_id = (select org_id from current_membership())
    and (select account_role from current_membership()) in ('owner','manager')
  );

create policy memberships_select_self on memberships for select
  using (user_id = auth.uid());

create policy memberships_insert_manager on memberships for insert
  with check (
    org_id = (select org_id from current_membership())
    and (select account_role from current_membership()) in ('owner','manager')
  );

create policy memberships_update_owner on memberships for update
  using (
    org_id = (select org_id from current_membership())
    and (select account_role from current_membership()) = 'owner'
  );

create policy memberships_delete_owner on memberships for delete
  using (
    org_id = (select org_id from current_membership())
    and (select account_role from current_membership()) = 'owner'
  );

-- employees: org-wide read (staff need to see coworkers for the schedule);
-- writes restricted to owner/manager, with an explicit WITH CHECK to block
-- cross-tenant payload spoofing on insert/update.
create policy employees_select on employees for select
  using (org_id = (select org_id from current_membership()));

create policy employees_insert on employees for insert
  with check (
    org_id = (select org_id from current_membership())
    and (select account_role from current_membership()) in ('owner','manager')
  );

create policy employees_update on employees for update
  using (
    org_id = (select org_id from current_membership())
    and (select account_role from current_membership()) in ('owner','manager')
  )
  with check (org_id = (select org_id from current_membership()));

create policy employees_delete on employees for delete
  using (
    org_id = (select org_id from current_membership())
    and (select account_role from current_membership()) in ('owner','manager')
  );

-- employee_availability: org-wide read; write allowed for owner/manager OR
-- the staff member who owns that employee_id — the one place staff get
-- write access, structurally scoped to their own row.
create policy employee_availability_select on employee_availability for select
  using (org_id = (select org_id from current_membership()));

create policy employee_availability_upsert on employee_availability for insert
  with check (
    org_id = (select org_id from current_membership())
    and (
      (select account_role from current_membership()) in ('owner','manager')
      or employee_id = (select employee_id from current_membership())
    )
  );

create policy employee_availability_update on employee_availability for update
  using (
    org_id = (select org_id from current_membership())
    and (
      (select account_role from current_membership()) in ('owner','manager')
      or employee_id = (select employee_id from current_membership())
    )
  )
  with check (org_id = (select org_id from current_membership()));

-- schedule_records: org-wide read (staff need to see published schedules);
-- all writes restricted to owner/manager.
create policy schedule_records_select on schedule_records for select
  using (org_id = (select org_id from current_membership()));

create policy schedule_records_insert on schedule_records for insert
  with check (
    org_id = (select org_id from current_membership())
    and (select account_role from current_membership()) in ('owner','manager')
  );

create policy schedule_records_update on schedule_records for update
  using (
    org_id = (select org_id from current_membership())
    and (select account_role from current_membership()) in ('owner','manager')
  )
  with check (org_id = (select org_id from current_membership()));

create policy schedule_records_delete on schedule_records for delete
  using (
    org_id = (select org_id from current_membership())
    and (select account_role from current_membership()) in ('owner','manager')
  );
