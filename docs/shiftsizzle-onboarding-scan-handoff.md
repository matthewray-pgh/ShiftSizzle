# Handoff: Camera/Image Onboarding Scan → Roster Autofill

## 1. Feature summary
Add a way for managers to add a new team member by taking a photo (mobile camera) or uploading an image of a paper application, ID, or similar document. The app extracts candidate info via an AI vision API and pre-fills the "Add Employee" form in the Team roster for manager review before saving.

**This is not OCR built from scratch.** Use a vision-capable LLM API (Claude, via the Anthropic Messages API with an image content block) to read the image and return structured JSON matching the roster schema below. No new ML infra needed.

## 2. ⚠️ Architecture check required before starting
The current codebase (per `README.md` and `src/state/AppState.jsx`) is **100% client-side**:
- App state lives in a React `useReducer` (`AppState.jsx`)
- Persistence is `window.localStorage.setItem(...)`, not a database
- No Supabase client, auth, or API calls were found anywhere in the repo

The project owner believes Supabase/Postgres is in use. **Before building this feature, confirm with the user:**
1. Is Supabase actually integrated elsewhere (maybe a branch or separate repo not synced here)?
2. If not, do they want this feature to work against localStorage for now (fastest path, matches current architecture), or is adding Supabase persistence part of this project's scope?

This matters a lot for where the "call the AI API" logic lives (see Section 5).

## 3. Current roster data model (from actual code)
Source: `src/Views/Team/rosterImportExport.js`, `src/state/AppState.jsx`

```js
{
  id: number,              // Date.now() on create
  name: string,            // required
  title: string,           // e.g. "Line Cook", "Shift Lead"
  role: string,             // required — must match one of settings.teamRoles (e.g. MANAGER, SERVER, COOK, HOST, BARTENDER)
  contact: string,          // phone, freeform
  email: string,            // validated against basic email regex
  shiftsPerWeek: number,    // defaults to 5
  status: "active" | "archived",
  availability: { [day]: [shiftType, ...] }  // not derivable from a scanned doc — leave default/blank
}
```

Validation rules already in the codebase (reuse these, don't reinvent):
- `name` and `role` are required
- `role` must match an existing team role (case-insensitive lookup exists — see `roleLookup` in `rosterImportExport.js`)
- `email` regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- Duplicate detection matches on email first, falling back to name (`createRowMatchKey` equivalent, see `wp`/`createRowMatchKey` functions)

**The CSV import flow (`rosterImportExport.js` + its preview/dedupe logic in the Team view) is the closest existing analog to what we're building.** The scan feature should produce the same shape of "proposed row" objects and can likely reuse `buildRosterImportPreview` for create-vs-update-vs-skip logic instead of writing new dedupe code.

## 4. Proposed user flow
1. Manager on Team view taps **"Add via Scan"** (new button next to existing "Add Employee" / CSV import buttons)
2. Modal/sheet opens with two options: **Take Photo** (mobile camera via `<input type="file" accept="image/*" capture="environment">`) or **Upload Image** (existing file picker, no capture attribute)
3. Image is sent to the extraction API (see Section 5)
4. Loading state while waiting on the response
5. Extracted fields populate the **existing** "Add/Edit Employee" form (reuse the current form component, e.g. `Fa()`/employee draft state in the Team view) — nothing about the form itself changes
6. Manager reviews/edits fields (especially `role`, since matching a scanned title like "Server" to the exact configured role string may need a nudge) and confirms
7. On confirm, run through the same dedupe check used by CSV import (matches on email → name) so the manager gets a "this looks like an existing employee" warning before creating a duplicate
8. Save via existing `UPSERT_EMPLOYEE` dispatch action

## 5. Extraction API integration
Call the Anthropic Messages API with an image block + a prompt that forces JSON-only output matching the schema in Section 3.

**Where this call lives depends on the architecture answer from Section 2:**
- **If staying client-side/localStorage:** the API key cannot live in frontend code. Even for a prototype, route this through a minimal serverless function (Vercel/Netlify function, or a single Supabase Edge Function if Supabase does get added) that proxies the request and holds the API key server-side. Do not call the Anthropic API directly from the browser with an embedded key.
- **If Supabase is/becomes the backend:** use a Supabase Edge Function as the proxy.

Example request shape (server-side function):
```js
const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": process.env.ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  },
  body: JSON.stringify({
    model: "claude-sonnet-4-5", // confirm current recommended model at build time
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64Image } },
        {
          type: "text",
          text: `Extract employee info from this image (job application, ID, or similar document).
Return ONLY valid JSON, no markdown fences, no preamble, matching exactly:
{
  "name": string or null,
  "title": string or null,
  "role_guess": string or null,
  "contact": string or null,
  "email": string or null
}
If a field isn't visible or legible, use null. Do not guess or hallucinate values.`
        }
      ]
    }]
  })
});
```

Notes for whoever implements this:
- `role_guess` is intentionally separate from the roster's `role` field — the model will read a job title, not your app's exact role taxonomy. The frontend should fuzzy-match `role_guess` against `settings.teamRoles` (reuse `roleLookup`-style matching from `rosterImportExport.js`) and leave it unmatched/blank rather than force a wrong role.
- Never auto-save extracted data. Always land in the reviewable form (Section 4, step 5).
- `shiftsPerWeek` and `availability` are not extractable from a document — leave at form defaults.

## 6. Compliance flag (non-blocking, but raise with the user)
If this ever extends to scanning IDs, SSNs, or I-9/W-4 forms, that's sensitive PII and probably needs encryption-at-rest, access logging, and a compliance review depending on jurisdiction. Out of scope for v1 (just name/contact/title extraction from an application), but worth a one-line note in the PR description so it's not forgotten later.

## 7. Suggested build order
1. Confirm architecture question (Section 2) with the user before writing any code
2. Build the serverless proxy function for the Anthropic API call
3. Add "Add via Scan" entry point + camera/upload UI in Team view
4. Wire image → API call → loading state → populate existing employee form
5. Add role fuzzy-matching for `role_guess`
6. Reuse dedupe logic from `rosterImportExport.js` before final save
7. Manual test: photo taken on an actual phone (lighting/glare varies a lot from a clean upload)
