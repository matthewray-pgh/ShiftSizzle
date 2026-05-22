# ShiftSizzle Production Backlog

This file is the working source of truth for getting ShiftSizzle from a client-side MVP to a production-ready application. It is intended to be edited directly in the repo as priorities, scope, and completion status change.

## How To Use This File

- Change the checkbox state as work is completed.
- Add owners, dates, and notes inline as decisions are made.
- Keep sections ordered by shipping priority, not by idea count.
- Treat anything in `Release Blockers` as required before production launch.

## Current State Summary

- Frontend Vite + React application with shared local state persistence.
- Core views exist for dashboard, team, scheduler, shifts, messages, and settings.
- No backend, authentication, database, deployment pipeline, or production monitoring yet.

## Release Blockers

### 1. Product Foundation

- [ ] Finalize MVP scope for v1 production launch.
- [ ] Define supported user roles for v1: manager only, or manager + employee.
- [ ] Define required schedule lifecycle states: draft, published, acknowledged, archived.
- [ ] Define business rules for scheduling conflicts, overtime, and availability.
- [ ] Define data retention and backup expectations.

### 2. Backend And Persistence

- [ ] Choose backend stack for v1.
- [ ] Create persistent data model for employees, schedules, assignments, messages, and settings.
- [ ] Replace localStorage app state with API-backed persistence.
- [ ] Add migration or seed strategy for local development and staging.
- [ ] Add server-side validation for employee and schedule writes.
- [ ] Add schedule publish endpoint with audit-friendly history.

### 3. Authentication And Authorization

- [ ] Select auth provider or implement first-party auth.
- [ ] Add login, logout, and session handling.
- [ ] Define route protection rules.
- [ ] Add role-based permissions for manager actions.
- [ ] Secure any write endpoints against unauthorized access.

### 4. Scheduling Workflow Completion

- [ ] Persist coverage requirements by week and role.
- [ ] Persist manual assignment edits.
- [ ] Add weekly navigation and historical schedule viewing.
- [ ] Add conflict detection for duplicate assignments and unavailable employees.
- [ ] Add clear coverage gap indicators before publish.
- [ ] Add publish confirmation flow.
- [ ] Add employee schedule acknowledgment workflow if employee access is in scope.

### 5. Team Management Completion

- [ ] Expand employee record model: status, availability, contact, preferred hours, role, notes.
- [ ] Add robust form validation for employee editing.
- [ ] Support reactivating archived employees.
- [ ] Add import/export option for employee roster if needed for launch.
- [ ] Scope roster import v1 to core employee profile fields only; leave availability out until shifts are business-configurable.

### 6. Messaging And Notifications

- [ ] Decide whether the v1 requirement is notifications, inbox, or full messaging.
- [ ] Persist message history.
- [ ] Trigger schedule publication notifications.
- [ ] Track read state per user.

### 7. Settings And Workspace Configuration

- [ ] Persist settings server-side.
- [ ] Add organization and location configuration.
- [ ] Make shift types configurable by business or location instead of hardcoding Open, Mid, Close.
- [ ] Add scheduling defaults and notification preferences.

### 8. Quality And Testing

- [ ] Add unit tests for scheduling calculations and state transitions.
- [ ] Add component tests for critical views.
- [ ] Add integration tests for team CRUD and publish flow.
- [ ] Add end-to-end smoke coverage for major user journeys.
- [ ] Define test data strategy for local and CI environments.

### 9. Production Operations

- [ ] Set up production hosting environment.
- [ ] Set up staging environment.
- [ ] Add CI pipeline for install, test, and build.
- [ ] Add environment variable strategy and secrets management.
- [ ] Add centralized error logging and monitoring.
- [ ] Add uptime and health monitoring.
- [ ] Add backup and rollback plan.

### 10. Security And Compliance

- [ ] Review and remediate current dependency vulnerabilities.
- [ ] Add secure headers and API security controls.
- [ ] Validate access control paths end to end.
- [ ] Add rate limiting if public auth or APIs are exposed.
- [ ] Document privacy expectations for employee data.

### 11. UX, Accessibility, And Performance

- [ ] Complete empty, loading, and error states across all major views.
- [ ] Improve mobile scheduler usability.
- [ ] Validate keyboard navigation and focus management.
- [ ] Add consistent accessible menu, dialog, and popover controls across interactive workflows.
- [ ] Add visible focus treatment standards for buttons, filters, menu items, and form controls.
- [ ] Improve semantic labeling and screen-reader support.
- [ ] Audit color contrast and non-color-only status indicators across the app.
- [ ] Measure bundle size and page performance.

### 12. Launch Readiness

- [ ] Create release checklist.
- [ ] Create support and bug triage process.
- [ ] Write admin onboarding documentation.
- [ ] Write deployment and recovery documentation.
- [ ] Perform final staging signoff.

## Recommended Delivery Order

### Phase 1: Architecture And Scope

- [ ] Lock product scope.
- [ ] Choose backend and auth approach.
- [ ] Design data model and API boundaries.

### Phase 2: Persisted Core Workflows

- [ ] Implement backend persistence.
- [ ] Wire frontend to real API.
- [ ] Complete team management and schedule lifecycle.

### Phase 3: Hardening

- [ ] Add testing coverage.
- [ ] Add CI/CD, staging, and monitoring.
- [ ] Resolve security and accessibility gaps.

### Phase 4: Launch

- [ ] Run staging validation.
- [ ] Complete release checklist.
- [ ] Deploy production.

## Open Decisions

- [ ] Should employees log in and view or acknowledge their own schedules in v1?
- [ ] Is messaging a required production feature or can it remain notification-only?
- [ ] Is this single-location for v1, or must it support multiple locations immediately?
- [ ] What hosting target should we optimize for?

## Notes

- Build verification currently passes with `npm run build`.
- Frontend smoke tests currently pass with `npm run test`.
- This backlog should be updated whenever scope or delivery order changes.