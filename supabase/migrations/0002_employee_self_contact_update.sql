-- Lets a logged-in user who is linked to a roster row (memberships.employee_id)
-- self-edit that row's contact/email from the Account page, the same way
-- employee_availability already lets staff self-edit only their own
-- availability row. Row-scoped only (not column-scoped) — Postgres RLS
-- can't restrict by column, so this technically permits updating any column
-- on your own linked row, not just contact/email. The client only ever
-- submits contact/email changes for self-edits; add a BEFORE UPDATE trigger
-- reverting protected columns (name/title/roles/status/shifts_per_week) for
-- non-manager updaters if harder enforcement is ever needed.
--
-- OR'd with the existing owner/manager employees_update policy, so this
-- only adds capability.

create policy employees_update_self on employees for update
  using (
    org_id = (select org_id from current_membership())
    and id = (select employee_id from current_membership())
  )
  with check (org_id = (select org_id from current_membership()));
