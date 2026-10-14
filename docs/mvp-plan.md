Busineess TYpe# ShiftSizzle — MVP Plan & Claude Code Handoff

Suggested location in repo: `docs/mvp-plan.md` (and reference it from `CLAUDE.md`).

## 1. Where things stand

ShiftSizzle is a React 18 + Vite SPA backed by Supabase (Postgres + RLS, auth, Edge Functions). The core product is built: auth/orgs/invites with owner/manager/staff roles, multi-location, team management, settings, the day-first Scheduler (week overview, role filters, adaptive publish flow, undo, autosave, copy-last-week with conflicts), manual call-outs, dashboard, history, and a setup wizard.

Known gaps:
- **No billing** (no Stripe, no plan gating, no subscription status).
- **AI features have never run against a deployed backend.** Two Edge Functions exist (`setup-assistant`, `build-schedule`); the client falls back silently to built-in auto-fill on any "unavailable"-looking error, so failures are invisible.
- Call-out broadcast ("notify available staff") is deferred; only manual resolution exists.
- No email/SMS/push notifications (in-app only is acceptable for v1).
- Note: `docs/schedule-builder-redesign-spec.md` says "not yet implemented" but the code implements most of it. Update the status line.

## 2. Launch decisions (agreed)

- Release 1 audience: **public self-serve signup**
- Notifications: **in-app only is fine for v1**
- Monetization: **billing/plans required at launch**
- AI functionality must actually work before launch.

## 3. MVP (R0) scope

Everything already built, plus:

1. **AI working end to end** (Section 4) — first priority
2. **Billing** — Stripe Checkout, subscription status on `organizations`, webhook sync, billing portal link
3. **Plan enforcement** — limits (seats/locations/AI usage) that actually gate something
4. **Public-signup hardening** — email confirmation on, rate limits reviewed, captcha if abuse appears
5. **Legal** — Terms of Service and Privacy Policy linked from signup (employee PII is stored)
6. **Landing + pricing page**
7. **Error monitoring** (e.g. Sentry)
8. **RLS security review** now that strangers can create orgs

Explicitly not in R0: call-out broadcast, email/SMS/push, shift swaps, reliability reporting.

## 4. AI workstream (do first)

Context: `src/state/aiAssist.js` wraps two Edge Functions. `isMissingFunction` treats `FunctionsFetchError`, 404, and messages matching /not found|failed to (send|fetch)/ as `AI_UNAVAILABLE`, which silently falls back to `AUTO_BUILD_SCHEDULE`. Both functions authorize via `memberships.account_role` in (`owner`,`manager`) using the service role key.

### Task A1 — Harden the Edge Functions
Files: `supabase/functions/setup-assistant/index.ts`, `supabase/functions/build-schedule/index.ts`
- Replace `anthropic.messages.parse` with `messages.create` + explicit JSON extraction/validation (don't trust `parsed_output`). Return a clear error if the result is empty or malformed.
- Pin the Anthropic SDK import to an exact version (no unpinned esm.sh URL).
- Verify the JSON schema is accepted by structured outputs; remove unsupported keywords (e.g. `minimum`) and enforce them in code instead.
- Confirm the model string is valid for the API; make it a single constant (or env var).
- Add `console.error` logging with enough context to debug (function name, org id, status), never logging secrets or full employee PII.
- Add request size limits and a timeout.
- Acceptance: both functions return well-formed `{ ok: true, ... }` or `{ error }` with an appropriate HTTP status for every failure path.

### Task A2 — Deploy and smoke test (human-assisted)
Claude Code can prepare commands; the human runs them.
- `supabase secrets set ANTHROPIC_API_KEY=...`
- `supabase functions deploy setup-assistant build-schedule`
- Write `docs/ai-smoke-test.md`: manual checklist for the wizard's "describe it instead" flow and the Scheduler AI draft (single role, small roster, then a larger one), plus `supabase functions logs <name>` troubleshooting.
- Acceptance: both flows succeed on the deployed backend.

### Task A3 — Make failures visible on the client
Files: `src/state/aiAssist.js`, `src/Views/Scheduler/Scheduler.jsx`, `src/Views/Setup/SetupWizard.jsx`
- Narrow `isMissingFunction` so only a true 404/not-deployed returns `AI_UNAVAILABLE`; real server errors and network failures surface as distinct messages.
- Show the model's `notes` after an AI draft; show a clear message when a draft applied zero assignments.
- Send `last_week` in `buildAiRequestForRole` (the server prompt already supports it) using the prior scheduled week's assignments.
- Consider drafting roles in parallel with a concurrency cap.
- Update `aiAssist.test.js` and Scheduler tests accordingly.
- Acceptance: tests pass; a forced server error shows a specific message instead of silently falling back.

### Task A4 — Guardrails
- Per-org rate/usage limits for AI calls (table + check in each function). Design so limits can later key off the billing plan.
- Acceptance: exceeding the limit returns a clear, non-fallback error and is covered by tests.

## 5. Release roadmap

| Release | Theme | Scope |
|---|---|---|
| R0 | Launch | Section 3 |
| R1 | Coverage & communication | Email notifications (publish, invite reminders); call-out broadcast (first-accept-wins, per spec §6); manager-approval toggle |
| R2 | Team flexibility | Employee shift-swap requests; SMS/push; call-out reliability view |
| R3 | Insights & scale | Labor/hours reporting and export; payroll integration; audit log and granular permissions |

## 6. Working agreements for Claude Code

- Work one task at a time on its own branch; open a PR per task.
- Run `npm test` and the linter before declaring a task done; add or update tests with every change.
- Don't commit secrets; never edit `docs/` build output by hand (it's generated by `npm run build`).
- Supabase migrations go in `supabase/migrations/` and must preserve existing RLS guarantees (org-scoped, owner/manager writes).
- Ask before making schema changes that affect existing data.
- If something in this plan contradicts the code, trust the code and flag the discrepancy.

## 7. Kickoff prompts (paste into Claude Code)

**First session — orientation**
> Read `docs/mvp-plan.md`, `README.md`, and `docs/production-backlog.md`. Then summarize the repo layout and confirm Section 4 (AI workstream) matches the code. List any discrepancies before changing anything.

**Task A1**
> Do Task A1 from `docs/mvp-plan.md` on a new branch. Start by reading both Edge Functions in full and listing the specific risks you find. Then implement the fixes, explain each change, and add any tests that are practical. Don't deploy anything.

**Task A3**
> Do Task A3 from `docs/mvp-plan.md` on a new branch. Update the client so AI failures are distinguishable from "not deployed," send `last_week`, and show model notes. Update tests and run the full suite.

**Task A4**
> Propose a design for per-org AI usage limits (table, migration, function checks) before writing code. Wait for my approval, then implement it.
