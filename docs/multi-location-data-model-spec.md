# Multi-location data model — implementation spec

Target: `supabase/migrations/`, `supabase/functions/`, `src/state/AppState.jsx`,
`src/state/supabaseSync.js`, `src/state/AuthState.jsx` (or wherever `current_membership`
is consumed client-side) in ShiftSizzle.

Goal: move from one-org-one-roster to one-org-many-locations, where each location has
its own employee roster and its own schedules, an employee can be granted shared access
to more than one location, and the UI only ever displays one location's data at a time.

Status: not yet implemented. This is additive-first — existing single-location orgs
must keep working with zero manual data fixes (a backfilled "default" location is
created for every existing org).

---

## 0. Model summary (confirm before implementing)

- **`locations`** is a new top-level entity under `organizations`. Everything that is
  currently org-scoped operational data (roster, schedules, call-outs, and the
  operating-hours/shift-types/team-roles settings that describe *how a site runs*)
  becomes location-scoped instead. Only account-level things (org name, billing,
  membership/invite records) stay org-scoped.
- **An employee has exactly one home location** (`employees.location_id`) — this is
  their roster of record, where they show up by default, and what "shared roster"
  means relative to.
- **Shared access is a grant, not a second home.** `employee_location_access` lets an
  admin/owner say "this employee can also be scheduled at Location B" without moving
  their home record. Revoking access does not delete history — past schedule rows
  keep the employee reference regardless of current grants.
- **Manager access is also a grant.** A manager's membership row is scoped to specific
  locations via `membership_locations`. Owners implicitly see/manage every location in
  their org and never need rows in that table.
- **The client holds exactly one "current location" in view at a time**, analogous to
  how it already holds one current week. Switching locations re-scopes every read —
  roster, schedule, call-outs — the same way switching weeks already re-scopes the
  schedule view.

If any of the above doesn't match intent, stop and flag it before running the
migration — the RLS policies and unique constraints below are built directly on these
assumptions.

---

## 1. Migration: `supabase/migrations/0007_locations.sql`

```sql
-- Multi-location support. An org can have N locations; each location has its
-- own roster and schedules. Employees have one home location plus optional
-- granted access to others; managers have one org-wide role plus optional
-- granted access to specific locations. See multi-location-data-model-spec.md
-- for the full rationale.

-- ---------------------------------------------------------------------------
-- locations: the new operational-settings owner. Columns mirror what used
-- to live on `organizations` (location_name, shift_types, operating_hours,
-- etc.) because those describe one site's operation, not the account.
-- ---------------------------------------------------------------------------

create table locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  address text not null default '',
  shift_types text[] not null default array['Open','Mid','Close'],
  additional_team_roles text[] not null default '{}',
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
-- Backfill: every existing org gets exactly one location, seeded from its
-- current settings columns. Every existing employees/schedule_records/
-- call_outs row is repointed at that location. This keeps every current
-- single-location org working unchanged from the user's perspective.
-- ---------------------------------------------------------------------------

insert into locations (id, org_id, name, shift_types, additional_team_roles, week_starts_on, operating_hours, created_at, updated_at)
select gen_random_uuid(), o.id,
       coalesce(nullif(o.location_name, ''), o.name, 'Main location'),
       o.shift_types, o.additional_team_roles, o.week_starts_on, o.operating_hours,
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
-- shape. Listed for tracking: location_name, shift_types,
-- additional_team_roles, week_starts_on, operating_hours.
-- ---------------------------------------------------------------------------

-- If this project's realtime publication is not FOR ALL TABLES, also run:
--   alter publication supabase_realtime add table locations;
--   alter publication supabase_realtime add table employee_location_access;
--   alter publication supabase_realtime add table membership_locations;
```

**Before running:** confirm the actual constraint names for
`schedule_records`'s and `call_outs`'s existing unique constraints (Postgres
auto-names them from column order; the names above assume the default
convention — check with `\d schedule_records` / `\d call_outs` and adjust
the `drop constraint` lines if they differ).

---

## 2. RPC additions: `supabase/migrations/0008_location_rpcs.sql`

Two operations need service-role-style atomicity the same way
`create_organization` does — creating a location shouldn't be a bare insert
if it also needs to seed sensible defaults, and reassigning an employee's
home location has a side effect (dropping any now-redundant access grant to
that same location).

```sql
create or replace function create_location(
  p_org_id uuid,
  p_name text,
  p_copy_settings_from uuid default null -- optional: another location_id to clone shift_types/operating_hours/coverage from
)
returns uuid as $$
declare
  new_location_id uuid;
  source record;
begin
  if (select account_role from current_membership()) <> 'owner' then
    raise exception 'Only an owner can create a location';
  end if;

  if p_org_id <> (select org_id from current_membership()) then
    raise exception 'Cannot create a location outside your organization';
  end if;

  if p_copy_settings_from is not null then
    select * into source from locations where id = p_copy_settings_from and org_id = p_org_id;
  end if;

  insert into locations (org_id, name, shift_types, additional_team_roles, week_starts_on, operating_hours, role_coverage)
  values (
    p_org_id,
    p_name,
    coalesce(source.shift_types, array['Open','Mid','Close']),
    coalesce(source.additional_team_roles, '{}'),
    coalesce(source.week_starts_on, ''),
    coalesce(source.operating_hours, '{}'::jsonb),
    coalesce(source.role_coverage, '{}'::jsonb)
  )
  returning id into new_location_id;

  return new_location_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function reassign_employee_home_location(p_employee_id uuid, p_new_location_id uuid)
returns void as $$
begin
  if not exists (
    select 1 from employees e
    where e.id = p_employee_id
    and e.org_id = (select org_id from current_membership())
  ) then
    raise exception 'Employee not found in your organization';
  end if;

  update employees set location_id = p_new_location_id where id = p_employee_id;

  -- A grant to the location that's now home is redundant — drop it so
  -- "shared with" listings don't show the employee's own home location.
  delete from employee_location_access
  where employee_id = p_employee_id and location_id = p_new_location_id;
end;
$$ language plpgsql security definer set search_path = public;
```

---

## 3. Edge functions

### `supabase/functions/invite-member/index.ts`

Add `locationIds` (array) to the request body for `accountRole: 'manager'`
invites. After the existing `memberships` upsert succeeds, insert matching
`membership_locations` rows for each id (skip entirely for `staff` invites —
a staff member's location access comes from `employees.location_id` /
`employee_location_access`, not from their membership). Validate every id in
`locationIds` belongs to `callerMembership.org_id` before inserting, the
same way `orgId` is already trusted from the caller's own membership rather
than the request body.

### New: `supabase/functions/grant-employee-location/index.ts`

Small function mirroring `invite-member`'s auth/role-check shape:
validate the caller is `owner` or a `manager` with `membership_locations`
access to the target `location_id`, then upsert into
`employee_location_access`. A thin wrapper is worth it over a raw client
insert so the "manager can only grant locations they themselves have
access to" rule is enforced server-side, not just by RLS (RLS already
blocks it, but a clear 403 with a message is better UX than a silent
insert failure).

---

## 4. Client state: `src/state/AppState.jsx`

- **State shape**: add `locations: []` (array of location objects, id/name/
  settings) and `currentLocationId: null` at the top level, alongside the
  existing `employees`/`schedule`/`schedules`/`callOuts`. `settings` keeps
  only account-level fields (`businessName`, `publishNotifications`); the
  fields that moved to `locations` (`locationName`→`name`, `shiftTypes`,
  `teamRoles`, `roleCoverage`, `weekStartsOn`, `operatingHours`) get read
  from `locations.find(l => l.id === currentLocationId)` instead of from
  `settings` everywhere they're currently referenced.
- **`employees`**: add `locationId` (home) and `sharedLocationIds` (from
  `employee_location_access`, hydrated alongside the employee the same way
  `availability` already is). `normalizeEmployee` needs a
  `currentLocationId` param so a location-filtered roster view can ask "is
  this employee visible here" via `employee.locationId === currentLocationId
  || employee.sharedLocationIds.includes(currentLocationId)`.
- **`schedule`/`schedules`**: every schedule record needs `locationId`.
  `createDefaultSchedule`, `normalizeSchedule`, and the `schedules[]` history
  filtering all need to scope to `currentLocationId` the same way they
  already scope to `startDate`/week.
- **New actions**:
  - `SET_CURRENT_LOCATION` — sets `currentLocationId`, and should trigger
    the same kind of re-derivation `applyWeekContext` already does when the
    week changes (recompute the active `schedule` from `schedules[]` filtered
    to the new location).
  - `ADD_LOCATION` / `UPDATE_LOCATION` (settings edits) / `ARCHIVE_LOCATION`.
  - `GRANT_EMPLOYEE_LOCATION_ACCESS` / `REVOKE_EMPLOYEE_LOCATION_ACCESS`.
  - `REASSIGN_EMPLOYEE_HOME_LOCATION`.
- **`MERGE_SERVER_RECORD`**: add cases for `locations`,
  `employee_location_access`, and `membership_locations` tables, following
  the existing pattern (upsert on non-DELETE, filter out on DELETE).
- **`readOrgMirror`/`mirrorKey`**: the localStorage mirror key is per-org
  today; no change needed there since it still mirrors the whole org bundle
  (all locations) — just make sure the mirrored shape includes `locations`
  and the per-employee `sharedLocationIds`.

## 5. Client sync: `src/state/supabaseSync.js`

- `fetchOrgBundle(orgId)` needs an additional `supabase.from('locations').select('*').eq('org_id', orgId)`
  call in the existing `Promise.all`, plus `employee_location_access` scoped
  by joining through the org's employees (or add `org_id` denormalized onto
  `employee_location_access` if avoiding the join is preferred — simplest is
  to just fetch it unfiltered and let RLS narrow it, matching how
  `call_outs` already tolerates a missing/empty table gracefully).
- `mapEmployeeRowToEmployee` needs `locationId: row.location_id` and to fold
  in the employee's `employee_location_access` rows into `sharedLocationIds`,
  the same way availability is folded in via the `availabilityByEmployeeId`
  map pattern already used.
- `mapScheduleRowToRecord`/`mapRecordToScheduleRow` and the call-out
  equivalents need `locationId`/`location_id` added, following the exact
  pattern already used for `role`.
- The realtime subscription block needs three new `.on('postgres_changes', …)`
  handlers for `locations`, `employee_location_access`, and
  `membership_locations`, mirroring the existing `call_outs` handler
  (including the same graceful-missing-table handling if these ship in a
  later phase than the base migration).

## 6. UI surfaces (not full specs — flag where work is needed)

- A location switcher, almost certainly living where the org name currently
  displays in the nav — this is the single "one location in view" control
  the rest of the app hangs off of.
- Settings gets a new "Locations" section for create/rename/archive plus
  per-location operating hours (the fields that used to be flat Settings
  fields become per-location).
- Team roster needs a "Shared from [Location]" badge on employees who are
  visible via `employee_location_access` rather than home-rostered, and a
  grant/revoke action gated to owner/manager-with-access (reuse the pattern
  in §5 of the scheduler spec for how a similarly-scoped action surfaces
  inline rather than as a separate screen).

---

## 7. Rollout order

1. Run `0007_locations.sql`, verify every existing org ends up with exactly
   one location and all employees/schedules/call-outs correctly repointed
   (spot-check row counts pre/post migration: `count(employees)` and
   `count(distinct location_id)` per org).
2. Run `0008_location_rpcs.sql`.
3. Ship `invite-member` and `grant-employee-location` changes.
4. Ship the `AppState`/`supabaseSync` client changes behind the assumption
   that every org has ≥1 location (true after step 1) — the app should be
   fully functional for existing single-location orgs with zero visible
   change before the location-switcher UI even ships.
5. Ship the location switcher and Settings "Locations" section last, once
   the plumbing above is proven against real (single-location) data.
