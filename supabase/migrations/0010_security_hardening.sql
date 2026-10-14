-- Security hardening ahead of public signup, plus two bugs from 0007 found
-- while testing it. Policy and function changes only; no table shapes
-- change and no existing rows are touched. Each section names what it fixes.

-- ---------------------------------------------------------------------------
-- employees <-> employee_location_access policy loop (bug from 0007).
-- employees_select reads employee_location_access, whose select policy read
-- employees back, so Postgres refused every read, update and upsert on
-- employees with "infinite recursion detected in policy". The grant policy
-- now checks the location's org instead of going back through employees:
-- any member of the org can see which of its locations an employee is
-- shared with.
-- ---------------------------------------------------------------------------

drop policy if exists employee_location_access_select on employee_location_access;

create policy employee_location_access_select on employee_location_access for select
  using (
    location_id in (select id from locations where org_id = (select org_id from current_membership()))
  );

-- ---------------------------------------------------------------------------
-- current_membership(): `limit 1` with no order picked an arbitrary row
-- when a user had more than one active membership. Prefer the oldest, so
-- the answer is stable. (create_organization below stops new duplicates.)
-- ---------------------------------------------------------------------------

create or replace function current_membership()
returns table(org_id uuid, account_role text, employee_id uuid) as $$
  select org_id, account_role, employee_id from memberships
  where user_id = auth.uid() and status = 'active'
  order by accepted_at nulls last, created_at
  limit 1;
$$ language sql stable security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- create_organization(): anyone signed in could create unlimited orgs, and a
-- second one left them with two active memberships. Now: one org per user,
-- a sane name length, and no anonymous callers.
-- ---------------------------------------------------------------------------

create or replace function create_organization(org_name text)
returns uuid as $$
declare
  new_org_id uuid;
  clean_name text := btrim(coalesce(org_name, ''));
begin
  if auth.uid() is null then
    raise exception 'Sign in to create a workspace';
  end if;

  if exists (select 1 from memberships where user_id = auth.uid() and status = 'active') then
    raise exception 'You already belong to a workspace';
  end if;

  if length(clean_name) = 0 or length(clean_name) > 100 then
    raise exception 'Business name must be between 1 and 100 characters';
  end if;

  insert into organizations (name) values (clean_name)
  returning id into new_org_id;

  insert into memberships (org_id, user_id, account_role, status, invited_email, accepted_at)
  values (new_org_id, auth.uid(), 'owner', 'active', lower(auth.email()), now());

  insert into locations (org_id, name)
  values (new_org_id, 'Main location');

  return new_org_id;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- Invite acceptance trigger: it trusted `invited_membership_id` from the new
-- user's metadata, which a public signUp() call can set to anything. Someone
-- who knew a membership id (any former manager could read them) could sign
-- up and take over that membership, including an owner's. Now it only
-- activates a still-pending invite addressed to the new user's own email.
-- ---------------------------------------------------------------------------

create or replace function handle_new_membership_user()
returns trigger as $$
begin
  update memberships
  set user_id = new.id, status = 'active', accepted_at = now()
  where id = (new.raw_user_meta_data->>'invited_membership_id')::uuid
    and status = 'invited'
    and user_id is null
    and lower(invited_email) = lower(new.email);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- memberships insert: a manager could insert a row for any user with any
-- role, including making themselves an active owner. The app never inserts
-- memberships directly (invites go through the invite-member Edge Function
-- under the service role), so the client policy is removed outright.
-- ---------------------------------------------------------------------------

drop policy if exists memberships_insert_manager on memberships;

-- ---------------------------------------------------------------------------
-- create_location(): the role and org checks used `<>`, which is NULL (not
-- true) when the caller has no membership, so they only held because a
-- later error happened to stop the call. Also fixes the crash when no
-- location is being copied (bug from 0008).
-- ---------------------------------------------------------------------------

create or replace function create_location(
  p_org_id uuid,
  p_name text,
  p_copy_settings_from uuid default null
)
returns uuid as $$
declare
  new_location_id uuid;
  source record;
  caller record;
begin
  select * into caller from current_membership();

  if caller.account_role is distinct from 'owner' then
    raise exception 'Only an owner can create a location';
  end if;

  if p_org_id is distinct from caller.org_id then
    raise exception 'Cannot create a location outside your organization';
  end if;

  -- Always run the lookup: with no match it still gives `source` its
  -- columns (all null). Skipping it, as 0008 did when nothing was copied,
  -- left `source` unassigned and the insert below failed.
  select * into source from locations where id = p_copy_settings_from and org_id = p_org_id;

  insert into locations (org_id, name, shift_types, shift_times, team_roles, week_starts_on, operating_hours, role_coverage)
  values (
    p_org_id,
    p_name,
    coalesce(source.shift_types, array['Open','Mid','Close']),
    coalesce(source.shift_times, '{}'::jsonb),
    coalesce(source.team_roles, array['Manager','Server','Host','Bartender','Cook']),
    coalesce(source.week_starts_on, ''),
    coalesce(source.operating_hours, '{}'::jsonb),
    coalesce(source.role_coverage, '{}'::jsonb)
  )
  returning id into new_location_id;

  return new_location_id;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- reassign_employee_home_location(): any member, staff included, could move
-- any employee in the org, and to a location in a different org. Now the
-- caller must be the owner, or a manager with access to both the old and
-- the new location, and the new location must be in the same org.
-- ---------------------------------------------------------------------------

create or replace function reassign_employee_home_location(p_employee_id uuid, p_new_location_id uuid)
returns void as $$
declare
  caller record;
  current_location uuid;
begin
  select * into caller from current_membership();

  select e.location_id into current_location
  from employees e
  where e.id = p_employee_id and e.org_id = caller.org_id;

  if current_location is null then
    raise exception 'Employee not found in your organization';
  end if;

  if not exists (select 1 from locations where id = p_new_location_id and org_id = caller.org_id) then
    raise exception 'Location not found in your organization';
  end if;

  if caller.account_role is distinct from 'owner' and not (
    caller.account_role = 'manager'
    and current_location in (select current_membership_locations())
    and p_new_location_id in (select current_membership_locations())
  ) then
    raise exception 'Not authorized to move this employee';
  end if;

  update employees set location_id = p_new_location_id where id = p_employee_id;

  -- A grant to the location that's now home is redundant — drop it so
  -- "shared with" listings don't show the employee's own home location.
  delete from employee_location_access
  where employee_id = p_employee_id and location_id = p_new_location_id;
end;
$$ language plpgsql security definer set search_path = public;

-- The mutating RPCs above need a signed-in caller; anonymous visitors have
-- no reason to reach them at all.
revoke execute on function create_organization(text) from public, anon;
revoke execute on function create_location(uuid, text, uuid) from public, anon;
revoke execute on function reassign_employee_home_location(uuid, uuid) from public, anon;
grant execute on function create_organization(text) to authenticated, service_role;
grant execute on function create_location(uuid, text, uuid) to authenticated, service_role;
grant execute on function reassign_employee_home_location(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- employee_location_access: the write policies never checked the org. Any
-- owner passed the role check for every org's rows, so they could grant or
-- revoke access for other businesses' employees and locations. Both the
-- employee and the location must now be in the caller's org, and a manager
-- must have access to the location.
-- ---------------------------------------------------------------------------

-- The caller's org's employee ids, read without RLS. Checking `employees`
-- directly from these policies would re-create the policy loop fixed at the
-- top of this file.
create or replace function current_org_employee_ids()
returns setof uuid as $$
  select id from employees where org_id = (select org_id from current_membership())
$$ language sql stable security definer set search_path = public;

drop policy if exists employee_location_access_insert on employee_location_access;
drop policy if exists employee_location_access_delete on employee_location_access;

create policy employee_location_access_insert on employee_location_access for insert
  with check (
    employee_id in (select current_org_employee_ids())
    and location_id in (select id from locations where org_id = (select org_id from current_membership()))
    and (
      (select account_role from current_membership()) = 'owner'
      or location_id in (select current_membership_locations())
    )
  );

create policy employee_location_access_delete on employee_location_access for delete
  using (
    employee_id in (select current_org_employee_ids())
    and location_id in (select id from locations where org_id = (select org_id from current_membership()))
    and (
      (select account_role from current_membership()) = 'owner'
      or location_id in (select current_membership_locations())
    )
  );

-- ---------------------------------------------------------------------------
-- membership_locations: same gap — "owner" of any org could grant a manager
-- in a different org access to locations. Both sides must now be in the
-- owner's own org.
-- ---------------------------------------------------------------------------

drop policy if exists membership_locations_insert on membership_locations;
drop policy if exists membership_locations_delete on membership_locations;

create policy membership_locations_insert on membership_locations for insert
  with check (
    (select account_role from current_membership()) = 'owner'
    and membership_id in (select id from memberships where org_id = (select org_id from current_membership()))
    and location_id in (select id from locations where org_id = (select org_id from current_membership()))
  );

create policy membership_locations_delete on membership_locations for delete
  using (
    (select account_role from current_membership()) = 'owner'
    and membership_id in (select id from memberships where org_id = (select org_id from current_membership()))
  );

-- ---------------------------------------------------------------------------
-- employees_update_self (0002) lets a staff member update every column of
-- their own roster row, so they could change their own roles, weekly cap,
-- status, or home location. 0002 anticipated this trigger: for anyone who
-- isn't an owner or manager, only contact and email can change.
-- ---------------------------------------------------------------------------

create or replace function protect_employee_self_update()
returns trigger as $$
declare
  next_contact text := new.contact;
  next_email text := new.email;
begin
  -- Service-role writes (Edge Functions) have no auth.uid().
  if auth.uid() is null or (select account_role from current_membership()) in ('owner', 'manager') then
    return new;
  end if;

  new := old;
  new.contact := next_contact;
  new.email := next_email;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists employees_protect_self_update on employees;

-- Named to sort before employees_set_updated_at, so updated_at is still
-- stamped after the revert.
create trigger employees_protect_self_update before update on employees
  for each row execute function protect_employee_self_update();
