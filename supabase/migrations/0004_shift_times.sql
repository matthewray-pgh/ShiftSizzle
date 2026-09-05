-- Shift types can carry an optional time range (start/end). The label stays
-- the identity key everywhere (availability, requirements, assignments); the
-- time is display-only metadata, keyed by that label. An org with no times
-- set behaves exactly as before — cards and summaries show the label alone.
--
-- Shape: { "<label>": { "startTime": "HH:MM", "endTime": "HH:MM" }, ... }
-- Every field is optional; a missing label or missing field means "no time".

alter table organizations
  add column shift_times jsonb not null default '{}'::jsonb;
