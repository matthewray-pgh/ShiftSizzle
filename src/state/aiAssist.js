import { DAYS } from "./AppState";
import { buildTemplateRoleCoverage } from "./setupTemplates";

// Returned as `error` only when the Edge Function isn't deployed (a 404 from
// the functions gateway) — callers use this to fall back to the built-in
// path quietly. Every other failure comes back as a message worth showing.
export const AI_UNAVAILABLE = "ai-unavailable";

const AI_UNREACHABLE_MESSAGE = "Couldn't reach the AI service — check your connection and try again.";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const cleanTime = (value) => (typeof value === "string" && HHMM.test(value) ? value : "");

// Invokes an AI Edge Function and returns `{ data }` or `{ error, code }`.
// supabase-js hands back `data: null` for any non-2xx answer and keeps the
// real body on `error.context` (the Response), so the function's own
// `{ error, code }` has to be read from there.
const invokeAi = async (supabase, name, body, fallbackMessage) => {
  const { data, error } = await supabase.functions.invoke(name, { body });

  if (!error) {
    return data?.error ? { error: data.error, code: data.code ?? null } : { data: data ?? {} };
  }

  if (error.context?.status === 404) {
    return { error: AI_UNAVAILABLE };
  }

  if (error.name === "FunctionsFetchError") {
    return { error: AI_UNREACHABLE_MESSAGE, code: "network_error" };
  }

  let payload = null;

  try {
    payload = typeof error.context?.json === "function" ? await error.context.json() : null;
  } catch {
    payload = null;
  }

  return {
    error: typeof payload?.error === "string" && payload.error ? payload.error : fallbackMessage,
    code: payload?.code ?? null,
  };
};

// Runs `task` over `items` with at most `limit` in flight, returning results
// in input order.
export const mapWithConcurrency = async (items, limit, task) => {
  const results = new Array(items.length);
  let next = 0;

  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      // eslint-disable-next-line no-await-in-loop
      results[index] = await task(items[index], index);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));

  return results;
};

// Map the setup-assistant JSON into the exact settings payload shape
// `settingsFromTemplate` produces, so `UPDATE_SETTINGS` handles it
// identically. Returns null if the model left out something essential.
export const aiSetupToSettingsPayload = (setup, currentSettings = {}) => {
  if (!setup || typeof setup !== "object") {
    return null;
  }

  const shiftTypeDefs = (setup.shift_types ?? []).filter((entry) => entry && typeof entry.label === "string" && entry.label.trim());
  const shiftTypes = [...new Set(shiftTypeDefs.map((entry) => entry.label.trim()))];

  if (shiftTypes.length === 0) {
    return null;
  }

  const shiftTimes = Object.fromEntries(
    shiftTypeDefs.map((entry) => [
      entry.label.trim(),
      { startTime: cleanTime(entry.start_time), endTime: cleanTime(entry.end_time) },
    ])
  );

  const teamRoles = [...new Set((setup.team_roles ?? []).map((role) => `${role}`.trim()).filter(Boolean))];

  if (teamRoles.length === 0) {
    return null;
  }

  const hoursByDay = Object.fromEntries((setup.operating_hours ?? []).map((entry) => [entry.day, entry]));
  const operatingHours = Object.fromEntries(
    DAYS.map((day) => {
      const entry = hoursByDay[day];
      const isOpen = Boolean(entry?.is_open);

      return [
        day,
        {
          isOpen,
          openTime: isOpen ? cleanTime(entry?.open_time) : "",
          closeTime: isOpen ? cleanTime(entry?.close_time) : "",
        },
      ];
    })
  );

  const coverageByRole = {};

  (setup.coverage ?? []).forEach((entry) => {
    if (!entry || !teamRoles.includes(entry.role) || !shiftTypes.includes(entry.shift_label)) {
      return;
    }

    coverageByRole[entry.role] = coverageByRole[entry.role] ?? {};
    coverageByRole[entry.role][entry.shift_label] = Math.max(0, Number(entry.count) || 0);
  });

  const roleCoverage = buildTemplateRoleCoverage(coverageByRole, operatingHours);

  const weekStartsOn = DAYS.includes(setup.week_starts_on)
    ? setup.week_starts_on
    : currentSettings.weekStartsOn || "Monday";

  return { shiftTypes, shiftTimes, teamRoles, operatingHours, roleCoverage, weekStartsOn };
};

// Calls the setup-assistant Edge Function and returns a ready-to-dispatch
// settings payload, or `{ error }` (AI_UNAVAILABLE when the function isn't
// there).
export const requestAiSetup = async (supabase, description, currentSettings = {}) => {
  const { data, error } = await invokeAi(supabase, "setup-assistant", { description }, "Setup generation failed. Try again.");

  if (error) {
    return { error };
  }

  const payload = aiSetupToSettingsPayload(data.setup, currentSettings);

  if (!payload) {
    return { error: "The generated setup was incomplete — add a bit more detail and try again." };
  }

  return {
    ok: true,
    payload,
    raw: data.setup ?? null,
    summary: typeof data.setup?.summary === "string" ? data.setup.summary : "",
  };
};

// Re-weights a picked template's staffing for a specific location without
// touching its roles/shifts/hours. Wraps setup-assistant (so no extra
// function to deploy): it asks for a fresh setup constrained to the
// template's roles and shift labels, then keeps only the per-(role, shift)
// headcounts. Returns `{ ok, coverageByRole: { [role]: { [shift]: n } },
// summary }` or `{ error }` (AI_UNAVAILABLE when the function isn't there).
export const requestTunedCoverage = async (supabase, { templateLabel, roles, shiftTypes, note, currentSettings = {} }) => {
  const description = [
    `${templateLabel}.`,
    `Keep exactly these roles: ${roles.join(", ")}.`,
    `Keep exactly these shift labels: ${shiftTypes.join(", ")}.`,
    "Do not add or rename roles or shifts.",
    `Adjust only the per-role, per-shift headcounts to fit this location: ${note}`,
  ].join(" ");

  const result = await requestAiSetup(supabase, description, currentSettings);

  if (result.error) {
    return { error: result.error };
  }

  const coverageByRole = {};

  (result.raw?.coverage ?? []).forEach((entry) => {
    if (!entry || !roles.includes(entry.role) || !shiftTypes.includes(entry.shift_label)) {
      return;
    }

    coverageByRole[entry.role] = coverageByRole[entry.role] ?? {};
    coverageByRole[entry.role][entry.shift_label] = Math.max(0, Number(entry.count) || 0);
  });

  if (Object.keys(coverageByRole).length === 0) {
    return { error: "The staffing adjustment came back empty — using the template's numbers." };
  }

  return { ok: true, coverageByRole, summary: result.summary };
};

// Calls the build-schedule Edge Function for one role. Returns
// `{ ok, assignments: [{ employeeId, day, shift }], notes }` or `{ error }`.
// The caller still re-validates every pick before applying it.
export const requestAiSchedule = async (supabase, requestBody) => {
  const { data, error } = await invokeAi(supabase, "build-schedule", requestBody, "Schedule generation failed. Try again.");

  if (error) {
    return { error };
  }

  const draft = data.draft ?? {};
  const assignments = (draft.assignments ?? [])
    .filter((entry) => entry && entry.employee_id && entry.day && entry.shift)
    .map((entry) => ({ employeeId: entry.employee_id, day: entry.day, shift: entry.shift }));

  return { ok: true, assignments, notes: typeof draft.notes === "string" ? draft.notes : "" };
};
