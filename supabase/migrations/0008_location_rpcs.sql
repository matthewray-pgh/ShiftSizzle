-- Two operations need service-role-style atomicity the same way
-- create_organization does — creating a location shouldn't be a bare insert
-- if it also needs to seed sensible defaults, and reassigning an employee's
-- home location has a side effect (dropping any now-redundant access grant
-- to that same location). See multi-location-data-model-spec.md.
--
-- create_location's cloned-column list matches the corrected `locations`
-- shape from 0007 (team_roles + shift_times), not the spec's original
-- additional_team_roles-only version.

create or replace function create_location(
  p_org_id uuid,
  p_name text,
  p_copy_settings_from uuid default null -- optional: another location_id to clone shift_types/shift_times/team_roles/operating_hours/coverage from
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
