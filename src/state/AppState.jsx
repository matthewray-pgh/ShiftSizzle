import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from "react";

import { useAuth } from "./AuthState";
import { buildScheduleRecordId } from "./scheduleRecordId";
import {
  fetchOrgBundle,
  subscribeToOrgChanges,
  updateOrganizationSettings,
  upsertAvailabilityRow,
  upsertEmployeeRow,
  upsertScheduleRecordRow,
} from "./supabaseSync";

const AUTOSAVE_DEBOUNCE_MS = 2000;
// How long to wait after the last local edit before pushing it to Supabase.
// One debounce covers every mutation uniformly (a single employee edit and a
// burst of assignment-cell clicks alike) rather than tuning per action type.
const SYNC_DEBOUNCE_MS = 800;

export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const BASE_SHIFT_TYPES = ["Open", "Mid", "Close"];

export const BASE_TEAM_ROLES = Object.freeze({
  MANAGER: "Manager",
  SERVER: "Server",
  HOST: "Host",
  BARTENDER: "Bartender",
  COOK: "Cook",
});

const DEFAULT_SHIFTS_PER_WEEK = 5;
const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const YEAR_FORMATTER = new Intl.DateTimeFormat("en-US", { year: "numeric" });
// Blank until the owner configures them in Settings — a new org shouldn't
// silently inherit guessed hours it never confirmed.
const DEFAULT_OPERATING_HOURS = Object.fromEntries(
  DAYS.map((day) => [
    day,
    {
      isOpen: false,
      openTime: "",
      closeTime: "",
    },
  ])
);

const getUniqueValues = (values = []) => {
  const normalizedValues = values
    .map((value) => `${value ?? ""}`.trim())
    .filter(Boolean);

  return Array.from(new Set(normalizedValues));
};

export const getShiftTypes = (settings = {}) => {
  const configuredShiftTypes = getUniqueValues(settings.shiftTypes);

  return configuredShiftTypes.length ? configuredShiftTypes : [...BASE_SHIFT_TYPES];
};

export const getTeamRoles = (settings = {}, employees = []) => getUniqueValues([
  ...Object.values(BASE_TEAM_ROLES),
  ...(settings.additionalTeamRoles ?? []),
  ...employees.flatMap((employee) => employee.roles ?? []),
]);

const createAvailability = (allowedShifts = BASE_SHIFT_TYPES) =>
  Object.fromEntries(DAYS.map((day) => [day, [...allowedShifts]]));

const createEmptyRequirements = (shiftTypes = BASE_SHIFT_TYPES) =>
  Object.fromEntries(
    DAYS.map((day) => [
      day,
      Object.fromEntries(shiftTypes.map((shift) => [shift, 0])),
    ])
  );

const getDayIndex = (day) => DAYS.indexOf(day);

const getWeekEndDay = (weekStartsOn) => {
  const startIndex = getDayIndex(weekStartsOn);

  if (startIndex === -1) {
    return "";
  }

  return DAYS[(startIndex + 6) % DAYS.length];
};

const getDateFromISO = (value) => {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);

  return Number.isNaN(date.getTime()) ? null : date;
};

const formatISODate = (date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const buildWeekRange = (startDateValue, weekStartsOn) => {
  const startDate = getDateFromISO(startDateValue);

  if (!startDate || !weekStartsOn) {
    return { startDate: "", endDate: "", weekLabel: "" };
  }

  const expectedStartIndex = getDayIndex(weekStartsOn);

  if (expectedStartIndex === -1 || DAYS[startDate.getDay()] !== weekStartsOn) {
    return { startDate: startDateValue, endDate: "", weekLabel: "" };
  }

  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);

  return {
    startDate: startDateValue,
    endDate: formatISODate(endDate),
    weekLabel: `${DATE_FORMATTER.format(startDate)} - ${DATE_FORMATTER.format(endDate)}, ${YEAR_FORMATTER.format(endDate)}`,
  };
};

// Finds the start date of the week containing referenceDate, given which
// day of the week schedules start on — used to find "this week" regardless
// of which week happens to be loaded live in the Scheduler canvas.
export const getCurrentWeekStartDate = (weekStartsOn, referenceDate = new Date()) => {
  const startIndex = getDayIndex(weekStartsOn);

  if (startIndex === -1) {
    return "";
  }

  const diff = (referenceDate.getDay() - startIndex + 7) % 7;
  const start = new Date(referenceDate);
  start.setDate(referenceDate.getDate() - diff);

  return formatISODate(start);
};

const inferWeekStartsOn = (settings = {}, schedule = {}) => {
  if (DAYS.includes(settings.weekStartsOn)) {
    return settings.weekStartsOn;
  }

  const startDate = getDateFromISO(schedule.startDate);

  return startDate ? DAYS[startDate.getDay()] : "";
};

const normalizeAvailability = (availability = {}, shiftTypes = BASE_SHIFT_TYPES) =>
  Object.fromEntries(
    DAYS.map((day) => {
      const currentAvailability = availability?.[day];

      if (!Array.isArray(currentAvailability)) {
        return [day, [...shiftTypes]];
      }

      return [day, getUniqueValues(currentAvailability).filter((shift) => shiftTypes.includes(shift))];
    })
  );

const normalizeRequirements = (
  requirements = {},
  shiftTypes = BASE_SHIFT_TYPES,
  operatingHours = normalizeOperatingHours()
) =>
  Object.fromEntries(
    DAYS.map((day) => [
      day,
      Object.fromEntries(
        shiftTypes.map((shift) => [
          shift,
          operatingHours[day]?.isOpen ? Math.max(0, Number(requirements?.[day]?.[shift]) || 0) : 0,
        ])
      ),
    ])
  );

const normalizeRoleRequirements = (
  roleRequirements = {},
  teamRoles = [],
  shiftTypes = BASE_SHIFT_TYPES,
  operatingHours = normalizeOperatingHours()
) =>
  Object.fromEntries(
    teamRoles.map((role) => [
      role,
      normalizeRequirements(roleRequirements?.[role] ?? createEmptyRequirements(shiftTypes), shiftTypes, operatingHours),
    ])
  );

// Normalizes ONE role's assignment bucket: { [employeeId]: { [day]: [shift, ...] } }.
const normalizeRoleAssignments = (
  assignments = {},
  employees = [],
  shiftTypes = BASE_SHIFT_TYPES,
  operatingHours = normalizeOperatingHours()
) =>
  Object.fromEntries(
    employees.map((employee) => [
      employee.id,
      Object.fromEntries(
        DAYS.map((day) => [
          day,
          operatingHours[day]?.isOpen
            ? getUniqueValues(assignments?.[employee.id]?.[day] ?? []).filter((shift) => shiftTypes.includes(shift))
            : [],
        ])
      ),
    ])
  );

// Normalizes the full role-partitioned structure: { [role]: <role bucket> }.
// A scheduled shift always belongs to exactly one role's bucket — this is
// what lets an employee hold multiple roles without one shift silently
// counting toward more than one role's coverage.
const normalizeAssignments = (
  assignments = {},
  employees = [],
  teamRoles = [],
  shiftTypes = BASE_SHIFT_TYPES,
  operatingHours = normalizeOperatingHours()
) =>
  Object.fromEntries(
    teamRoles.map((role) => [
      role,
      normalizeRoleAssignments(assignments?.[role], employees, shiftTypes, operatingHours),
    ])
  );

const createEmptyRoleAssignments = (
  employees = [],
  operatingHours = normalizeOperatingHours()
) =>
  Object.fromEntries(
    employees.map((employee) => [
      employee.id,
      Object.fromEntries(
        DAYS.map((day) => [day, operatingHours[day]?.isOpen ? [] : []])
      ),
    ])
  );

const createEmptyAssignments = (
  employees = [],
  teamRoles = [],
  operatingHours = normalizeOperatingHours()
) =>
  Object.fromEntries(teamRoles.map((role) => [role, createEmptyRoleAssignments(employees, operatingHours)]));

// Replaces one role's assignment bucket wholesale — every other role's
// bucket is untouched, since each role's schedule lives independently now.
const setAssignmentsForRole = (
  assignments = {},
  role = "",
  employees = [],
  nextRoleAssignments = {},
  shiftTypes = BASE_SHIFT_TYPES,
  operatingHours = normalizeOperatingHours()
) => ({
  ...assignments,
  [role]: normalizeRoleAssignments(nextRoleAssignments, employees, shiftTypes, operatingHours),
});

const normalizeShiftsPerWeek = (employee = {}) => {
  const configuredShifts = Number(employee.shiftsPerWeek);

  if (Number.isFinite(configuredShifts)) {
    return Math.max(0, Math.round(configuredShifts));
  }

  const legacyPreferredHours = Number(employee.preferredHours);

  if (Number.isFinite(legacyPreferredHours) && legacyPreferredHours > 0) {
    return Math.max(1, Math.round(legacyPreferredHours / 8));
  }

  return DEFAULT_SHIFTS_PER_WEEK;
};

// Accepts either shape: a new-style `roles` array, or a legacy single
// `role` string (migrated to a one-item array).
const normalizeRoles = (employee = {}) => {
  if (Array.isArray(employee.roles) && employee.roles.length) {
    return getUniqueValues(employee.roles);
  }

  if (employee.role) {
    return [employee.role];
  }

  return [BASE_TEAM_ROLES.MANAGER];
};

const normalizeEmployee = (employee, shiftTypes = BASE_SHIFT_TYPES) => {
  const { role: _legacyRole, ...rest } = employee;

  return {
    ...rest,
    roles: normalizeRoles(employee),
    status: employee.status ?? "active",
    shiftsPerWeek: normalizeShiftsPerWeek(employee),
    availability: normalizeAvailability(employee.availability, shiftTypes),
  };
};

export const normalizeOperatingHours = (operatingHours = {}) =>
  Object.fromEntries(
    DAYS.map((day) => {
      const defaultHours = DEFAULT_OPERATING_HOURS[day];
      const configuredHours = operatingHours?.[day] ?? {};

      return [
        day,
        {
          isOpen: configuredHours.isOpen ?? defaultHours.isOpen,
          openTime: typeof configuredHours.openTime === "string" && configuredHours.openTime ? configuredHours.openTime : defaultHours.openTime,
          closeTime: typeof configuredHours.closeTime === "string" && configuredHours.closeTime ? configuredHours.closeTime : defaultHours.closeTime,
        },
      ];
    })
  );

export const getOpenDays = (settings = {}) => {
  const operatingHours = normalizeOperatingHours(settings.operatingHours);

  return DAYS.filter((day) => operatingHours[day]?.isOpen);
};

// Sums one employee's assigned shifts across EVERY role bucket — a
// person's shiftsPerWeek cap is a total across all roles they work, not
// per-role.
const countAssignedShiftsForEmployee = (allAssignments = {}, employeeId, operatingHours = normalizeOperatingHours()) =>
  Object.values(allAssignments).reduce(
    (total, roleBucket) =>
      total + DAYS.reduce((dayTotal, day) => {
        if (!operatingHours[day]?.isOpen) {
          return dayTotal;
        }

        return dayTotal + ((roleBucket[employeeId]?.[day] ?? []).length);
      }, 0),
    0
  );

const buildAssignments = (
  employees,
  role,
  requirements,
  allAssignments = {},
  shiftTypes = BASE_SHIFT_TYPES,
  operatingHours = normalizeOperatingHours()
) => {
  const assignments = Object.fromEntries(employees.map((employee) => [employee.id, {}]));
  const eligibleEmployees = employees.filter(
    (employee) => employee.roles.includes(role) && employee.status !== "archived"
  );

  if (!eligibleEmployees.length) {
    return assignments;
  }

  // Everything scheduled under OTHER roles this week — used so auto-build
  // respects an employee's cross-role shift cap and never double-books the
  // same day+shift under two roles at once.
  const otherRolesAssignments = Object.fromEntries(
    Object.entries(allAssignments).filter(([otherRole]) => otherRole !== role)
  );

  let index = 0;
  const openDays = DAYS.filter((day) => operatingHours[day]?.isOpen);

  openDays.forEach((day) => {
    shiftTypes.forEach((shift) => {
      const needed = requirements[day]?.[shift] ?? 0;
      let attempts = 0;
      let filled = 0;

      while (filled < needed && attempts < eligibleEmployees.length * 3) {
        const candidate = eligibleEmployees[index % eligibleEmployees.length];
        index += 1;
        attempts += 1;

        const availableShifts = candidate.availability?.[day] ?? [];
        const hasShiftAlready = assignments[candidate.id][day]?.includes(shift);
        const isDoubleBookedElsewhere = Object.values(otherRolesAssignments).some(
          (bucket) => (bucket[candidate.id]?.[day] ?? []).includes(shift)
        );
        const assignedThisRole = openDays.reduce(
          (total, openDay) => total + ((assignments[candidate.id][openDay] ?? []).length),
          0,
        );
        const assignedOtherRoles = countAssignedShiftsForEmployee(otherRolesAssignments, candidate.id, operatingHours);
        const maxShiftsPerWeek = normalizeShiftsPerWeek(candidate);

        if (
          !availableShifts.includes(shift)
          || hasShiftAlready
          || isDoubleBookedElsewhere
          || (assignedThisRole + assignedOtherRoles) >= maxShiftsPerWeek
        ) {
          continue;
        }

        assignments[candidate.id][day] = [...(assignments[candidate.id][day] ?? []), shift];
        filled += 1;
      }
    });
  });

  return assignments;
};

export const calculateScheduleReview = ({
  assignments = {},
  allAssignments = assignments,
  requirements = {},
  employees = [],
  selectedRole = "",
  shiftTypes = BASE_SHIFT_TYPES,
  operatingHours = normalizeOperatingHours(),
}) => {
  const roleEmployees = employees.filter(
    (employee) => employee.status !== "archived" && employee.roles.includes(selectedRole)
  );
  const openDays = DAYS.filter((day) => operatingHours[day]?.isOpen);

  const coverageGaps = openDays.flatMap((day) =>
    shiftTypes.flatMap((shift) => {
      const required = requirements?.[day]?.[shift] ?? 0;
      const assigned = roleEmployees.reduce(
        (count, employee) => count + ((assignments[employee.id]?.[day] ?? []).includes(shift) ? 1 : 0),
        0,
      );

      return assigned >= required
        ? []
        : [{ day, shift, open: required - assigned, required, assigned }];
    })
  );

  const shiftCapAlerts = roleEmployees
    .map((employee) => {
      const assigned = countAssignedShiftsForEmployee(allAssignments, employee.id, operatingHours);
      const maxShifts = normalizeShiftsPerWeek(employee);

      return assigned > maxShifts
        ? {
          employeeId: employee.id,
          employeeName: employee.name,
          assigned,
          maxShifts,
        }
        : null;
    })
    .filter(Boolean);

  const requiredSlots = openDays.reduce(
    (total, day) => total + shiftTypes.reduce((dayTotal, shift) => dayTotal + (requirements?.[day]?.[shift] ?? 0), 0),
    0,
  );
  const openSlots = coverageGaps.reduce((total, gap) => total + gap.open, 0);
  const assignedSlots = requiredSlots - openSlots;

  return {
    coverageGaps,
    shiftCapAlerts,
    metrics: {
      requiredSlots,
      assignedSlots,
      openSlots,
      roleEmployeeCount: roleEmployees.length,
      unresolvedIssueCount: coverageGaps.length + shiftCapAlerts.length,
    },
  };
};

const upsertScheduleRecord = (schedules = [], nextRecord) => {
  const existingIndex = schedules.findIndex((entry) => entry.id === nextRecord.id);

  if (existingIndex === -1) {
    return [{ ...nextRecord, createdAt: nextRecord.createdAt || nextRecord.savedAt }, ...schedules];
  }

  return schedules.map((entry, index) => (
    index === existingIndex ? { ...entry, ...nextRecord, createdAt: entry.createdAt } : entry
  ));
};

const buildScheduleRecordFromLiveSchedule = (schedule, role, employees, settings, status, timestamp, existingRecord = null) => {
  const shiftTypes = getShiftTypes(settings);
  const operatingHours = normalizeOperatingHours(settings.operatingHours);
  const requirements = schedule.roleRequirements?.[role] ?? {};
  const roleAssignments = schedule.assignments?.[role] ?? {};
  const review = calculateScheduleReview({
    assignments: roleAssignments,
    allAssignments: schedule.assignments,
    requirements,
    employees,
    selectedRole: role,
    shiftTypes,
    operatingHours,
  });

  return {
    id: buildScheduleRecordId(schedule.startDate, role),
    weekLabel: schedule.weekLabel,
    startDate: schedule.startDate,
    endDate: schedule.endDate,
    role,
    status,
    requirements,
    assignments: roleAssignments,
    notes: schedule.notes,
    savedAt: timestamp,
    publishedAt: status === "published" ? timestamp : (existingRecord?.publishedAt ?? null),
    ...review,
  };
};

// A role "has signal" for a given week when there's either real demand entered
// or at least one assignment made — used to decide which roles get their own
// saved/published record so untouched roles don't clutter Schedule history.
const recordHasSignal = (entry = {}) => {
  const hasRequirement = Object.values(entry.requirements ?? {}).some((dayRequirements) =>
    Object.values(dayRequirements ?? {}).some((requiredCount) => Number(requiredCount) > 0)
  );

  if (hasRequirement) {
    return true;
  }

  return Object.values(entry.assignments ?? {}).some((employeeAssignments) =>
    Object.values(employeeAssignments ?? {}).some((assignedShifts) => (assignedShifts ?? []).length > 0)
  );
};

export const getRolesWithSignal = (state, teamRoles) =>
  teamRoles.filter((role) => {
    const requirements = state.schedule.roleRequirements?.[role] ?? {};
    const hasRequirement = Object.values(requirements).some((dayRequirements) =>
      Object.values(dayRequirements ?? {}).some((requiredCount) => Number(requiredCount) > 0)
    );

    if (hasRequirement) {
      return true;
    }

    const roleBucket = state.schedule.assignments?.[role] ?? {};

    return Object.values(roleBucket).some((employeeDays) =>
      Object.values(employeeDays ?? {}).some((shifts) => (shifts ?? []).length > 0)
    );
  });

export const computeWeekCoverage = (state, teamRoles) => {
  const shiftTypes = getShiftTypes(state.settings);
  const operatingHours = normalizeOperatingHours(state.settings.operatingHours);
  const rolesWithSignal = getRolesWithSignal(state, teamRoles);

  return rolesWithSignal.reduce((totals, role) => {
    const review = calculateScheduleReview({
      assignments: state.schedule.assignments?.[role] ?? {},
      allAssignments: state.schedule.assignments,
      requirements: state.schedule.roleRequirements?.[role] ?? {},
      employees: state.employees,
      selectedRole: role,
      shiftTypes,
      operatingHours,
    });

    return {
      totalRequired: totals.totalRequired + review.metrics.requiredSlots,
      totalOpen: totals.totalOpen + review.metrics.openSlots,
    };
  }, { totalRequired: 0, totalOpen: 0 });
};

// Collapses every saved/published record for a week into the single set of
// week-level fields the live canvas needs (status, notes, timestamps).
const summarizeWeekRecords = (recordsForWeek = []) => {
  const timeOf = (entry) => Math.max(
    entry.savedAt ? new Date(entry.savedAt).getTime() : 0,
    entry.publishedAt ? new Date(entry.publishedAt).getTime() : 0,
  );
  const mostRecent = recordsForWeek.reduce(
    (latest, entry) => (!latest || timeOf(entry) > timeOf(latest) ? entry : latest),
    null,
  );
  const lastSavedAt = recordsForWeek.reduce((max, entry) => (
    entry.savedAt && (!max || new Date(entry.savedAt) > new Date(max)) ? entry.savedAt : max
  ), null);
  const lastPublishedAt = recordsForWeek.reduce((max, entry) => (
    entry.publishedAt && (!max || new Date(entry.publishedAt) > new Date(max)) ? entry.publishedAt : max
  ), null);
  const signalRecords = recordsForWeek.filter(recordHasSignal);
  const status = signalRecords.length > 0 && signalRecords.every((entry) => entry.status === "published")
    ? "published"
    : "draft";

  return {
    status,
    notes: mostRecent?.notes ?? "",
    lastSavedAt,
    lastPublishedAt,
  };
};

const hydrateScheduleForWeek = (state, startDate) => {
  const shiftTypes = getShiftTypes(state.settings);
  const operatingHours = normalizeOperatingHours(state.settings.operatingHours);
  const teamRoles = getTeamRoles(state.settings, state.employees);
  const recordsForWeek = startDate
    ? state.schedules.filter((entry) => entry.startDate === startDate)
    : [];
  const recordsByRole = Object.fromEntries(recordsForWeek.map((entry) => [entry.role, entry]));
  const roleRequirements = normalizeRoleRequirements(
    Object.fromEntries(recordsForWeek.map((entry) => [entry.role, entry.requirements])),
    teamRoles,
    shiftTypes,
    operatingHours
  );
  // Each role's bucket now maps 1:1 to its own saved record for this week —
  // no merge needed, unlike the old flat/shared assignments shape.
  const assignments = Object.fromEntries(teamRoles.map((role) => [
    role,
    normalizeRoleAssignments(recordsByRole[role]?.assignments ?? {}, state.employees, shiftTypes, operatingHours),
  ]));
  const summary = summarizeWeekRecords(recordsForWeek);

  return {
    hasUnsavedChanges: false,
    status: summary.status,
    notes: summary.notes,
    lastSavedAt: summary.lastSavedAt,
    lastPublishedAt: summary.lastPublishedAt,
    roleRequirements,
    assignments,
  };
};

// Read-only view of a given week's requirements/assignments/status, built
// straight from saved history (schedules[]) rather than the live editing
// canvas — lets other views (e.g. Dashboard) show "this week" without
// depending on, or disturbing, whatever week is currently being edited.
export const getWeekView = (state, startDate) => {
  const weekRange = buildWeekRange(startDate, state.settings.weekStartsOn);

  return {
    ...weekRange,
    ...hydrateScheduleForWeek(state, weekRange.startDate),
  };
};

const applyWeekContext = (state, startDate) => ({
  ...state,
  schedule: {
    ...state.schedule,
    ...getWeekView(state, startDate),
  },
});

const hasScheduleDraftProgress = (schedule = {}) => {
  const hasRequirements = Object.values(schedule.roleRequirements ?? {}).some((grid) =>
    Object.values(grid ?? {}).some((dayRequirements) =>
      Object.values(dayRequirements ?? {}).some((requiredCount) => Number(requiredCount) > 0)
    )
  );
  const hasAssignments = Object.values(schedule.assignments ?? {}).some((roleBucket) =>
    Object.values(roleBucket ?? {}).some((employeeDays) =>
      Object.values(employeeDays ?? {}).some((assignedShifts) => (assignedShifts ?? []).length > 0)
    )
  );

  return Boolean(
    schedule.weekLabel
    || schedule.startDate
    || schedule.endDate
    || schedule.notes
    || hasRequirements
    || hasAssignments
  );
};

const createDefaultSchedule = (
  employees = [],
  shiftTypes = BASE_SHIFT_TYPES,
  teamRoles = Object.values(BASE_TEAM_ROLES),
  operatingHours = normalizeOperatingHours()
) => {
  const emptyRequirements = normalizeRequirements(createEmptyRequirements(shiftTypes), shiftTypes, operatingHours);

  return {
    weekLabel: "",
    startDate: "",
    endDate: "",
    status: "draft",
    roleRequirements: Object.fromEntries(teamRoles.map((role) => [role, emptyRequirements])),
    assignments: createEmptyAssignments(employees, teamRoles, operatingHours),
    notes: "",
    lastSavedAt: null,
    lastPublishedAt: null,
    hasUnsavedChanges: false,
  };
};

const createDefaultState = () => {
  const settings = {
    businessName: "ShiftSizzle",
    locationName: "",
    schedulerName: "",
    publishNotifications: true,
    shiftTypes: [...BASE_SHIFT_TYPES],
    additionalTeamRoles: [],
    weekStartsOn: "",
    operatingHours: normalizeOperatingHours(),
  };

  return {
    settings,
    employees: [],
    schedule: createDefaultSchedule([], BASE_SHIFT_TYPES, getTeamRoles(settings, []), normalizeOperatingHours()),
    schedules: [],
    // False until the first HYDRATE_FROM_SERVER — lets consumers (and
    // tests) tell "org data hasn't loaded yet" apart from "this org
    // genuinely has zero employees/schedules".
    isHydrated: false,
  };
};

const normalizeSettings = (settings = {}, schedule = {}) => {
  const normalizedSettings = {
    ...createDefaultState().settings,
    ...settings,
  };

  return {
    ...normalizedSettings,
    shiftTypes: getShiftTypes(normalizedSettings),
    additionalTeamRoles: getUniqueValues(normalizedSettings.additionalTeamRoles).filter(
      (role) => !Object.values(BASE_TEAM_ROLES).includes(role)
    ),
    weekStartsOn: inferWeekStartsOn(normalizedSettings, schedule),
    operatingHours: normalizeOperatingHours(normalizedSettings.operatingHours),
  };
};

// A pre-multi-role save has `schedule.assignments` keyed directly by
// employee id (flat), not by role — none of those keys will match a team
// role name. Detecting that shape lets us tell old data apart from the new
// role-partitioned shape without a version flag.
const isLegacyFlatAssignments = (assignments = {}, teamRoles = []) => {
  const keys = Object.keys(assignments);

  return keys.length > 0 && keys.every((key) => !teamRoles.includes(key));
};

const normalizeSchedule = (schedule = {}, employees = [], settings = {}) => {
  const shiftTypes = getShiftTypes(settings);
  const teamRoles = getTeamRoles(settings, employees);
  const operatingHours = normalizeOperatingHours(settings.operatingHours);
  const roleRequirements = normalizeRoleRequirements(schedule.roleRequirements, teamRoles, shiftTypes, operatingHours);
  // Legacy flat (pre-multi-role) live-canvas assignments can't be mapped to
  // a role unambiguously here without also knowing each employee's old
  // single role; the durable schedules[] history (unaffected by this) is
  // what matters most, so an old flat live canvas just resets to empty
  // rather than carrying stale, misattributed data forward.
  const rawAssignments = isLegacyFlatAssignments(schedule.assignments, teamRoles) ? {} : schedule.assignments;
  const assignments = normalizeAssignments(rawAssignments, employees, teamRoles, shiftTypes, operatingHours);
  const lastSavedAt = typeof schedule.lastSavedAt === "string" && schedule.lastSavedAt
    ? schedule.lastSavedAt
    : schedule.status === "published" || Boolean(schedule.lastPublishedAt)
      ? schedule.lastPublishedAt
      : null;
  const {
    publishHistory: _legacyPublishHistory,
    selectedRole: _legacySelectedRole,
    requirements: _legacyRequirements,
    ...restSchedule
  } = schedule;

  return {
    ...createDefaultSchedule(employees, shiftTypes, teamRoles, operatingHours),
    ...restSchedule,
    lastSavedAt,
    hasUnsavedChanges: typeof schedule.hasUnsavedChanges === "boolean"
      ? schedule.hasUnsavedChanges
      : Boolean(hasScheduleDraftProgress(schedule) && !lastSavedAt),
    roleRequirements,
    assignments,
  };
};

const AppStateContext = createContext(null);

const appStateReducer = (state, action) => {
  switch (action.type) {
    case "UPSERT_EMPLOYEE": {
      const shiftTypes = getShiftTypes(state.settings);
      const employee = {
        ...action.payload,
        availability: normalizeAvailability(action.payload.availability ?? createAvailability(shiftTypes), shiftTypes),
        status: action.payload.status ?? "active",
      };
      const employeeExists = state.employees.some((currentEmployee) => currentEmployee.id === employee.id);
      const employees = employeeExists
        ? state.employees.map((currentEmployee) =>
            currentEmployee.id === employee.id ? employee : currentEmployee
          )
        : [...state.employees, employee];

      return {
        ...state,
        employees,
      };
    }
    case "ARCHIVE_EMPLOYEE": {
      return {
        ...state,
        employees: state.employees.map((employee) =>
          employee.id === action.payload ? { ...employee, status: "archived" } : employee
        ),
      };
    }
    case "REACTIVATE_EMPLOYEE": {
      return {
        ...state,
        employees: state.employees.map((employee) =>
          employee.id === action.payload ? { ...employee, status: "active" } : employee
        ),
      };
    }
    case "IMPORT_EMPLOYEES": {
      const shiftTypes = getShiftTypes(state.settings);
      const employees = action.payload.reduce((nextEmployees, employee) => {
        const normalizedEmployee = normalizeEmployee({
          ...employee,
          id: employee.id ?? crypto.randomUUID(),
          availability: employee.availability ?? createAvailability(shiftTypes),
          status: employee.status ?? "active",
        }, shiftTypes);
        const existingEmployeeIndex = nextEmployees.findIndex((currentEmployee) => currentEmployee.id === normalizedEmployee.id);

        if (existingEmployeeIndex === -1) {
          return [...nextEmployees, normalizedEmployee];
        }

        return nextEmployees.map((currentEmployee, index) => (
          index === existingEmployeeIndex ? normalizedEmployee : currentEmployee
        ));
      }, state.employees);

      return {
        ...state,
        employees,
      };
    }
    case "UPDATE_SETTINGS": {
      const settings = normalizeSettings({
        ...state.settings,
        ...action.payload,
      });
      const shiftTypes = getShiftTypes(settings);
      const operatingHours = normalizeOperatingHours(settings.operatingHours);
      const employees = state.employees.map((employee) => normalizeEmployee(employee, shiftTypes));
      const teamRoles = getTeamRoles(settings, employees);
      const weekRange = buildWeekRange(state.schedule.startDate, settings.weekStartsOn);
      const roleRequirements = normalizeRoleRequirements(state.schedule.roleRequirements, teamRoles, shiftTypes, operatingHours);
      const assignments = normalizeAssignments(state.schedule.assignments, employees, teamRoles, shiftTypes, operatingHours);
      const invalidatesDraft = ["shiftTypes", "additionalTeamRoles", "operatingHours", "weekStartsOn"]
        .some((key) => key in action.payload);
      const draftResetFields = invalidatesDraft
        ? { hasUnsavedChanges: true, status: "draft" }
        : {};

      return {
        ...state,
        settings,
        employees,
        schedule: {
          ...state.schedule,
          ...weekRange,
          roleRequirements,
          assignments,
          ...draftResetFields,
        },
      };
    }
    case "SELECT_WEEK": {
      return applyWeekContext(state, action.payload.startDate);
    }
    case "UPDATE_REQUIREMENTS": {
      const { role, day, shift, value } = action.payload;

      if (!role) {
        return state;
      }

      const shiftTypes = getShiftTypes(state.settings);
      const operatingHours = normalizeOperatingHours(state.settings.operatingHours);
      const currentGrid = state.schedule.roleRequirements[role] ?? createEmptyRequirements(shiftTypes);
      const nextGrid = normalizeRequirements(
        { ...currentGrid, [day]: { ...currentGrid[day], [shift]: value } },
        shiftTypes,
        operatingHours
      );

      return {
        ...state,
        schedule: {
          ...state.schedule,
          roleRequirements: { ...state.schedule.roleRequirements, [role]: nextGrid },
          hasUnsavedChanges: true,
          status: "draft",
        },
      };
    }
    case "APPLY_REQUIREMENTS_TO_ALL_DAYS": {
      const { role, sourceDay } = action.payload;

      if (!role) {
        return state;
      }

      const shiftTypes = getShiftTypes(state.settings);
      const operatingHours = normalizeOperatingHours(state.settings.operatingHours);
      const currentGrid = state.schedule.roleRequirements[role] ?? createEmptyRequirements(shiftTypes);
      const sourceRow = currentGrid[sourceDay] ?? {};
      const nextGrid = normalizeRequirements(
        Object.fromEntries(DAYS.map((day) => [day, { ...sourceRow }])),
        shiftTypes,
        operatingHours
      );

      return {
        ...state,
        schedule: {
          ...state.schedule,
          roleRequirements: { ...state.schedule.roleRequirements, [role]: nextGrid },
          hasUnsavedChanges: true,
          status: "draft",
        },
      };
    }
    case "TOGGLE_ASSIGNMENT": {
      const { employeeId, role, day, shift } = action.payload;
      const employee = state.employees.find((currentEmployee) => currentEmployee.id === employeeId);

      if (!employee || !role || !employee.roles.includes(role)) {
        return state;
      }

      const operatingHours = normalizeOperatingHours(state.settings.operatingHours);
      const allAssignments = state.schedule.assignments;
      const roleBucket = allAssignments[role] ?? {};
      const currentDayAssignments = roleBucket[employeeId]?.[day] ?? [];
      const hasAssignment = currentDayAssignments.includes(shift);

      if (!hasAssignment) {
        const isAvailable = (employee.availability?.[day] ?? []).includes(shift);
        const assignedShiftCount = countAssignedShiftsForEmployee(allAssignments, employeeId, operatingHours);
        const maxShiftsPerWeek = normalizeShiftsPerWeek(employee);
        // Can't work two roles' shifts at the same time — block scheduling
        // this employee under a different role for the same day+shift.
        const isDoubleBookedElsewhere = Object.entries(allAssignments).some(
          ([otherRole, bucket]) => otherRole !== role && (bucket[employeeId]?.[day] ?? []).includes(shift)
        );

        if (!isAvailable || assignedShiftCount >= maxShiftsPerWeek || isDoubleBookedElsewhere) {
          return state;
        }
      }

      const nextDayAssignments = hasAssignment
        ? currentDayAssignments.filter((currentShift) => currentShift !== shift)
        : [...currentDayAssignments, shift];

      return {
        ...state,
        schedule: {
          ...state.schedule,
          hasUnsavedChanges: true,
          status: "draft",
          assignments: {
            ...allAssignments,
            [role]: {
              ...roleBucket,
              [employeeId]: {
                ...(roleBucket[employeeId] ?? {}),
                [day]: nextDayAssignments,
              },
            },
          },
        },
      };
    }
    case "AUTO_BUILD_SCHEDULE": {
      const { role } = action.payload;
      const shiftTypes = getShiftTypes(state.settings);
      const operatingHours = normalizeOperatingHours(state.settings.operatingHours);
      const requirements = state.schedule.roleRequirements[role] ?? {};
      const hasCoverageTargets = Object.values(requirements).some((dayRequirements) =>
        Object.values(dayRequirements ?? {}).some((requiredCount) => Number(requiredCount) > 0)
      );

      if (!role || !state.schedule.startDate || !state.schedule.endDate || !hasCoverageTargets) {
        return state;
      }

      return {
        ...state,
        schedule: {
          ...state.schedule,
          hasUnsavedChanges: true,
          status: "draft",
          assignments: setAssignmentsForRole(
            state.schedule.assignments,
            role,
            state.employees,
            buildAssignments(state.employees, role, requirements, state.schedule.assignments, shiftTypes, operatingHours),
            shiftTypes,
            operatingHours
          ),
        },
      };
    }
    case "UPDATE_SCHEDULE_NOTES": {
      return {
        ...state,
        schedule: {
          ...state.schedule,
          hasUnsavedChanges: true,
          status: "draft",
          notes: action.payload,
        },
      };
    }
    case "SAVE_SCHEDULE_DRAFT": {
      const teamRoles = getTeamRoles(state.settings, state.employees);
      const rolesWithSignal = getRolesWithSignal(state, teamRoles);

      if (!state.schedule.hasUnsavedChanges || !rolesWithSignal.length) {
        return state;
      }

      const savedAt = new Date().toISOString();
      const schedules = rolesWithSignal.reduce((acc, role) => {
        const existingRecord = acc.find((entry) => entry.id === buildScheduleRecordId(state.schedule.startDate, role));

        return upsertScheduleRecord(
          acc,
          buildScheduleRecordFromLiveSchedule(state.schedule, role, state.employees, state.settings, "draft", savedAt, existingRecord)
        );
      }, state.schedules);

      return {
        ...state,
        schedules,
        schedule: {
          ...state.schedule,
          hasUnsavedChanges: false,
          status: "draft",
          lastSavedAt: savedAt,
        },
      };
    }
    case "PUBLISH_SCHEDULE": {
      const teamRoles = getTeamRoles(state.settings, state.employees);
      const rolesWithSignal = getRolesWithSignal(state, teamRoles);
      const { totalRequired, totalOpen } = computeWeekCoverage(state, teamRoles);

      if (!rolesWithSignal.length || totalRequired === 0 || totalOpen > 0) {
        return state;
      }

      const publishedAt = new Date().toISOString();
      const schedules = rolesWithSignal.reduce((acc, role) => {
        const existingRecord = acc.find((entry) => entry.id === buildScheduleRecordId(state.schedule.startDate, role));

        return upsertScheduleRecord(
          acc,
          buildScheduleRecordFromLiveSchedule(state.schedule, role, state.employees, state.settings, "published", publishedAt, existingRecord)
        );
      }, state.schedules);

      return {
        ...state,
        schedules,
        schedule: {
          ...state.schedule,
          hasUnsavedChanges: false,
          status: "published",
          lastSavedAt: publishedAt,
          lastPublishedAt: publishedAt,
        },
      };
    }
    case "RESET_WEEK_DRAFT": {
      const shiftTypes = getShiftTypes(state.settings);
      const operatingHours = normalizeOperatingHours(state.settings.operatingHours);
      const teamRoles = getTeamRoles(state.settings, state.employees);
      const emptyRequirements = normalizeRequirements(createEmptyRequirements(shiftTypes), shiftTypes, operatingHours);

      return {
        ...state,
        schedule: {
          ...state.schedule,
          roleRequirements: Object.fromEntries(teamRoles.map((role) => [role, emptyRequirements])),
          assignments: createEmptyAssignments(state.employees, teamRoles, operatingHours),
          notes: "",
          status: "draft",
          hasUnsavedChanges: false,
          lastSavedAt: null,
          lastPublishedAt: null,
        },
      };
    }
    // Replaces settings/employees/schedules wholesale with what was fetched
    // from Supabase for the current org, then rebuilds the live editing
    // canvas (schedule) for whichever week was already selected (or "this
    // week" on first load) from that data — mirrors what hydrateState used
    // to do from a localStorage blob, just sourced from the server instead.
    case "HYDRATE_FROM_SERVER": {
      const settings = normalizeSettings(action.payload.settings);
      const shiftTypes = getShiftTypes(settings);
      const employees = action.payload.employees.map((employee) => normalizeEmployee(employee, shiftTypes));
      const schedules = action.payload.schedules;
      const startDate = state.schedule.startDate || getCurrentWeekStartDate(settings.weekStartsOn);

      return applyWeekContext({ ...state, settings, employees, schedules, isHydrated: true }, startDate);
    }
    // Applies one incoming Realtime row (another session's edit) into local
    // state. `table`/`row` are already mapped to this file's camelCase shape
    // by supabaseSync before dispatch, so this stays free of column names.
    case "MERGE_SERVER_RECORD": {
      const { table, eventType, row } = action.payload;
      const shiftTypes = getShiftTypes(state.settings);

      if (table === "employees") {
        if (eventType === "DELETE") {
          return { ...state, employees: state.employees.filter((employee) => employee.id !== row.id) };
        }

        const existing = state.employees.find((employee) => employee.id === row.id);
        const merged = normalizeEmployee({ ...existing, ...row, availability: existing?.availability }, shiftTypes);
        const employees = existing
          ? state.employees.map((employee) => (employee.id === row.id ? merged : employee))
          : [...state.employees, merged];

        return { ...state, employees };
      }

      if (table === "employee_availability") {
        const employees = state.employees.map((employee) =>
          employee.id === row.employeeId
            ? { ...employee, availability: normalizeAvailability(row.availability, shiftTypes) }
            : employee
        );

        return { ...state, employees };
      }

      if (table === "schedule_records") {
        const schedules = eventType === "DELETE"
          ? state.schedules.filter((entry) => entry.id !== row.id)
          : upsertScheduleRecord(state.schedules, row);

        return applyWeekContext({ ...state, schedules }, state.schedule.startDate);
      }

      return state;
    }
    default:
      return state;
  }
};

export const AppStateProvider = ({ children }) => {
  const { membership } = useAuth();
  const orgId = membership?.orgId ?? null;
  const [state, dispatch] = useReducer(appStateReducer, undefined, createDefaultState);
  const autosaveTimerRef = useRef(null);
  const syncTimerRef = useRef(null);
  const previousSyncedRef = useRef({ employees: [], schedules: [], settings: null });
  const skipNextSyncRef = useRef(false);

  // Load this org's data once we know who's signed in, and keep listening
  // for other sessions' changes to it (manager + staff can be editing at
  // the same time now, unlike the old single-user localStorage app).
  useEffect(() => {
    if (!orgId) {
      return undefined;
    }

    let isCurrent = true;

    fetchOrgBundle(orgId).then((bundle) => {
      if (!isCurrent) {
        return;
      }

      skipNextSyncRef.current = true;
      dispatch({ type: "HYDRATE_FROM_SERVER", payload: bundle });
    });

    const unsubscribe = subscribeToOrgChanges(orgId, (change) => {
      skipNextSyncRef.current = true;
      dispatch({ type: "MERGE_SERVER_RECORD", payload: change });
    });

    return () => {
      isCurrent = false;
      unsubscribe();
    };
  }, [orgId]);

  // Push local edits to Supabase — debounced so a burst of edits (e.g.
  // toggling several assignment cells) becomes one write per row, not one
  // per click. Skipped for the state change right after a server
  // hydrate/merge, since that data just came FROM the server and re-sending
  // it would just be a wasted round trip.
  useEffect(() => {
    if (!orgId) {
      return undefined;
    }

    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      previousSyncedRef.current = { employees: state.employees, schedules: state.schedules, settings: state.settings };
      return undefined;
    }

    window.clearTimeout(syncTimerRef.current);

    syncTimerRef.current = window.setTimeout(() => {
      const previous = previousSyncedRef.current;

      state.employees.forEach((employee) => {
        const { availability, ...core } = employee;
        const previousEmployee = previous.employees.find((entry) => entry.id === employee.id);
        const previousCore = previousEmployee ? { ...previousEmployee, availability: undefined } : null;

        if (!previousEmployee || JSON.stringify(previousCore) !== JSON.stringify({ ...core, availability: undefined })) {
          upsertEmployeeRow(orgId, employee);
        }

        if (!previousEmployee || JSON.stringify(previousEmployee.availability) !== JSON.stringify(availability)) {
          upsertAvailabilityRow(orgId, employee.id, availability);
        }
      });

      state.schedules.forEach((record) => {
        const previousRecord = previous.schedules.find((entry) => entry.id === record.id);

        if (!previousRecord || JSON.stringify(previousRecord) !== JSON.stringify(record)) {
          upsertScheduleRecordRow(orgId, record);
        }
      });

      if (!previous.settings || JSON.stringify(previous.settings) !== JSON.stringify(state.settings)) {
        updateOrganizationSettings(orgId, state.settings);
      }

      previousSyncedRef.current = { employees: state.employees, schedules: state.schedules, settings: state.settings };
    }, SYNC_DEBOUNCE_MS);

    return () => window.clearTimeout(syncTimerRef.current);
  }, [state, orgId]);

  // Silent autosave: after a short idle window, commit the in-progress week
  // into schedules[] (the same records Schedule history reads) so work is
  // never lost even if the user never clicks "Save draft".
  useEffect(() => {
    window.clearTimeout(autosaveTimerRef.current);

    if (!state.schedule.hasUnsavedChanges) {
      return undefined;
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      dispatch({ type: "SAVE_SCHEDULE_DRAFT" });
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(autosaveTimerRef.current);
  }, [state.schedule]);

  const value = useMemo(() => ({ state, dispatch }), [state]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
};

export const useAppState = () => {
  const context = useContext(AppStateContext);

  if (!context) {
    throw new Error("useAppState must be used within an AppStateProvider");
  }

  return context;
};
