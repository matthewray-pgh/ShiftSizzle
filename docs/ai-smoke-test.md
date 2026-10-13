# AI smoke test

Manual checklist for Task A2 in [mvp-plan.md](mvp-plan.md): deploy the two AI Edge Functions (`setup-assistant`, `build-schedule`) and confirm both flows work against the real backend.

Run every command from the repo root. The Supabase CLI is a dev dependency, so `npx supabase ...` works without a global install.

## 1. Deploy

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>

# Creates the ai_usage_events table and consume_ai_quota function
# (migration 0009). Both AI functions refuse every call until this exists.
npx supabase db push

# The key is read from your shell, so it never lands in a file or the repo.
npx supabase secrets set ANTHROPIC_API_KEY=<your-key>

npx supabase functions deploy setup-assistant build-schedule
npx supabase functions list
```

Both functions should show as `ACTIVE`. The deploy also uploads `supabase/functions/_shared/`, which both functions import.

Optional: `npx supabase secrets set ANTHROPIC_MODEL=<model-id>` switches models without a code change. The default is `claude-sonnet-5`.

## 2. Check the failure paths with curl

These confirm the functions are reachable and reject bad calls before you touch the UI.

```bash
FN=https://<your-project-ref>.supabase.co/functions/v1
ANON=<your anon key, the same value as VITE_SUPABASE_ANON_KEY>

# A request with no signed-in user: expect HTTP 401 and
# {"error":"Invalid session","code":"unauthenticated"}
curl -i -X POST "$FN/setup-assistant" \
  -H "Authorization: Bearer $ANON" -H "apikey: $ANON" \
  -H "Content-Type: application/json" \
  -d '{"description":"coffee shop open 6 to 3 on weekdays"}'
```

To test as a real user, sign in to the app, copy `access_token` from the `sb-<project-ref>-auth-token` entry in the browser's Local Storage, and use it as the `Authorization: Bearer` value:

| Call | Expected |
|---|---|
| `setup-assistant` with `{"description":"hi"}` | 400, `code: invalid_request` |
| `setup-assistant` signed in as a staff account | 403, `code: forbidden` |
| `build-schedule` with `{}` | 400, `code: invalid_request` |
| `setup-assistant` with a real description, as an owner | 200, `{"ok":true,"setup":{...}}` |

## 3. Setup wizard: "Describe it instead"

Sign in as an owner on a workspace that has not finished setup.

- [ ] Open the setup wizard and choose **Describe it instead**.
- [ ] Enter: `Coffee shop open 6am to 3pm Monday to Saturday, closed Sunday. Two baristas and a shift lead at open, one barista at close.`
- [ ] A summary line appears, and the review step shows shift types, roles, hours with Sunday closed, and headcounts that match the description.
- [ ] Finish the wizard. Settings shows the same shifts, roles, hours and coverage.
- [ ] Pick a template, then fill in **Fine-tune staffing for your location** (for example `busier on weekends, add one server at close`). The headcounts change; the roles and shifts do not.
- [ ] Enter a description that says nothing about a business (`asdf asdf asdf`). You get an error message, not a blank or broken setup.

## 4. Scheduler: AI draft

Use **AI draft** on the Build Schedule page.

- [ ] **Single role, small roster.** One role, 3 to 5 people, a week with coverage targets set. The draft fills shifts, nobody is on a shift they are unavailable for, and nobody exceeds their shifts-per-week cap.
- [ ] **Short-staffed.** Set targets higher than the roster can cover. The draft leaves gaps instead of over-assigning people.
- [ ] **Larger roster.** 3 or more roles with 15 or more people each. Every role gets a draft and the whole run finishes without an error. Roles are drafted one after another, so expect this to take a while; note the total time.
- [ ] **People with two roles.** Someone who works two roles is not given two shifts on the same day across them.

## 5. Usage limits

Each org gets 20 `setup-assistant` calls and 100 `build-schedule` calls per trailing 24 hours. One AI draft click uses one call per role that has coverage targets.

- [ ] After a few drafts, `select function_name, input_tokens, output_tokens, created_at from ai_usage_events order by created_at desc limit 10;` in the SQL editor shows one row per call, with token counts filled in.
- [ ] To see the limit message without making 100 calls, temporarily set `'build-schedule': 1` in `supabase/functions/_shared/aiQuota.ts`, redeploy, and draft a week with two roles. The second role shows "used all of its AI schedule drafts for today" and the app does not auto-fill. Restore the number and redeploy.

## 6. Troubleshooting

The Supabase CLI has no `functions logs` command. Read logs in the dashboard: **Edge Functions → (function name) → Logs**. Each AI call writes one JSON line, for example:

```json
{"fn":"build-schedule","org_id":"...","model":"claude-sonnet-5","stop_reason":"end_turn","input_tokens":1840,"output_tokens":912,"ms":8421,"code":"ok"}
```

Failures have the same shape with a different `code`, plus `detail` and `request_id` when the Anthropic API returned an error. The function answers the browser with the same `code`.

| `code` | HTTP | Meaning | Fix |
|---|---|---|---|
| `ai_misconfigured` | 503 | `ANTHROPIC_API_KEY` is missing or rejected, or the model id is unknown | Re-run `secrets set`; check `ANTHROPIC_MODEL` if you set it |
| `ai_bad_request` | 502 | The API rejected the request, usually the JSON schema | Read `detail` in the log; it names the rejected field |
| `ai_timeout` | 504 | No answer within 60s (setup) or 120s (schedule) | Retry; if a large roster always times out, report the roster size |
| `ai_rate_limited` | 429 | The Anthropic account hit its rate limit | Wait a minute; raise the limit if it recurs |
| `ai_truncated` | 502 | The response hit the output-token cap | Report the roster size; the cap is `maxTokens` in the function |
| `ai_malformed_output`, `ai_empty_output` | 502 | The model's response was not usable JSON | Retry; if it repeats, capture `request_id` |
| `ai_incomplete_output` | 422 | The description did not yield any shift types or roles | Add detail to the description |
| `ai_refused` | 422 | The model declined the request | Rephrase the description |
| `ai_invalid_picks_dropped` | (200) | The model returned people, days or shifts that were not in the request; they were discarded | Informational; worth a look if `dropped` is large |
| `ai_quota_exceeded` | 429 | The org used its allowance for the last 24 hours (20 setup requests, 100 role drafts) | Wait, or raise the numbers in `supabase/functions/_shared/aiQuota.ts` and redeploy |
| `quota_check_failed` | 500 | The usage check could not run, usually because migration 0009 has not been applied | Run `npx supabase db push` |
| `forbidden` | 403 | The caller is not an active owner or manager | Check the `memberships` row |
| `payload_too_large` | 413 | Body over 16 KB (setup) or 512 KB (schedule) | Report the roster size |

How the app reports these:

- **Function not deployed (404).** The Scheduler falls back to the built-in auto-fill and says AI "isn't set up yet"; the setup wizard hides **Describe it instead** for the rest of the session. If you see either after deploying, check the function name and that the deploy succeeded.
- **Anything else.** The function's own `error` message is shown under the AI draft button or in the wizard. A network failure shows "Couldn't reach the AI service".
- After an AI draft, the model's notes appear under the button, one line per role. A role where nothing could be placed says so.
