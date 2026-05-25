# ShiftSizzle Frontend Page Requirements

This document defines the intended job, required content, and out-of-scope concerns for each top-level frontend page in the MVP. The goal is to keep each screen focused on one clear responsibility so the navigation and workflow feel obvious.

## Product Shape For MVP

ShiftSizzle is currently a manager-first scheduling product. The frontend MVP should support one primary operating loop:

1. Maintain the roster and staffing constraints.
2. Build a weekly schedule.
3. Review and publish the schedule.
4. Review the published schedule in a cleaner read-only view.

Until employee login exists, the app should optimize for manager workflows and avoid creating parallel pages that answer the same question.

## Dashboard

### Core Job

Answer: what needs attention right now?

### Must Display

- Current week and active scheduling role context.
- Draft or published schedule state.
- High-level operational metrics: active employees, assigned shifts, open shifts.
- One clear action-oriented summary of the current week.
- Latest publish state or schedule status.
- Manager notes or operational context if they help explain the current week.

### Should Emphasize

- Attention and triage.
- What is incomplete.
- What changed recently.
- Where the manager should go next.

### Should Not Become

- A second scheduler.
- A detailed roster management page.
- A detailed assignment inspection page.

### UX Notes

- The primary call to action should point toward the next operational task.
- The page should read in under 10 seconds.
- Metrics should support decisions, not just decorate the screen.

## Team

### Core Job

Answer: who can be scheduled, and under what constraints?

### Must Display

- Search and filters for roster management.
- Active and archived employee states.
- Add, edit, archive, and reactivate actions.
- Employee role, title, contact basics, and availability.
- Shifts-per-week limit.
- Import and export tools for roster management.

### Should Emphasize

- Roster maintenance.
- Availability and staffing constraints.
- Data quality and onboarding for the roster.

### Should Not Become

- A weekly scheduling page.
- A place to resolve coverage gaps.
- A second settings page for business-wide rules.

### UX Notes

- Team owns staffing inputs, not scheduling outcomes.
- Availability editing should feel fast and obvious.
- Import flows should be safe, previewable, and easy to undo later when backend support exists.

## Scheduler

### Core Job

Answer: how do I build and publish this week’s schedule?

### Must Display

- Week context and selected role.
- Current schedule state: draft or published.
- Coverage requirements by day and shift.
- Eligible employees for the selected role.
- Manual assignment controls that respect availability and shifts-per-week limits.
- Coverage gaps and publish blockers.
- Schedule notes.
- Save draft action before publish.
- Publish action with clear readiness or blocking feedback.
- Last saved timestamp once a draft has been explicitly saved.
- Last published timestamp once a schedule has been published.

### Should Emphasize

- One top-to-bottom planning workflow.
- Setup, assign, review, publish.
- Clear blocking states and next actions.

### Should Not Become

- A dashboard.
- A reporting page full of secondary visualizations.
- A long-term historical archive until week navigation exists.

### UX Notes

- The page should read as a sequence of steps, not a control panel of unrelated widgets.
- Coverage gaps and publish blockers should be visible without scrolling deeply into the page.
- Auto-build is a helper, not the product. Managers must still understand the resulting schedule.
- Draft progress can autosave locally, but the publish workflow should still require an explicit draft save checkpoint.
- Visualizations are temporarily out of scope for MVP until the core workflow is clearer.

## Shifts

### Core Job

Answer: what is the schedule people should actually use?

### Must Display

- Current viewed week.
- Draft versus published state.
- Clean read-only schedule output.
- Assigned employees and their shifts.
- Enough filtering or grouping to review the published plan quickly.

### Should Emphasize

- Consumption of the schedule.
- Clarity and readability.
- Separation from the authoring workflow in Scheduler.

### Should Not Become

- A second assignment editor.
- A duplicate of Scheduler with fewer controls.
- A generic data dump of state.

### UX Notes

- This page only earns its place if it is simpler and more readable than Scheduler.
- If employee-facing access is added later, this page can become the basis for a team-facing schedule view.
- Until week history exists, the page should stay focused on the active week.

## Settings

### Core Job

Answer: what business rules shape the rest of the app?

### Must Display

- Workspace identity basics.
- Shift types.
- Team roles.
- Operating hours.
- Scheduling defaults when they directly affect planning.

### Should Emphasize

- Shared configuration.
- Inputs that materially affect Team and Scheduler behavior.

### Should Not Become

- A profile page.
- A backend admin panel.
- A dumping ground for unrelated preferences.

### UX Notes

- Settings should feel upstream from scheduling.
- Changes here should have clear downstream effects in Team and Scheduler.
- Save patterns should remain consistent across sections.

## Cross-Page Guardrails

- Each page should have a single primary question it answers.
- No page should compete with Scheduler for schedule authoring responsibility.
- No page should compete with Shifts for read-only schedule review responsibility.
- Dashboard should summarize the week, not replicate the week.

## MVP Navigation Test

The navigation is working if a manager can answer these questions without confusion:

- Dashboard: what needs attention?
- Team: who can work?
- Scheduler: how do I build and publish the week?
- Shifts: what schedule is the team supposed to follow?
- Settings: what rules shape staffing and scheduling?

## Future Requirements (Post-MVP)

- Team members can hold multiple roles instead of exactly one role.
- Scheduler detects assignment conflicts and surfaces clear warnings before publish.
- Conflict detection should include at least overlapping assignments and role-mismatch assignments.

### Multi-Role Team Member Rules

- Employee records should store roles as a collection, not a single value.
- Team add and edit flows should allow selecting multiple roles per employee.
- Scheduler role filters should include employees if they have the selected role in their role collection.
- Import and export should support multiple roles in a deterministic format so round-tripping does not lose role data.

### Availability Exception Rules (Date-Specific Time Off)

- Employee availability model should support recurring weekly availability plus date-specific exceptions.
- A date-specific exception overrides recurring availability for that employee on that date.
- Managers should be able to add, edit, and remove exceptions with date, shift or time window, and reason.
- Exceptions should support at least two states: pending request and approved time off.
- Approved time off should be treated as unavailable in Scheduler.
- Pending requests should be visible in Scheduler before assignment decisions.
- Import and export formats should preserve date-specific exceptions once backend persistence is introduced.

### Scheduling Conflict Rules (Post-MVP)

- Conflict detection runs on draft save and before publish.
- Each conflict should include employee, day, shift or time context, and conflict type.
- Scheduler should show a conflict summary count and provide direct navigation to impacted assignments.
- Conflict detection should evaluate both recurring availability and date-specific availability exceptions.

### Publish Severity Matrix

- Hard blocker: employee is assigned to overlapping shifts or time windows.
- Hard blocker: employee is assigned to a role they do not hold.
- Hard blocker: employee is assigned on a date with approved time-off exception for that shift or time window.
- Warning: employee is assigned outside stated availability.
- Warning: employee is assigned where a pending time-off request exists.
- Warning: employee exceeds preferred shifts per week target.
- Publish is disabled while any hard blockers exist.
- Warnings do not block publish, but publish confirms acknowledgment of warning count.

### UX Acceptance Criteria

- Conflict status should be visible in the Scheduler workflow checkpoint rail.
- Blockers and warnings should use distinct iconography and labels, not color only.
- The publish section should state one of three states: Ready, Ready with warnings, or Blocked by conflicts.
- If no conflicts exist, scheduler shows an explicit no-conflicts confirmation state.
- Assignment rows should clearly indicate when a conflict is caused by a date-specific availability exception.
