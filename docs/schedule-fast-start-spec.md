# Schedule fast-start — implementation spec

Goal: cut clicks-to-first-published-schedule from ~100–150 (cold, no guidance,
dead ends) to ~10–15 with a guided flow, and ~5–7 when the AI path is
deployed. Follows the schedule-builder redesign (`schedule-builder-redesign-spec.md`).

Status: **Phases 1–3 implemented.** Full suite at the pre-existing baseline
(7 unrelated `Account`/`Team` failures); +25 new tests. The two Edge
Functions are written to the `scan-employee` pattern but **not deployed** —
every AI entry point degrades to the built-in path until they are.

---

## What a schedule requires (the dependency chain)

`computeDayCards` / `calculateScheduleReview` / `AUTO_BUILD_SCHEDULE` all need:

| Input | New-org default | Blocks, if unset |
|---|---|---|
| `settings.weekStartsOn` | `""` | Scheduler shows only `FirstRunSetup` |
| `settings.operatingHours` | all 7 days closed, blank | no open days → nothing to staff |
| `settings.shiftTypes` | `Open / Mid / Close` | fine out of the box |
| `settings.teamRoles` | 5 defaults | fine, usually wrong for the business |
| `settings.roleCoverage` | **all zeros** | "No coverage targets", auto-fill disabled, no publish signal |
| `employees` + availability | `[]` | no one to assign; auto-fill disabled |

The two real blockers — `operatingHours` and `roleCoverage` — were also the
most tedious things to enter (7-day hours with no bulk fill; a 5×7×3 coverage
grid behind a role `<select>`), and nothing guided the order
(`normalizeRequirements` zeroes closed days, so coverage entered before hours
came out empty).

---

## Phase 1 — templates + bulk hours (client-only)

- **`src/state/setupTemplates.js`** — 5 business-type starters
  (`full-service-restaurant`, `cafe`, `bar`, `quick-service`, `retail`). Each
  compact def (shift labels + optional times, roles, weekday/weekend hours +
  closed days, per-(role, shift) headcount) expands via
  `settingsFromTemplate(id, { currentSettings, weekStartsOn })` into a full
  `UPDATE_SETTINGS` payload — same shape the reducer already normalizes and
  re-seeds the live week from. `weekStartsOn` is only filled when unset, so
  re-applying never moves an established week boundary.
- **Business Hours "Apply to all days"** in Settings — mirrors the Coverage
  Targets affordance; copies one day's `{isOpen, openTime, closeTime}` to all
  seven. Button carries `aria-label="Apply <Day> hours to all days"`.

## Phase 2 — setup wizard (client-only)

- **`src/Views/Setup/SetupWizard.jsx`** at **`/setup`** (owner/manager). Steps:
  1. **Business type** + week-start day → commits `settingsFromTemplate` and
     `SELECT_WEEK` on the current week (so the silent autosave has a real week
     to write, not `""`).
  2. **Confirm hours** — compact editable list, per-row "apply to all".
  3. **Confirm coverage** — role-scoped grid, per-day "apply to all".
  4. **Add team** — name + role chips; availability defaults fully-open;
     "Skip for now" allowed.
  5. **Build** — summary, then **Build my first week** (auto-fills every role
     with targets via `AUTO_BUILD_SCHEDULE`, routes to `/schedule/build`) or
     **Open the builder**.
- **Entry points:** a "Start from your business type" CTA on the Scheduler
  first-run screen; a **"Finish setting up"** checklist card on the manager
  Dashboard tracking the four gaps (week / hours / coverage / team), shown
  until all are satisfied, linking to `/setup`.

## Phase 3 — AI assist (Edge Functions + graceful fallback)

Both functions follow `scan-employee`: CORS, bearer → `auth.getUser`,
membership must be `owner`/`manager`, `anthropic.messages.parse` with a
`json_schema` output. Client wrappers in **`src/state/aiAssist.js`** return
`{ error: AI_UNAVAILABLE }` on a missing/unreachable function so callers fall
back silently.

- **`supabase/functions/setup-assistant`** — `{ description }` → `{ setup }`
  (shift types + times, roles, 7-day hours, per-(role, shift) coverage,
  optional week start, summary). `aiSetupToSettingsPayload` maps it to the
  Phase-1 settings-payload shape; bad/partial output → a review-me error, not
  a broken save.
  - Wizard step 1 has a **"Describe it instead"** toggle: textarea →
    `requestAiSetup` → `UPDATE_SETTINGS` + jump to the hours step with the
    model's summary as the hint. `AI_UNAVAILABLE` silently reverts to the
    template picker for the rest of the session.
- **`supabase/functions/build-schedule`** — one role's `{ days, shift_types,
  employees (with availability + caps), requirements, existing_assignments,
  last_week }` → `{ assignments: [{employee_id, day, shift}], notes }`.
  Client re-validates every pick.
  - New reducer action **`APPLY_ROLE_ASSIGNMENTS`** `{ role, picks }` —
    replaces one role's bucket with the validated picks (availability, the
    cross-role weekly cap, no same-day double-book, no dupes, open days
    only). A bad draft can only under-fill, never mis-schedule.
  - Scheduler day panel gains an **"AI draft"** button beside Auto-fill:
    loops the visible roles, `requestAiSchedule` → `APPLY_ROLE_ASSIGNMENTS`.
    `AI_UNAVAILABLE` → runs the built-in `AUTO_BUILD_SCHEDULE` and notes it.

### Deployment prerequisite

`supabase functions deploy setup-assistant build-schedule` and set
`ANTHROPIC_API_KEY` (same secret `scan-employee` uses). Until then the
"Describe it instead" toggle disappears after one try and "AI draft" falls
through to auto-fill — nothing breaks.

---

## Clicks to first schedule

| | Interactions |
|---|---|
| Before | ~90–150 |
| Wizard + templates | ~10–15 |
| + AI setup + AI build | ~5–7 |

## Not done / deferred

- Import a schedule from a photo/spreadsheet (extend `scan-employee`'s approach).
- Natural-language schedule edits.
- AI-ranked call-out replacement (candidate list ordering).
- Replacing the deterministic `buildAssignments` round-robin entirely — kept
  as the always-available fallback.
