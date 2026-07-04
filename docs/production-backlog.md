# ShiftSizzle Production Backlog

This file is the working source of truth for getting ShiftSizzle from a client-side MVP to a production-ready application. It is intended to be edited directly in the repo as priorities, scope, and completion status change.

## How To Use This File

- Change the checkbox state as work is completed.
- Add owners, dates, and notes inline as decisions are made.
- Keep sections ordered by shipping priority, not by idea count.
- Treat anything in `Release Blockers` as required before production launch.

## Current State Summary

- Frontend Vite + React application with shared local state persistence.
- Core views exist for dashboard, team, scheduler, history, and settings. (The former "Shifts" view was replaced by History, which lists all schedules — draft and published — instead of published-only content.)
- No backend, authentication, database, deployment pipeline, or production monitoring yet.

## Release Blockers

### 1. Product Foundation

- [ ] Finalize MVP scope for v1 production launch. [Owner: Product] [Phase: Phase 1]
- [ ] Define supported user roles for v1: manager only, or manager + employee. [Owner: Product] [Phase: Phase 1]
- [ ] Define required schedule lifecycle states: draft, published, acknowledged, archived. [Owner: Product] [Phase: Phase 1]
- [ ] Define business rules for scheduling conflicts, overtime, and availability. [Owner: Product + Scheduling Eng] [Phase: Phase 1]
- [ ] Define publish severity matrix for conflicts: hard blockers vs warnings. [Owner: Product + Scheduling Eng] [Phase: Phase 1]
- [ ] Define data retention and backup expectations. [Owner: Product + Platform Eng] [Phase: Phase 1]

### 2. Backend And Persistence

- [ ] Choose backend stack for v1. [Owner: Platform Eng] [Phase: Phase 1]
- [ ] Create persistent data model for employees, schedules, assignments, and settings. [Owner: Platform Eng] [Phase: Phase 1]
- [ ] Replace localStorage app state with API-backed persistence. [Owner: Platform Eng + Frontend Eng] [Phase: Phase 2]
- [ ] Add migration or seed strategy for local development and staging. [Owner: Platform Eng] [Phase: Phase 2]
- [ ] Add server-side validation for employee and schedule writes. [Owner: Platform Eng] [Phase: Phase 2]
- [ ] Add schedule publish endpoint with audit-friendly history. [Owner: Platform Eng + Scheduling Eng] [Phase: Phase 2]

### 3. Authentication And Authorization

- [ ] Select auth provider or implement first-party auth. [Owner: Platform Eng] [Phase: Phase 1]
- [ ] Add login, logout, and session handling. [Owner: Platform Eng] [Phase: Phase 2]
- [ ] Define route protection rules. [Owner: Platform Eng + Frontend Eng] [Phase: Phase 2]
- [ ] Add role-based permissions for manager actions. [Owner: Platform Eng] [Phase: Phase 2]
- [ ] Secure any write endpoints against unauthorized access. [Owner: Platform Eng] [Phase: Phase 2]

### 4. Scheduling Workflow Completion

- [ ] Persist coverage requirements by week and role. [Owner: Scheduling Eng] [Phase: Phase 2]
- [ ] Persist manual assignment edits. [Owner: Scheduling Eng] [Phase: Phase 2]
- [ ] Add weekly navigation and historical schedule viewing. [Owner: Scheduling Eng] [Phase: Phase 2]
- [ ] Add conflict detection for duplicate assignments and unavailable employees. [Owner: Scheduling Eng] [Phase: Phase 2]
- [ ] Extend conflict detection to include role-mismatch and overlapping assignment conflicts. [Owner: Scheduling Eng] [Phase: Phase 2]
- [ ] Enforce date-specific availability exceptions (approved time off) as assignment blockers. [Owner: Scheduling Eng] [Phase: Phase 2]
- [ ] Show pending time-off request conflicts as non-blocking warnings. [Owner: Scheduling Eng] [Phase: Phase 2]
- [ ] Show conflict summary and assignment-level conflict details before publish. [Owner: Scheduling Eng] [Phase: Phase 2]
- [x] Add clear coverage gap indicators before publish.
- [x] Add publish confirmation flow.
- [ ] Add employee schedule acknowledgment workflow if employee access is in scope. [Owner: Product + Scheduling Eng] [Phase: Phase 3]

### 5. Team Management Completion

- [ ] Expand employee record model: status, availability, contact, preferred hours, role, notes. [Owner: Team Eng] [Phase: Phase 2]
- [ ] Support assigning multiple roles to each team member. [Owner: Team Eng] [Phase: Phase 2]
- [ ] Support date-specific availability exceptions with request state (pending, approved). [Owner: Team Eng] [Phase: Phase 2]
- [ ] Add manager workflow to create and resolve time-off exceptions per employee. [Owner: Team Eng] [Phase: Phase 2]
- [ ] Update roster import and export formats to persist multiple roles per employee. [Owner: Team Eng] [Phase: Phase 2]
- [x] Add robust form validation for employee editing.
- [x] Support reactivating archived employees.
- [x] Add import/export option for employee roster if needed for launch.
- [ ] Scope roster import v1 to core employee profile fields only; leave availability out until shifts are business-configurable. [Owner: Product + Team Eng] [Phase: Phase 2]

### 6. Notifications And Change History

- [ ] Decide whether post-MVP communication is notifications, inbox, or a fuller messaging surface. [Owner: Product] [Phase: MVP-Next]
- [ ] If notifications are added later, persist publish/change history. [Owner: Platform Eng] [Phase: Phase 2]
- [ ] If employee communication enters scope later, define read/acknowledgment requirements. [Owner: Product] [Phase: MVP-Next]

### 7. Settings And Workspace Configuration

- [ ] Persist settings server-side. [Owner: Platform Eng + Settings Eng] [Phase: Phase 2]
- [ ] Add organization and location configuration. [Owner: Settings Eng] [Phase: MVP-Next]
- [ ] Make shift types configurable by business or location instead of hardcoding Open, Mid, Close. [Owner: Settings Eng] [Phase: MVP-Next]
- [ ] Add scheduling defaults and notification preferences. [Owner: Settings Eng] [Phase: MVP-Next]

### 8. Quality And Testing

- [ ] Add unit tests for scheduling calculations and state transitions. [Owner: QA + Scheduling Eng] [Phase: Phase 3]
- [ ] Add component tests for critical views. [Owner: QA + Frontend Eng] [Phase: Phase 3]
- [ ] Add integration tests for team CRUD and publish flow. [Owner: QA + Frontend Eng] [Phase: Phase 3]
- [ ] Add end-to-end smoke coverage for major user journeys. [Owner: QA] [Phase: Phase 3]
- [ ] Define test data strategy for local and CI environments. [Owner: QA + Platform Eng] [Phase: Phase 3]

### 9. Production Operations

- [ ] Set up production hosting environment. [Owner: Platform Eng] [Phase: Phase 3]
- [ ] Set up staging environment. [Owner: Platform Eng] [Phase: Phase 3]
- [ ] Add CI pipeline for install, test, and build. [Owner: Platform Eng] [Phase: Phase 3]
- [ ] Add environment variable strategy and secrets management. [Owner: Platform Eng] [Phase: Phase 3]
- [ ] Add centralized error logging and monitoring. [Owner: Platform Eng] [Phase: Phase 3]
- [ ] Add uptime and health monitoring. [Owner: Platform Eng] [Phase: Phase 3]
- [ ] Add backup and rollback plan. [Owner: Platform Eng] [Phase: Phase 3]

### 10. Security And Compliance

- [ ] Review and remediate current dependency vulnerabilities. [Owner: Platform Eng] [Phase: Phase 3]
- [ ] Add secure headers and API security controls. [Owner: Platform Eng] [Phase: Phase 3]
- [ ] Validate access control paths end to end. [Owner: Platform Eng + QA] [Phase: Phase 3]
- [ ] Add rate limiting if public auth or APIs are exposed. [Owner: Platform Eng] [Phase: Phase 3]
- [ ] Document privacy expectations for employee data. [Owner: Product + Platform Eng] [Phase: Phase 3]

### 11. UX, Accessibility, And Performance

- [ ] Complete empty, loading, and error states across all major views. [Owner: Frontend Eng] [Phase: MVP-Next]
- [ ] Improve mobile scheduler usability. [Owner: Frontend Eng] [Phase: MVP-Next]
- [ ] Validate keyboard navigation and focus management. [Owner: Frontend Eng + QA] [Phase: MVP-Next]
- [ ] Add consistent accessible menu, dialog, and popover controls across interactive workflows. [Owner: Frontend Eng] [Phase: MVP-Next]
- [ ] Add visible focus treatment standards for buttons, filters, menu items, and form controls. [Owner: Frontend Eng] [Phase: MVP-Next]
- [ ] Improve semantic labeling and screen-reader support. [Owner: Frontend Eng] [Phase: MVP-Next]
- [ ] Audit color contrast and non-color-only status indicators across the app. [Owner: Frontend Eng + QA] [Phase: MVP-Next]
- [ ] Measure bundle size and page performance. [Owner: Frontend Eng] [Phase: MVP-Next]

### 12. Launch Readiness

- [ ] Create release checklist. [Owner: Product] [Phase: Phase 4]
- [ ] Create support and bug triage process. [Owner: Product] [Phase: Phase 4]
- [ ] Write admin onboarding documentation. [Owner: Product] [Phase: Phase 4]
- [ ] Write deployment and recovery documentation. [Owner: Platform Eng] [Phase: Phase 4]
- [ ] Perform final staging signoff. [Owner: QA + Product] [Phase: Phase 4]

## Recommended Delivery Order

## Frontend MVP Build Order

Use this sequence for the remaining frontend-first MVP work before backend wiring. Each step should leave one user workflow coherent enough to demo and test end to end.

### 1. Team Roster Foundation

- [x] Finalize the manager-facing employee workflow: create, edit, archive, reactivate.
- [x] Finish roster import/export and CSV error handling.
- [x] Tighten employee form validation, empty states, and onboarding copy.
- [x] Confirm availability editing and shifts-per-week constraints behave consistently across card and list views.
- [x] Consolidate the roster toolbar into a single "Roster data" menu (export/import) plus Add Employee, removing a duplicate "Blank template" entry point and the responsive full/collapsed button branching.
- [x] Redesign roster filters into one consistent Search/Role/Status/View control row — search now filters live instead of requiring a submit click, and the scrolling role-chip rail (with custom overflow-arrow JS) was replaced by a plain dropdown that scales to any number of roles.
- [x] Simplify the Import Roster dialog: fixed an inaccurate "Preferred Hours" column claim, consolidated three separate guidance blocks into one accurate helper line, and hid zero-count summary badges.
- [x] Fix a color-contrast bug where Edit and Archive buttons in the roster list were nearly indistinguishable due to a global brand-theme style collision.

### 2. Scheduler Core Workflow

- [x] Finalize weekly coverage requirement editing by role and shift.
- [x] Complete auto-build behavior and manual assignment editing.
- [ ] Surface conflict states, unavailable employees, and coverage gaps clearly. [Owner: Scheduling Eng] [Phase: MVP-Next]
- [x] Add a clear draft-to-published schedule flow in the UI.
- [x] Clarify schedule context management with explicit new-context action, active editing-context status, and guarded week/role switching. [Owner: Frontend Eng] [Phase: MVP-Next]
- [x] Consolidate two confusingly similar reset actions ("Start over with a blank schedule" and "Reset to blank draft") into a single "Reset" button that fully resets the phase (week, role, coverage targets, draft, notes), with the redundant reducer path and its dead-code helper removed.
- [x] Remove the "Confirm coverage plan" checkpoint. It only toggled a boolean with no real validation and re-armed on every edit, forcing a repeated manual click during normal build-tweak-rebuild iteration. Draft generation and publish now depend directly on coverage targets being entered.
- [x] Remove the "Switch schedule?" confirmation dialog specifically from the Reset button (it still guards direct week/role changes via the dropdowns, where losing in-place edits is a real risk).
- [x] Replace the "go to Settings" dead-end banner with an inline week-start-day picker directly on the Scheduler page, and resurrect the unused workflow-phase stepper (Set up and generate / Resolve issues / Publish) with progressive disclosure so Phase 2/3 detail collapses until it's the active step.
- [x] Fix a real crash in `UPDATE_SETTINGS` ("Cannot read properties of undefined") that occurred whenever settings were changed with no role selected — made newly reachable by the inline week-start picker.
- [x] Fix two `position: sticky` overlap bugs (the Settings save bar and the Scheduler workflow stepper) that only surfaced under real incremental scrolling, not in full-page screenshots — both elements are now static/normal-flow.

### 3. Schedule History Consumption

- [x] Make the Shifts view reflect the published schedule state instead of placeholder content. [Owner: Frontend Eng] [Phase: MVP-Next]
- [x] Add week navigation and recent schedule history in the frontend. [Owner: Frontend Eng] [Phase: MVP-Next]
- [x] Clarify what a manager can review after publish: assignments, coverage, and unresolved issues. [Owner: Product + Frontend Eng] [Phase: MVP-Next]
- [x] Add published schedule filtering by selectable range and role, with reset behavior and URL deep-link persistence. [Owner: Frontend Eng] [Phase: MVP-Next]
- [x] Add grouped published schedule selection cards and improve default/no-match list states for clearer browsing. [Owner: Frontend Eng] [Phase: MVP-Next]
- [x] Improve assignment review controls and layout context (employee/day-first views, selected schedule context chip, simplified employee table columns). [Owner: Frontend Eng] [Phase: MVP-Next]
- [x] Reimagine the Shifts view as History: rename the page and nav entry, and reorient it around a filterable list of all schedules (draft and published) sorted newest to oldest, instead of a single published-only detail view.
- [x] Add a persistence layer (`state.schedules[]`) so saved-but-unpublished drafts become permanent, resumable records — additive on top of the existing in-session `roleRequirements` model, with automatic migration from the legacy `publishHistory` shape (including a previously-invisible unpublished draft).
- [x] Add role and status filtering (All / In progress / Published) to the History list, plus true-empty vs. filtered-empty onboarding states.
- [x] Reorganize the History detail view: renamed the "Assignments" section to "Shift Assignments" and moved it to the top of the page; extracted the Assignments/Coverage/Unresolved-issues summary cards into a new "Details" panel at the bottom.
- [x] Rename the detail view's scheduler deep-link action from "Resume in Scheduler" to "Edit Schedule" for clarity across both draft and published entries.

### 4. Settings That Drive Scheduling

- [ ] Finish organization settings that materially affect scheduling behavior. [Owner: Settings Eng] [Phase: MVP-Next]
- [ ] Make shift types, operating hours, and scheduling defaults fully editable in the UI. [Owner: Settings Eng] [Phase: MVP-Next]
- [ ] Ensure settings changes propagate through team availability and scheduler views. [Owner: Settings Eng] [Phase: MVP-Next]
- [x] Consolidate five separate Settings save forms (each with its own submit button) into one unified form with a single save bar (Discard changes / Save changes).

### 5. MVP Scope Cleanup

- [x] Remove Messages from the v1 MVP surface and navigation.
- [x] Keep schedule publish state visible without introducing a separate communications feature.
- [ ] Move any richer notifications or messaging work to post-launch scope. [Owner: Product] [Phase: MVP-Next]

### 6. Frontend Hardening Pass

- [ ] Complete loading, empty, success, and error states across the MVP workflows above. [Owner: Frontend Eng] [Phase: MVP-Next]
- [ ] Finish keyboard support, focus handling, and responsive behavior for high-use controls. [Owner: Frontend Eng] [Phase: MVP-Next]
- [x] Add or update tests for the critical team and scheduler happy paths.
- [x] Add a shared `StatusBadge` component (draft/published/archived tone mapping) and retrofit it into Team, Dashboard, Scheduler, and History for consistent status styling.

### Phase 1: Architecture And Scope

- [ ] Lock product scope. [Owner: Product] [Phase: Phase 1]
- [ ] Choose backend and auth approach. [Owner: Platform Eng] [Phase: Phase 1]
- [ ] Design data model and API boundaries. [Owner: Platform Eng] [Phase: Phase 1]

### Phase 2: Persisted Core Workflows

- [ ] Implement backend persistence. [Owner: Platform Eng] [Phase: Phase 2]
- [ ] Wire frontend to real API. [Owner: Frontend Eng] [Phase: Phase 2]
- [ ] Complete team management and schedule lifecycle. [Owner: Team Eng + Scheduling Eng] [Phase: Phase 2]

### Phase 3: Hardening

- [ ] Add testing coverage. [Owner: QA + Frontend Eng] [Phase: Phase 3]
- [ ] Add CI/CD, staging, and monitoring. [Owner: Platform Eng] [Phase: Phase 3]
- [ ] Resolve security and accessibility gaps. [Owner: Platform Eng + Frontend Eng] [Phase: Phase 3]

### Phase 4: Launch

- [ ] Run staging validation. [Owner: QA + Product] [Phase: Phase 4]
- [ ] Complete release checklist. [Owner: Product] [Phase: Phase 4]
- [ ] Deploy production. [Owner: Platform Eng] [Phase: Phase 4]

## Open Decisions

- [ ] Should employees log in and view or acknowledge their own schedules in v1? [Owner: Product] [Phase: Phase 1]
- [ ] Should post-launch communication be notifications only, or a fuller messaging product? [Owner: Product] [Phase: MVP-Next]
- [ ] Is this single-location for v1, or must it support multiple locations immediately? [Owner: Product] [Phase: Phase 1]
- [ ] What hosting target should we optimize for? [Owner: Platform Eng] [Phase: Phase 1]

## Notes

- Frontend page jobs and MVP screen requirements are defined in `docs/frontend-page-requirements.md`.
- Build verification currently passes with `npm run build`.
- Frontend smoke tests currently pass with `npm run test`.
- This backlog should be updated whenever scope or delivery order changes.