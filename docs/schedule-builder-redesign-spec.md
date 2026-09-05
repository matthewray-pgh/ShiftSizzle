# Schedule builder redesign — implementation spec

Target: `src/Views/Scheduler/Scheduler.jsx` and `Scheduler.scss` in ShiftSizzle.
Goal: rebuild schedule creation/management for mobile-first use by a busy restaurant
manager. Every decision below optimizes for two things at once — fewest taps to a
correct schedule, and making errors structurally hard rather than relying on the
manager to catch them.

Status: **implemented**, and the page has since been **redesigned** (see the
"Page redesign" section below). All ten build-order steps are done (each marked ✅).
Test suite green except 7 pre-existing `Account` / `Team` failures unrelated to this
work. The staff-notification half of §6 (broadcast / notify-staff / approval queue /
Settings toggle) remains deliberately deferred, as does any call-out reason field or
reliability reporting.

---

## Page redesign

The step-by-step build left the page as a vertical stack of ~8 panels before the
first shift card. It was reworked into **one working surface** (canvas:
`docs/build-schedule-redesign/`):

- **First run** (`!weekStartsOn`): a single two-step setup card (pick the week-start
  weekday from chips, pick the first date) replaces the old Week panel + helper-text
  blocks. Once set, the page opens straight onto the current week.
- **Sticky action bar** replaces the page-header, the whole Week panel, and the
  Checklist panel: `‹ weekLabel ›` stepper (± 7 days) · `⋯` overflow (Manager notes,
  Reset week) on row 1; status pill · `X / Y filled · <syncLine>` · **Publish week**
  on row 2.
- **`getWeekChoices`** powers a "Jump to a week" sheet opened from the week label —
  last / this / next / +2 weeks plus any scheduled week, each with its saved status.
- **One control row**: role-filter chips + a `Day builder / Week overview` segmented
  toggle (was two stacked tab rows).
- Copy-last-week is a **full takeover** on a fresh week; Manager notes is a **sheet**
  from the overflow; the day builder / overview / candidate panel / call-out / copy
  conflict bodies are unchanged.
- `supabaseSync.fetchOrgBundle` now tolerates the `call_outs` table (migration 0006)
  being absent instead of dropping the app into offline mode.

**Deployment prerequisite:** migrations `0004_shift_times`, `0005_role_coverage`, and
`0006_call_outs` must be applied for shift times, the coverage-target template, and
call-outs to persist.

---

## 1. Navigation model: day-first, not role-first

**Problem with current build:** the existing `RoleSection` accordion pattern makes the
manager expand/collapse role sections to see anything, and requires typing numeric
coverage targets into a grid before any assignment can happen. This doesn't match how
a manager actually thinks ("what does Tuesday need") and is slow on a touch keyboard.

**Decision:** replace the role-accordion list with:
- A horizontally scrollable **day tab strip** (Sun–Sat) as the primary navigation.
  Each tab shows the day name + date, and a small dot indicator if that day still has
  unfilled slots (for the current role filter — see §2).
- Below the tabs, a **stack of shift cards for the selected day only** (not all days
  at once). Each card = one shift type for the active role, showing `filled of needed`,
  assigned-employee chips, and an add affordance if not full.
- **Coverage targets move out of the weekly flow into Settings.** A shift type is
  defined once as three parts:
  - a **label** — required, and the identity key the rest of the app joins on
    (`"Open"`, `"Mid"`, `"Close"`, …);
  - an **optional time range** — start/end. When set, cards and summaries read
    "Server · 11a–4p"; when unset they read "Server · Mid", exactly as today. Nothing
    downstream depends on a time being present.
  - a **per-role headcount** — how many of each role that shift needs, entered once in
    Settings (with the existing "apply to all days" affordance), not retyped per week.
- The weekly canvas **reads** targets from that template. The manager's weekly work is
  assignment only.
- Saved/published schedule records still **snapshot** the targets that were in effect
  when they were saved, so History stays accurate if the template changes later.

## 2. Role filter

**Problem it solves:** a manager who only wants to sort out Servers today shouldn't have
to see Cook and Host cards on every day.

**Decision:** a role filter row ("All", "Server", "Cook", "Host", …, driven by
`settings.teamRoles`) sits above the day tabs.
- Selecting a role **removes** non-matching shift cards entirely (not just greys them
  out) from every day.
- The day-tab "unfilled" dot, and any progress/count figures, recalculate against the
  filtered role only.
- Auto-fill (if retained from the old `AUTO_BUILD_SCHEDULE` action) only acts on
  shifts matching the active filter.
- This state also feeds the publish flow (§4) and the coverage grid (§3).

## 3. Week coverage overview (toggle view)

**Problem it solves:** the day-first view is good for editing one day, bad for
confirming the whole week looks right before publishing. These are different jobs.

**Decision:** add a segmented control at the top of the Scheduler view:
**"Week overview" / "Day builder"**.

- **Week overview**: a grid, days across the top (7 columns), roles down the side
  (respecting the active role filter — if filtered to one role, show that role's rows,
  or its individual shift types, at larger cell size).
  - Each cell shows `filled/needed` and is colored by a **three-state status**, not two:
    - Full (`filled >= needed`) — success color
    - Partial (`0 < filled < needed`) — warning color
    - None assigned (`filled === 0`) — danger color, distinct from partial. This
      distinction matters: a shift with zero coverage is a materially worse problem
      than one short person, and collapsing them into one "not done" state hides that.
  - A small legend (Full / Partial / None) sits below the grid.
- **Tapping a cell**:
  - If the cell has a gap (partial or none), jump directly into the Day builder for
    that day, with the role filter set to match, **and the add-candidate panel already
    open on the first unfilled shift of that role** — skip the intermediate summary
    card and the "+Add" tap, since the manager already signaled exactly what they're
    fixing by tapping that cell.
  - If the cell is already full, jump into the Day builder showing that shift's card
    normally (who's on it), with nothing auto-opened — there's nothing to fix.
- Publish (§4) is reachable from the Week overview as well as the Day builder, since
  overview is the natural place to make the final call.

## 4. Publish flow — adaptive confirmation

**Problem it solves:** a confirmation dialog shown on every publish tap regardless of
completeness is friction with no payoff most weeks. But publishing a half-built
schedule, or accidentally publishing only a filtered role when the whole week was
meant, are real error modes worth catching.

**Decision:** publish behavior branches on state, not on a fixed dialog:

- **Fully filled + no role filter active** → publish is instant on tap. No modal.
  Feedback is an **undo toast ("Published · Undo")** for ~6 seconds, not a confirmation
  before the fact. Treat the mistake as cheap to reverse rather than making the common,
  correct path slower.
  - **Undo reverts the just-published role records to draft** (restoring each record's
    prior `publishedAt`); nothing else is touched.
  - **Notification retraction is out of scope this pass** — until staff notifications
    exist (§6, deferred) there is nothing to retract, and the toast copy stays
    "Published · Undo" with no recipient count.
- **Open shifts exist, OR a role filter is active at publish time** → show a
  confirmation sheet:
  - Summary line: "`X` of `Y` shifts filled. `Z` won't have anyone assigned if
    published now."
  - A per-role toggle list. **Defaults matter and should reflect intent, not start
    uniformly on**:
    - If a role filter was active, only that role is pre-selected.
    - If viewing "All roles", complete roles are pre-selected and incomplete roles are
      pre-*deselected* (held back) automatically — the manager isn't hunting for what
      to exclude, the app already knows.
  - Every toggle stays manually overridable (a manager can still force-publish an
    incomplete role).
  - Two actions: "Go back and fix" (default framing, not destructive-styled) and
    "Publish selected" (primary, disabled if nothing is selected). "Publish selected"
    also shows the "Published · Undo" toast.
  - Toggling a role off means it's held back in draft state — see §5 for how that
    surfaces afterward.

## 5. Autosave + draft-status badge (no explicit "save draft" action)

**Problem it solves:** an explicit "Save draft" button is itself a failure point in a
hectic environment — it only protects work if the manager remembers to tap it before
getting pulled away, which is exactly the scenario to design against.

**Decision:**
- **No save button.** Every assignment/removal/call-out action autosaves immediately;
  there is no unsaved intermediate state to lose. This matches the existing
  `hasUnsavedChanges` / autosave plumbing already in `AppState` — extend it, don't
  replace it with a manual action.
- A small passive status line: **"Saved" / "Saving…" / "Saved locally · will sync" /
  "Save failed — retrying"** — informational only, never a control the manager must
  operate.
- **Offline safety is a local write-through cache, not an offline-first queue.**
  `schedules` / `settings` / `employees` are mirrored to `localStorage` (keyed by org)
  on every change. On load, if the server fetch fails, hydrate from the mirror and show
  "Saved locally · will sync". Pending writes reflush on the browser `online` event and
  on the next edit. Full offline-first conflict resolution against Supabase Realtime is
  explicitly out of scope.
  - **Time-boxed fallback:** if the cache can't land in this pass, drop the "· will
    sync" wording and show only "Saved" / "Saving…" / "Save failed — retrying". Do not
    claim local persistence that isn't there.
- **Draft/incomplete reminder badge**: a numeric badge on the Schedule nav item,
  counting **distinct unresolved items** (e.g. "Host not published for Sep 1–7" is one
  item, regardless of how many shifts that represents) — not raw open-shift counts,
  which would produce a large, less meaningful number. Copy-last-week conflicts (§7)
  feed this same count.
- A dashboard-level reminder card (visible outside the Scheduler view entirely) states
  what's outstanding and includes a "Resume schedule" action that **deep-links straight
  to the specific day/role that needs attention** — not just "back to Scheduler."
  (Deep-link params are already parsed in `Scheduler.jsx`; extend them.)
- Explicitly rejected: escalating the badge's urgency (color changes, size increases)
  as the week start date approaches. A static count is a nudge; an escalating one reads
  as the app being anxious on the manager's behalf, which adds stress rather than
  reducing it. Keep it a single, calm number.

## 6. Call-out and shift-swap handling

**Problem it solves:** a call-out is not the same as an unfilled slot — it was covered
and now isn't, usually on short notice. Treating it identically to a plain gap hides
its urgency, and manually re-checking availability for a replacement is slow under
pressure.

### This pass

- Tapping an assigned person's chip opens a small inline action menu: **"Mark called
  out"** and **"Remove"**. These are distinct actions — "called out" preserves the
  event, "remove" is a plain undo of an assignment.
  - **What "preserves the event" means concretely:** the moment "Mark called out" is
    tapped, log a minimal durable record — `employeeId`, `shiftId` (role + day + shift
    label), `day`, `timestamp`, `resolvedVia` (`manual` | `broadcast` | null while
    unresolved), `coveredBy` (`employeeId` or null). No new screen, just a record
    alongside the assignment data, synced the same way as schedule records.
  - **No reason field in the moment.** Do not block the manager on entering a reason
    before they can move to finding coverage. If a reason is wanted, it's an optional
    field addable afterward, never a gate.
  - **No reporting UI in this pass.** Employee-level call-out history/reliability views
    are out of scope — the only commitment is that the event is captured so that
    feature can be built later without a data migration.
  - **The "needs coverage" flag is derived from this record, not a separate boolean** —
    a shift shows as needing coverage because an unresolved call-out event exists for
    it (`coveredBy` still null), not because something else set a flag that could drift.
- Marking someone called out immediately flags the shift with a **distinct "needs
  coverage" state** — separate visual treatment from a shift that was simply never
  filled (e.g. a flame/alert icon plus explicit "`Name` called out" text), so it reads
  as more urgent at a glance, including in the Week overview grid.
- **Find replacement** — reachable directly from the flagged shift; opens the same
  candidate list used elsewhere in the builder (role-matched, availability-checked,
  conflict-checked against same-day double-booking). The manager taps a name to assign
  directly; that sets `coveredBy` and clears the flag. Fully manager-driven — needs no
  notification infrastructure.

### Deferred (TODO — requires a staff-notification delivery system)

None of the below is built in this pass; it is captured here so the data model above
doesn't need migrating when it lands.

- **Notify available staff** — broadcast to the eligible pool (role match, not off that
  day, not already scheduled elsewhere that day) with a recipient preview before
  sending, and an inline **Accept** action in the notification itself.
- **First-accept-wins** vs. an **approval-queue** mode, switched by a per-account
  Settings toggle "Require manager approval for shift coverage" (**default off**). Off:
  first acceptor fills the slot, manager gets an after-the-fact "Jake accepted" notice
  (same undo-not-confirm pattern as §4), late acceptors get "Already covered." On:
  acceptors queue as **pending responses**; manager taps **Approve** on one, which
  auto-declines the rest; the staff member sees a neutral "Request sent" state
  throughout.
- **Auto-cancel:** manually assigning a replacement while a broadcast is pending cancels
  the broadcast and quietly notifies anyone still pending that the shift is covered.
- **No hard timeout** in either mode — an unresolved shift just stays flagged "needs
  coverage", with the manual path always available.
- This is the same underlying mechanism as a future shift-swap-between-employees flow
  and should be speced together with it.

## 7. Copy-last-week starting point and conflict surfacing

**Problem it solves:** week-to-week reality changes — availability shifts, people
leave — so copying last week's assignments verbatim without re-checking them would
silently carry forward invalid schedules.

**Decision:**
- A new, not-yet-configured week presents two entry points: **"Copy last week"** and
  **"Start fresh."** No default is forced; both are equally one tap.
- **"Last week" resolution:** the immediately prior schedule week. If that week has no
  saved records, offer the most recent week that does. If no scheduled week exists at
  all, hide "Copy last week" and show only "Start fresh".
- **Copy last week** duplicates the prior week's assignments as the starting draft,
  then immediately re-validates every copied assignment against *current* data —
  availability, employment status, and role — not the state that was true when the
  original assignment was made. This re-check is the entire point of the feature.
- **Coverage targets always come from the current Settings template (§1)**, never
  copied. A change to a shift type's time or headcount between weeks is therefore **not
  a conflict** — the copied draft simply reflects today's targets. Only availability,
  status, and role flag anything.
- Two distinct conflict types, handled differently:
  - **Soft conflict** (e.g. now marked off that day) — genuinely could be stale data,
    so the manager gets both **Replace** and **Keep anyway**. Choosing "Keep anyway"
    resolves the conflict without changing the assignment.
  - **Hard conflict** (archived/inactive employee, or role no longer held — checked
    against `employee.roles`, so an employee who still holds the role is fine even if
    they were assigned under a different shift) — not a judgment call, so only
    **Replace** is offered.
  - A flagged assignment **stays visible** with its conflict reason shown inline
    (e.g. "Maria Chen · Now off Tuesdays") rather than being silently dropped.
  - **Replace skips the summary step**, same as the coverage-grid direct-to-assign
    behavior in §3 — tapping it opens the candidate list immediately.
- **Interruption scales to severity, not to the fact that a copy happened:**
  - Zero conflicts → no summary, no modal — just the quiet "Copied from last week"
    tag, and the manager proceeds straight into editing.
  - Conflicts exist → a single non-blocking summary line ("Copied last week · N
    conflicts to review") that can be acted on immediately or left for later.
- **Conflicts feed the existing draft-status badge (§5), not a separate reminder
  system.** An unresolved copy conflict is exactly the kind of "distinct unresolved
  item" that badge already counts.

## Design principles to preserve during implementation

These aren't features, they're constraints that should shape any further additions to
this flow:
1. Every action should either be the fastest correct path, or should only add a step
   when there's a genuine decision to make (see §4's branching logic as the model).
2. Never require the manager to remember to save, confirm, or revisit something purely
   because the UI didn't tell them it needed attention (see §5).
3. Distinguish severity where it's real (three-state coverage color in §3, call-out vs.
   plain gap in §6) rather than collapsing everything into a binary done/not-done.

---

## Implementation notes — data model & sequencing

### New / changed state shapes

- **`settings.shiftTimes: { [label]: { startTime?, endTime? } }`** — additive, every
  field optional. Absent ⇒ current label-only behavior. `settings.shiftTypes` stays
  `string[]` and remains the join key for `availability`, `roleRequirements`,
  `assignments`, and the Supabase columns — **no migration**. New `getShiftTime(settings,
  label)` helper for rendering; `getShiftTypes()` unchanged.
- **`settings.roleCoverage: { [role]: { [day]: { [label]: number } } }`** — the
  once-entered headcount template. `hydrateScheduleForWeek` seeds
  `schedule.roleRequirements` from this instead of from typed weekly input.
  `UPDATE_REQUIREMENTS` / `APPLY_REQUIREMENTS_TO_ALL_DAYS` move to operate on this
  template (surfaced in Settings), not on the live week. Saved records keep snapshotting
  their own `requirements` for History. Migration: on first load without `roleCoverage`,
  derive it from the most recent saved record per role, else leave zeroed.
- **Call-out records** — new collection alongside schedule data, synced like
  `schedule_records`. Fields per §6. `resolvedVia` / `coveredBy` drive the derived
  "needs coverage" state.
- **`state.syncStatus: 'saving' | 'saved' | 'offline' | 'error'`** + a `localStorage`
  write-through mirror keyed by org. Sync helpers in `supabaseSync.js` currently
  fire-and-forget; they need to resolve/reject back into this status.
- **Publish undo** — no persistent state. The Scheduler component snapshots the
  affected records' `{ id, status, publishedAt, savedAt }` before dispatching
  `PUBLISH_SCHEDULE`, holds them for the toast window, and dispatches a new
  `UNDO_PUBLISH` action that restores them.

### Suggested build order

1. ✅ `shiftTimes` — isolated, additive; card/summary rendering.
2. ✅ Week overview grid (§3) + three-state color (`computeWeekGrid` / `coverageStatus`).
3. ✅ `roleCoverage` template + Settings editor; `hydrateScheduleForWeek` seeds per role
   (saved snapshot ?? template), one-time client backfill from saved history.
4. ✅ Day builder (§1) — day tab strip + per-day shift cards + `CandidatePanel`
   (`computeDayCards` / `getEligibleCandidates` / `getWeekDayDates`). Replaced
   `RoleSection`; per-week requirement editing is gone. `RESET_WEEK_DRAFT` now re-seeds
   requirements from the template instead of zeroing them. Day-tab gap dots + the
   overview cell → candidate-panel auto-open (§2/§3) landed here too.
5. ✅ Role filter wiring into publish defaults (§2/§4) — folded into step 6.
6. ✅ Adaptive publish + undo (§4). `PUBLISH_SCHEDULE` takes an optional `roles` list:
   with it, the §4 sheet's selected roles publish and the rest are (re)written as
   held-back drafts; without it, the instant path still requires a fully-covered week.
   New `UNDO_PUBLISH` restores the exact pre-publish records (captured by the
   Scheduler for its 6s "Published · Undo" toast). Known gap: a record *created* by a
   publish and then undone is dropped locally but not deleted from Supabase (rare —
   autosave almost always creates the draft record first).
7. ✅ Sync status line + localStorage mirror (§5). Sync writers in `supabaseSync.js`
   now resolve to their error; `AppStateProvider` tracks a transient `syncStatus`
   (`saved`/`saving`/`offline`/`error`), write-through-mirrors the bundle to
   `localStorage` per org, hydrates from the mirror when `fetchOrgBundle` rejects, and
   retries the full bundle on the browser `online` event. Scheduler shows the passive
   line: "Saving… / Saved / Saved locally · will sync / Save failed — retrying".
   ("Save draft" button kept for now; removing it per §5 is a step-10 cleanup.)
8. ✅ Draft badge + dashboard resume card (§5). New `getUnresolvedScheduleItems`
   selector: one entry per (week, role) whose saved record is unpublished or
   short-staffed, fully-past weeks dropped. Layout renders a calm static count on the
   Schedule nav item (no escalation); Dashboard shows a "Finish your schedule" card
   grouped by week with a "Resume schedule" link deep-linking to
   `/schedule/build?weekStart=…&role=…&day=…` (Scheduler now consumes the `day` param).
   `renderView` test harness wrapped in `MemoryRouter` for the new `<Link>`.
9. ✅ Copy last week (§7). `COPY_LAST_WEEK` seeds this week's assignments from the most
   recent earlier saved week and validates each against current data — hard conflict
   (archived / role no longer held), soft conflict (now off that day) — keeping the
   flagged assignment on the canvas. `schedule.copyConflicts` + `copiedFrom` are
   transient canvas state (cleared on week switch); `getLiveCopyConflicts` is what's
   still outstanding. `RESOLVE_COPY_CONFLICT` = "Keep anyway". Scheduler shows the
   "Copy last week / Start fresh" prompt on an untouched week, a "Copied … · N
   conflicts to review" banner, and per-chip Replace / Keep-anyway. Hard conflicts
   also reach the §8 badge via the existing open-slots path (an archived person on a
   shift reads as unstaffed); soft conflicts are surfaced in-view only this pass —
   no separate notification system, per §7. A fully-deleted (not archived) employee's
   copied assignment is dropped in normalization rather than flagged.
10. ✅ Call-out record + "needs coverage" state + Find replacement (§6, this-pass scope).
    New `call_outs` table (migration `0006`) + `supabaseSync` mapping / fetch / upsert /
    realtime; `state.callOuts` hydrated, synced, mirrored, merged. `MARK_CALLED_OUT`
    logs a durable row AND clears the assignment (slot reads as genuinely open);
    `RESOLVE_CALL_OUT` (fired by the Scheduler when a replacement is assigned) sets
    `coveredBy` + `resolvedVia: 'manual'`, keeping the row for history. "Needs coverage"
    is derived from an unresolved row — `computeDayCards` exposes `calledOut`,
    `computeWeekGrid` exposes `needsCoverage`. Scheduler: chip "⋯" menu → "Mark called
    out" / "Remove"; a flagged card shows "🔥 Name called out — needs coverage" + a
    "Find replacement" button (the candidate panel), and the overview cell gets a flame
    marker. Deferred, unchanged: notify-staff broadcast, first-accept-wins, approval
    queue, the Settings toggle, any reason field or reliability reporting. Dead
    `RoleSection` / requirements-grid / employee-grid CSS removed from `Scheduler.scss`.
