-- Multi-location support. An org can have N locations; each location has its
-- own roster and schedules. Employees have one home location plus optional
-- granted access to others; managers have one org-wide role plus optional
-- granted access to specific locations. See multi-location-data-model-spec.md
-- for the full rationale.
--
-- Deviations from that spec, made while implementing (the spec predates
-- migrations 0003-0006 and missed a few columns as a result):
--   - `locations.team_roles` replaces the spec's `additional_team_roles`.
--     `organizations.team_roles` (0003) is the real canonical roles list;
--     `additional_team_roles` is legacy and mostly empty. Carrying the
--     legacy column forward would have silently dropped every org's actual
--     roles on migration.
--   - `locations.shift_times` (0004) was missing entirely from the spec.
--   - The backfill INSERT below includes `role_coverage` (0005), which the
--     spec's table definition declared but its INSERT never selected.
--   - `create_organization()` is updated here to also create a first
--     location. The spec only backfills *existing* orgs; without this fix,
--     every org created after this migration ships would have zero
--     locations, breaking the "every org has >=1 location" invariant the
--     client is about to depend on.

-- ---------------------------------------------------------------------------
-- locations: the new operational-settings owner. Columns mirror what used
-- to live on `organizations` (location_name, shift_types, shift_times,
-- team_roles, operating_hours, role_coverage) because those describe one
-- site's operation, not the account.
-- ---------------------------------------------------------------------------

create table locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  address text not null default '',
  shift_types text[] not null default array['Open','Mid','Close'],
  shift_times jsonb not null default '{}'::jsonb,
  team_roles text[] not null default array['Manager','Server','Host','Bartender','Cook'],
  week_starts_on text not null default '',
  operating_hours jsonb not null default '{}'::jsonb,
  role_coverage jsonb not null default '{}'::jsonb,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index locations_org_id_idx on locations(org_id);

create trigger locations_set_updated_at before update on locations
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- create_organization(): every org must have >=1 location going forward.
-- Re-declared (signature unchanged) with an added location insert so a
-- brand-new signup never ends up in the zero-location state the rest of
-- this migration is trying to eliminate.
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

  insert into locations (org_id, name)
  values (new_org_id, 'Main location');

  return new_org_id;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- Backfill: every existing org gets exactly one location, seeded from its
-- current settings columns. Every existing employees/schedule_records/
-- call_outs row is repointed at that location. This keeps every current
-- single-location org working unchanged from the user's perspective.
-- ---------------------------------------------------------------------------

insert into locations (id, org_id, name, shift_types, shift_times, team_roles, week_starts_on, operating_hours, role_coverage, created_at, updated_at)
select gen_random_uuid(), o.id,
       coalesce(nullif(o.location_name, ''), o.name, 'Main location'),
       o.shift_types, o.shift_times, o.team_roles, o.week_starts_on, o.operating_hours, o.role_coverage,
       o.created_at, o.updated_at
from organizations o;

-- ---------------------------------------------------------------------------
-- employees: add home location, backfill from the org's single seeded
-- location, then make it required. NOT NULL is deferred to a second step so
-- the backfill has somewhere to write before the constraint is enforced.
-- ---------------------------------------------------------------------------

alter table employees add column location_id uuid references locations(id) on delete restrict;

update employees e
set location_id = l.id
from locations l
where l.org_id = e.org_id;

alter table employees alter column location_id set not null;

create index employees_location_id_idx on employees(location_id);

-- location_id uses ON DELETE RESTRICT rather than CASCADE: deleting a
-- location with employees still homed there should fail loudly (reassign or
-- archive the employees first), not silently vaporize roster rows.

-- ---------------------------------------------------------------------------
-- employee_location_access: the "shared, granted by admin" join table.
-- Absence of a row here is the normal case; a row means an explicit grant
-- beyond the employee's home location.
-- ---------------------------------------------------------------------------

create table employee_location_access (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  unique (employee_id, location_id)
);

create index employee_location_access_employee_id_idx on employee_location_access(employee_id);
create index employee_location_access_location_id_idx on employee_location_access(location_id);

-- ---------------------------------------------------------------------------
-- membership_locations: which locations a manager can access. Only
-- meaningful for account_role = 'manager' — owners bypass this table
-- entirely (see current_membership_locations() below). No rows needed for
-- an existing single-location org; a manager there already has implicit
-- access via the "only one location exists" case, but we backfill anyway so
-- behavior doesn't silently change if a second location is added later.
-- ---------------------------------------------------------------------------

create table membership_locations (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references memberships(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  unique (membership_id, location_id)
);

create index membership_locations_membership_id_idx on membership_locations(membership_id);

insert into membership_locations (membership_id, location_id)
select m.id, l.id
from memberships m
join locations l on l.org_id = m.org_id
where m.account_role = 'manager';

-- ---------------------------------------------------------------------------
-- schedule_records / call_outs: repoint at location instead of org. The
-- uniqueness boundary for a schedule row moves from (org, week, role) to
-- (location, week, role) — two locations can each have their own "Server"
-- schedule for the same week.
-- ---------------------------------------------------------------------------

alter table schedule_records add column location_id uuid references locations(id) on delete cascade;
alter table call_outs add column location_id uuid references locations(id) on delete cascade;

update schedule_records sr set location_id = l.id from locations l where l.org_id = sr.org_id;
update call_outs co set location_id = l.id from locations l where l.org_id = co.org_id;

alter table schedule_records alter column location_id set not null;
alter table call_outs alter column location_id set not null;

alter table schedule_records drop constraint schedule_records_org_id_start_date_role_key;
alter table schedule_records add constraint schedule_records_location_id_start_date_role_key
  unique (location_id, start_date, role);

alter table call_outs drop constraint call_outs_org_id_week_start_date_role_day_shift_employee_id_key;
alter table call_outs add constraint call_outs_location_id_week_start_date_role_day_shift_employee_id_key
  unique (location_id, week_start_date, role, day, shift, employee_id);

create index schedule_records_location_id_idx on schedule_records(location_id);
create index call_outs_location_id_idx on call_outs(location_id);

-- org_id stays on both tables (not dropped) — cheap org-wide queries (e.g.
-- "all schedules across the account" for a future cross-location report)
-- don't need a join through locations, and RLS below still checks org_id as
-- a cheap first filter before the location check.

-- ---------------------------------------------------------------------------
-- employee_availability: no location_id needed. Availability belongs to the
-- employee as a person, not to a location; a shared employee's availability
-- is the same set of hours regardless of which location schedules them.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- current_membership(): unchanged in shape, still returns the caller's org.
-- Add a companion function returning the set of location_ids the caller can
-- act on, so RLS policies don't each have to re-derive owner-vs-manager
-- logic inline.
-- ---------------------------------------------------------------------------

create or replace function current_membership_locations()
returns setof uuid as $$
  select l.id
  from locations l
  join memberships m on m.org_id = l.org_id
  where m.user_id = auth.uid() and m.status = 'active'
    and (
      m.account_role = 'owner'
      or l.id in (select location_id from membership_locations where membership_id = m.id)
    )
$$ language sql stable security definer set search_path = public;

-- Staff read scope: home location plus any explicitly granted locations.
create or replace function current_employee_locations()
returns setof uuid as $$
  select coalesce(e.location_id, '00000000-0000-0000-0000-000000000000'::uuid)
  from memberships m
  join employees e on e.id = m.employee_id
  where m.user_id = auth.uid() and m.status = 'active'
  union
  select ela.location_id
  from memberships m
  join employee_location_access ela on ela.employee_id = m.employee_id
  where m.user_id = auth.uid() and m.status = 'active'
$$ language sql stable security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table locations enable row level security;
alter table employee_location_access enable row level security;
alter table membership_locations enable row level security;

-- locations: any active member reads every location in their org (needed
-- for the location switcher itself); only owner/manager-with-access write.
create policy locations_select on locations for select
  using (org_id = (select org_id from current_membership()));

create policy locations_insert on locations for insert
  with check (
    org_id = (select org_id from current_membership())
    and (select account_role from current_membership()) = 'owner'
  );

create policy locations_update on locations for update
  using (
    org_id = (select org_id from current_membership())
    and (
      (select account_role from current_membership()) = 'owner'
      or id in (select current_membership_locations())
    )
  )
  with check (org_id = (select org_id from current_membership()));

create policy locations_delete on locations for delete
  using (
    org_id = (select org_id from current_membership())
    and (select account_role from current_membership()) = 'owner'
  );

-- employees: replace the old org-wide select/write policies with
-- location-aware ones. Owner/manager-with-access to the employee's home
-- location can write; select widens to "home location in my access set OR
-- I've been granted access to this employee specifically."
drop policy employees_select on employees;
drop policy employees_insert on employees;
drop policy employees_update on employees;
drop policy employees_delete on employees;

create policy employees_select on employees for select
  using (
    org_id = (select org_id from current_membership())
    and (
      (select account_role from current_membership()) = 'owner'
      or location_id in (select current_membership_locations())
      or location_id in (select current_employee_locations())
      or id in (select employee_id from employee_location_access where location_id in (select current_employee_locations()))
    )
  );

create policy employees_insert on employees for insert
  with check (
    org_id = (select org_id from current_membership())
    and (
      (select account_role from current_membership()) = 'owner'
      or location_id in (select current_membership_locations())
    )
  );

create policy employees_update on employees for update
  using (
    org_id = (select org_id from current_membership())
    and (
      (select account_role from current_membership()) = 'owner'
      or location_id in (select current_membership_locations())
    )
  )
  with check (org_id = (select org_id from current_membership()));

create policy employees_delete on employees for delete
  using (
    org_id = (select org_id from current_membership())
    and (
      (select account_role from current_membership()) = 'owner'
      or location_id in (select current_membership_locations())
    )
  );

-- Note: migration 0002's `employees_update_self` policy (staff self-editing
-- contact/email on their own linked row) is untouched — it already scopes
-- by `id = current employee_id`, which needs no location awareness.

-- employee_location_access: owner/manager-with-access to the target
-- location can grant/revoke; anyone who can already see the employee can
-- see the grant (so staff know why a coworker appears on a second roster).
create policy employee_location_access_select on employee_location_access for select
  using (
    employee_id in (select id from employees)  -- relies on employees_select above
  );

create policy employee_location_access_insert on employee_location_access for insert
  with check (
    (select account_role from current_membership()) = 'owner'
    or location_id in (select current_membership_locations())
  );

create policy employee_location_access_delete on employee_location_access for delete
  using (
    (select account_role from current_membership()) = 'owner'
    or location_id in (select current_membership_locations())
  );

-- membership_locations: owner-only. Managers can see their own grants (so
-- the UI can show "you have access to: X, Y") but not edit them.
create policy membership_locations_select on membership_locations for select
  using (
    membership_id = (select id from memberships where user_id = auth.uid() and status = 'active')
    or (select account_role from current_membership()) = 'owner'
  );

create policy membership_locations_insert on membership_locations for insert
  with check ((select account_role from current_membership()) = 'owner');

create policy membership_locations_delete on membership_locations for delete
  using ((select account_role from current_membership()) = 'owner');

-- schedule_records / call_outs: swap the org check for a location check.
drop policy schedule_records_select on schedule_records;
drop policy schedule_records_insert on schedule_records;
drop policy schedule_records_update on schedule_records;
drop policy schedule_records_delete on schedule_records;

create policy schedule_records_select on schedule_records for select
  using (
    org_id = (select org_id from current_membership())
    and (
      (select account_role from current_membership()) = 'owner'
      or location_id in (select current_membership_locations())
      or location_id in (select current_employee_locations())
    )
  );

create policy schedule_records_insert on schedule_records for insert
  with check (
    org_id = (select org_id from current_membership())
    and (
      (select account_role from current_membership()) = 'owner'
      or location_id in (select current_membership_locations())
    )
  );

create policy schedule_records_update on schedule_records for update
  using (
    org_id = (select org_id from current_membership())
    and (
      (select account_role from current_membership()) = 'owner'
      or location_id in (select current_membership_locations())
    )
  )
  with check (org_id = (select org_id from current_membership()));

create policy schedule_records_delete on schedule_records for delete
  using (
    org_id = (select org_id from current_membership())
    and (
      (select account_role from current_membership()) = 'owner'
      or location_id in (select current_membership_locations())
    )
  );

drop policy call_outs_select on call_outs;
drop policy call_outs_insert on call_outs;
drop policy call_outs_update on call_outs;
drop policy call_outs_delete on call_outs;

create policy call_outs_select on call_outs for select
  using (
    org_id = (select org_id from current_membership())
    and (
      (select account_role from current_membership()) = 'owner'
      or location_id in (select current_membership_locations())
      or location_id in (select current_employee_locations())
    )
  );

create policy call_outs_insert on call_outs for insert
  with check (
    org_id = (select org_id from current_membership())
    and (
      (select account_role from current_membership()) = 'owner'
      or location_id in (select current_membership_locations())
    )
  );

create policy call_outs_update on call_outs for update
  using (
    org_id = (select org_id from current_membership())
    and (
      (select account_role from current_membership()) = 'owner'
      or location_id in (select current_membership_locations())
    )
  )
  with check (org_id = (select org_id from current_membership()));

create policy call_outs_delete on call_outs for delete
  using (
    org_id = (select org_id from current_membership())
    and (
      (select account_role from current_membership()) = 'owner'
      or location_id in (select current_membership_locations())
    )
  );

-- ---------------------------------------------------------------------------
-- organizations: the settings columns that moved to `locations` are left in
-- place on `organizations` for one release (read-only, unused by the client
-- after this migration) rather than dropped here. Drop them in a follow-up
-- migration once the client has shipped and no rows depend on the old
-- shape. Listed for tracking: location_name, shift_types, shift_times,
-- team_roles, additional_team_roles, week_starts_on, operating_hours,
-- role_coverage.
-- ---------------------------------------------------------------------------

-- If this project's realtime publication is not FOR ALL TABLES, also run:
--   alter publication supabase_realtime add table locations;
--   alter publication supabase_realtime add table employee_location_access;
--   alter publication supabase_realtime add table membership_locations;
