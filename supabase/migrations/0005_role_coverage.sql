-- Coverage targets move out of the per-week flow and become a template
-- entered once in Settings: how many of each role a given day + shift needs.
-- Weekly schedule records still snapshot their own `requirements` for
-- history accuracy; this column is only the default those weeks seed from.
--
-- Shape: { "<role>": { "<day>": { "<shift label>": <count> }, ... }, ... }
--
-- Backfill runs client-side on first load (deriveCoverageFromSchedules):
-- the most recently touched saved record per role seeds that role's grid.

alter table organizations
  add column role_coverage jsonb not null default '{}'::jsonb;
