// Validation for what goes into and comes out of the model. The API's
// structured outputs constrain the response shape, but a refusal, a
// max_tokens cut-off, or a schema keyword the API doesn't enforce (numeric
// ranges, array lengths) can still hand back something unusable — so
// nothing here trusts the response. Pure functions, no Deno globals or URL
// imports, so Vitest can load this file directly.

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const MAX_LABEL_LENGTH = 80;
const MAX_NOTES_LENGTH = 1000;
const MAX_HEADCOUNT = 99;

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const cleanLabel = (value) => (typeof value === 'string' ? value.trim().slice(0, MAX_LABEL_LENGTH) : '');
const cleanTime = (value) => (typeof value === 'string' && HHMM.test(value) ? value : null);
const cleanCount = (value, max = MAX_HEADCOUNT) => {
  const count = Math.floor(Number(value));

  return Number.isFinite(count) ? Math.min(Math.max(count, 0), max) : 0;
};
const unique = (values) => [...new Set(values)];

const fail = (error, status, code) => ({ ok: false, error, status, code });

// Pulls the JSON object out of a Messages API response. Returns
// `{ ok: true, value }` or a failure with the HTTP status to answer with.
export const readModelJson = (message) => {
  if (!message || !Array.isArray(message.content)) {
    return fail('The AI service returned an empty response.', 502, 'ai_empty_output');
  }

  if (message.stop_reason === 'refusal') {
    return fail('That request could not be processed.', 422, 'ai_refused');
  }

  const text = message.content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
    .trim();

  if (!text) {
    return fail('The AI service returned an empty response.', 502, 'ai_empty_output');
  }

  if (message.stop_reason === 'max_tokens') {
    return fail('The AI response was cut off before it finished. Try again.', 502, 'ai_truncated');
  }

  try {
    const value = JSON.parse(text);

    if (!isPlainObject(value)) {
      return fail('The AI service returned a malformed response.', 502, 'ai_malformed_output');
    }

    return { ok: true, value };
  } catch {
    return fail('The AI service returned a malformed response.', 502, 'ai_malformed_output');
  }
};

// setup-assistant output → the shape the client maps into settings. Returns
// null when there's no usable setup (no shift types or no roles).
export const normalizeSetup = (value) => {
  if (!isPlainObject(value)) {
    return null;
  }

  const shiftTypes = [];

  (Array.isArray(value.shift_types) ? value.shift_types : []).forEach((entry) => {
    const label = cleanLabel(entry?.label);

    if (label && !shiftTypes.some((shift) => shift.label === label)) {
      shiftTypes.push({ label, start_time: cleanTime(entry.start_time), end_time: cleanTime(entry.end_time) });
    }
  });

  const teamRoles = unique((Array.isArray(value.team_roles) ? value.team_roles : []).map(cleanLabel).filter(Boolean));

  if (shiftTypes.length === 0 || teamRoles.length === 0) {
    return null;
  }

  const hoursByDay = {};

  (Array.isArray(value.operating_hours) ? value.operating_hours : []).forEach((entry) => {
    if (DAYS.includes(entry?.day)) {
      hoursByDay[entry.day] = entry;
    }
  });

  const operatingHours = DAYS.map((day) => {
    const isOpen = hoursByDay[day]?.is_open === true;

    return {
      day,
      is_open: isOpen,
      open_time: isOpen ? cleanTime(hoursByDay[day].open_time) : null,
      close_time: isOpen ? cleanTime(hoursByDay[day].close_time) : null,
    };
  });

  const shiftLabels = shiftTypes.map((shift) => shift.label);
  const coverage = [];

  (Array.isArray(value.coverage) ? value.coverage : []).forEach((entry) => {
    const role = cleanLabel(entry?.role);
    const shiftLabel = cleanLabel(entry?.shift_label);

    if (teamRoles.includes(role) && shiftLabels.includes(shiftLabel)) {
      coverage.push({ role, shift_label: shiftLabel, count: cleanCount(entry.count) });
    }
  });

  return {
    week_starts_on: DAYS.includes(value.week_starts_on) ? value.week_starts_on : null,
    shift_types: shiftTypes,
    team_roles: teamRoles,
    operating_hours: operatingHours,
    coverage,
    summary: typeof value.summary === 'string' ? value.summary.trim().slice(0, MAX_NOTES_LENGTH) : '',
  };
};

export const SCHEDULE_LIMITS = {
  days: 7,
  shiftTypes: 12,
  employees: 200,
  assignments: 3000,
};

const cleanPicks = (list, { employeeIds, days, shiftTypes }) => {
  const seen = new Set();
  const picks = [];

  list.forEach((entry) => {
    if (!isPlainObject(entry) || !employeeIds.has(entry.employee_id) || !days.includes(entry.day) || !shiftTypes.includes(entry.shift)) {
      return;
    }

    const key = `${entry.employee_id}|${entry.day}|${entry.shift}`;

    if (!seen.has(key)) {
      seen.add(key);
      picks.push({ employee_id: entry.employee_id, day: entry.day, shift: entry.shift });
    }
  });

  return picks;
};

// build-schedule request body → a bounded payload holding only the fields
// the prompt uses. Returns `{ ok: true, payload }` or `{ ok: false, error }`.
export const normalizeScheduleRequest = (body) => {
  const invalid = (error) => ({ ok: false, error });
  const role = cleanLabel(body?.role);

  if (!role || !Array.isArray(body.days) || !Array.isArray(body.shift_types) || !Array.isArray(body.employees) || !isPlainObject(body.requirements)) {
    return invalid('role, days, shift_types, employees and requirements are required');
  }

  const days = unique(body.days.filter((day) => DAYS.includes(day)));
  const shiftTypes = unique(body.shift_types.map(cleanLabel).filter(Boolean));

  if (days.length === 0 || shiftTypes.length === 0) {
    return invalid('At least one open day and one shift type are required');
  }

  if (shiftTypes.length > SCHEDULE_LIMITS.shiftTypes) {
    return invalid(`At most ${SCHEDULE_LIMITS.shiftTypes} shift types are supported`);
  }

  if (body.employees.length > SCHEDULE_LIMITS.employees) {
    return invalid(`At most ${SCHEDULE_LIMITS.employees} people can be scheduled for one role at a time`);
  }

  const existingInput = body.existing_assignments ?? [];
  const lastWeekInput = body.last_week ?? null;

  if (!Array.isArray(existingInput) || (lastWeekInput !== null && !Array.isArray(lastWeekInput))) {
    return invalid('existing_assignments and last_week must be lists');
  }

  if (existingInput.length > SCHEDULE_LIMITS.assignments || (lastWeekInput?.length ?? 0) > SCHEDULE_LIMITS.assignments) {
    return invalid('Too many assignments in the request');
  }

  const employees = [];
  const employeeIds = new Set();

  body.employees.forEach((employee) => {
    const id = typeof employee?.id === 'string' ? employee.id.trim().slice(0, MAX_LABEL_LENGTH) : '';

    if (!id || employeeIds.has(id)) {
      return;
    }

    employeeIds.add(id);

    const cap = Number(employee.shifts_per_week);

    employees.push({
      id,
      name: cleanLabel(employee.name),
      shifts_per_week: Number.isFinite(cap) ? cleanCount(cap, days.length * shiftTypes.length) : null,
      availability: Object.fromEntries(days.map((day) => {
        const shifts = isPlainObject(employee.availability) ? employee.availability[day] : null;

        return [day, Array.isArray(shifts) ? unique(shifts.filter((shift) => shiftTypes.includes(shift))) : []];
      })),
    });
  });

  const requirements = Object.fromEntries(days.map((day) => [
    day,
    Object.fromEntries(shiftTypes.map((shift) => [
      shift,
      cleanCount(isPlainObject(body.requirements[day]) ? body.requirements[day][shift] : 0),
    ])),
  ]));

  const context = { employeeIds, days, shiftTypes };

  return {
    ok: true,
    payload: {
      role,
      week_label: cleanLabel(body.week_label) || null,
      days,
      shift_types: shiftTypes,
      employees,
      requirements,
      // Other roles' shifts keep their role label so the model can tell
      // them apart from this role's own picks.
      existing_assignments: existingInput
        .filter((entry) => isPlainObject(entry) && employeeIds.has(entry.employee_id) && days.includes(entry.day) && shiftTypes.includes(entry.shift))
        .map((entry) => ({ employee_id: entry.employee_id, day: entry.day, shift: entry.shift, role: cleanLabel(entry.role) || null })),
      last_week: lastWeekInput === null ? null : cleanPicks(lastWeekInput, context),
    },
  };
};

// build-schedule output → picks limited to the ids, days and shift labels
// that were actually sent. Returns null when the response has no
// assignments list at all; `dropped` counts picks the model invented.
export const normalizeDraft = (value, payload) => {
  if (!isPlainObject(value) || !Array.isArray(value.assignments)) {
    return null;
  }

  const assignments = cleanPicks(value.assignments, {
    employeeIds: new Set(payload.employees.map((employee) => employee.id)),
    days: payload.days,
    shiftTypes: payload.shift_types,
  });

  return {
    assignments,
    notes: typeof value.notes === 'string' ? value.notes.trim().slice(0, MAX_NOTES_LENGTH) : '',
    dropped: value.assignments.length - assignments.length,
  };
};
