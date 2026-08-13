# ShiftSizzle — UX & Product Backlog

Compiled from a code review + live click-through (desktop and mobile, 390px width) of the deployed app. Organized so quick fixes can ship independently of the larger scheduling rework.

Effort: **S** = hours, **M** = a day or two, **L** = multi-day/structural
Impact: **High / Medium / Low**

---

## P0 — Bugs to fix now (independent of any redesign)

These are correctness problems, not UX opinions — worth fixing before or alongside anything else.

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 1 | **Dashboard shows stale/wrong metrics after switching schedule role.** Confirmed live: switched active role from Manager → Bartender (which had 0 coverage targets, 0 shifts assigned), but Dashboard still showed "Assigned shifts: 18, Open shifts: 0" — the old Manager numbers, mislabeled as Bartender. A manager could believe a role is fully staffed when nothing has been planned. | S–M | High |
| 2 | **No autosave — in-progress work is lost on navigation.** Reproduced twice: entered coverage targets, navigated to Dashboard and back, targets reset to 0 and the generated draft was gone. Nothing persists until "Save draft" is explicitly clicked. | M | High |
| 3 | **Stale "Resuming saved schedule · last saved [time]" banner** doesn't clear when switching to a role/week that was never saved — shows a save timestamp from a different context. | S | Medium |

## P1 — Quick wins (current structure, low effort)

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 4 | **Add "apply to all days" / "copy Monday to weekdays" action for Coverage Targets.** Right now demand entry is 21 individual number fields (7 days × 3 shift types) with no bulk action. Highest-friction step in the flow, especially on mobile. | S | High |
| 5 | **Fix mobile Edit Employee modal overflow.** At 390px width, the modal's header visibly bleeds through background content on open, and the footer buttons (Update Employee / Cancel) sit at or past the viewport edge, colliding with the bottom tab bar. Needs a proper scrollable body with a sticky header/footer. | S–M | High |
| 6 | **Condense the workflow status copy.** The Scheduler currently derives ~12 separate explanatory strings (`heroSubhead`, `editingContextLine`, `weekSelectionNote`, `publishSummary`, `headerStatusSummary`, `workflowPublishDescription`, `resolvePhaseDescription`, etc.) to narrate state back to the user. Consolidate into one status source so there's a single place that explains "what's next," rather than several slightly-different sentences saying similar things in different spots. | M | Medium |

## P2 — Structural rework (large scale — the core ask)

This is the "open to large-scale updates" work. See the accompanying prototype for #7.

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 7 | **Unify scheduling around the week, not the role.** Today, a "schedule" = one role + one week, and switching roles mid-flow discards unsaved work with a warning dialog. Redesign so a manager opens one week once, and role becomes a filter/tab over a single shared canvas rather than a full restart of Setup → Resolve → Publish. | L | High |
| 8 | **Replace the hard 3-phase gate with a persistent checklist.** Keep the three phases as a mental model, but stop hard-blocking navigation between them. Show live status ("Demand set ✓ · Coverage complete (3 gaps) · Draft saved ✓") in one compact place instead of three self-narrating phase cards. | M–L | Medium |
| 9 | **Publish at the week level** (with optional per-role partial publish) instead of a mandatory separate publish cycle per role. | L | High |
| 10 | **Fix Dashboard metrics to aggregate across all roles** by default (falls out naturally once #7 is done), with a per-role breakdown available rather than the dashboard being scoped to whichever role was edited last. | M | High |

## P3 — AI features (the "AI scheduling tool" positioning)

Sequenced after or alongside P2, since several depend on the unified canvas to feel coherent.

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 11 | **Natural-language demand entry.** "Weeknights need 2, weekends need 3" parsed into the coverage grid, with the grid staying visible/editable as the source of truth. Directly replaces the worst mobile interaction (#4), so this is the highest-leverage AI feature for the mobile pitch specifically. | M | High |
| 12 | **Smarter auto-build.** Current "Generate draft" is a round-robin loop (fills whoever's next in array order, checks availability + shift cap only). Upgrade to fill worst gaps first, balance load fairly across the roster, and avoid obvious bad patterns (e.g., close-then-open). This is what makes "AI-powered" scheduling actually true. | M–L | High |
| 13 | **Swap / call-out assistant.** When someone can't work a shift, suggest ranked replacements from eligible, available, under-scheduled staff instead of manual grid scanning. | M | Medium |
| 14 | **Schedule narration.** Plain-language explanation of why a draft looks the way it does, or what changed since the last published version, generated from data already computed (coverage gaps, assignments). | S–M | Medium |
| 15 | **Technical dependency:** the app is currently 100% client-side (static React + localStorage, GitHub Pages). Any real LLM-backed feature needs a small backend/API layer to hold credentials and make model calls — plan this as its own workstream, not a UI task. | — | — |

## P4 — Polish / not yet verified

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 16 | Settings and CSV import/export held up fine on mobile in this pass — no action needed, noted for completeness. | — | — |
| 17 | Re-test the full mobile flow once #4–#7 land, since the modal and grid fixes will change a lot of the surrounding layout. | S | — |

---

**Suggested sequencing:** P0 first (bugs), P1 alongside or right after (cheap, high-impact), then P2 as the main project — with the weekly-canvas prototype validating the direction before committing engineering time to the full rebuild. P3 layers in once P2's data model (week-first, role-as-filter) exists to support it.
