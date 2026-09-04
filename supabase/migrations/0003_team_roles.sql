-- Team roles become one flat, fully editable list instead of "5 implicit
-- base roles + a custom-only list". The old additional_team_roles column is
-- kept for backward compatibility with older clients; new clients read and
-- write team_roles.

alter table organizations
  add column team_roles text[] not null
    default array['Manager', 'Server', 'Host', 'Bartender', 'Cook']::text[];

-- Backfill: every existing org keeps the previously-implicit base roles,
-- plus any custom roles it had already added (de-duplicated, base first).
update organizations o
set team_roles = base.roles || coalesce(
  array(
    select r
    from unnest(o.additional_team_roles) as r
    where r <> all (base.roles)
  ),
  array[]::text[]
)
from (select array['Manager', 'Server', 'Host', 'Bartender', 'Cook']::text[] as roles) base;
