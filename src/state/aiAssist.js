import { DAYS } from "./AppState";
import { buildTemplateRoleCoverage } from "./setupTemplates";

// Returned as `error` when the Edge Function isn't deployed (or can't be
// reached at all) — callers use this to fall back to the built-in path
// silently rather than surfacing a scary message.
export const AI_UNAVAILABLE = "ai-unavailable";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const cleanTime = (value) => (typeof value === "string" && HHMM.test(value) ? value : "");

// supabase-js surfaces a missing/unreachable function as a fetch error or a
// 404; anything else is a real error worth showing.
const isMissingFunction = (error) =>
  !error
    ? false
    : error.name === "FunctionsFetchError"
      || error.context?.status === 404
      || /not found|does not exist|failed to (send|fetch)/i.test(error.message ?? "");

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
  const { data, error } = await supabase.functions.invoke("setup-assistant", {
    body: { description },
  });

  if (isMissingFunction(error)) {
    return { error: AI_UNAVAILABLE };
  }

  if (error || data?.error) {
    return { error: data?.error ?? error?.message ?? "Setup generation failed." };
  }

  const payload = aiSetupToSettingsPayload(data.setup, currentSettings);

  if (!payload) {
    return { error: "The generated setup was incomplete — add a bit more detail and try again." };
  }

  return { ok: true, payload, summary: typeof data.setup?.summary === "string" ? data.setup.summary : "" };
};

// Calls the build-schedule Edge Function for one role. Returns
// `{ ok, assignments: [{ employeeId, day, shift }], notes }` or `{ error }`.
// The caller still re-validates every pick before applying it.
export const requestAiSchedule = async (supabase, requestBody) => {
  const { data, error } = await supabase.functions.invoke("build-schedule", {
    body: requestBody,
  });

  if (isMissingFunction(error)) {
    return { error: AI_UNAVAILABLE };
  }

  if (error || data?.error) {
    return { error: data?.error ?? error?.message ?? "Schedule generation failed." };
  }

  const draft = data.draft ?? {};
  const assignments = (draft.assignments ?? [])
    .filter((entry) => entry && entry.employee_id && entry.day && entry.shift)
    .map((entry) => ({ employeeId: entry.employee_id, day: entry.day, shift: entry.shift }));

  return { ok: true, assignments, notes: typeof draft.notes === "string" ? draft.notes : "" };
};
