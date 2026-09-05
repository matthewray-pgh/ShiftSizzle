import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { useAuth } from "./AuthState";
import { buildCallOutId, buildScheduleRecordId } from "./scheduleRecordId";
import {
  fetchOrgBundle,
  subscribeToOrgChanges,
  updateOrganizationSettings,
  upsertAvailabilityRow,
  upsertCallOutRow,
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

// Seeded into a new org's editable team-roles list. Every one of these can
// later be removed in Settings (as long as no employee or saved schedule
// still references it) — they are starting defaults, not fixed roles.
export const DEFAULT_TEAM_ROLES = Object.freeze(Object.values(BASE_TEAM_ROLES));

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

// Optional per-label time ranges. The label stays the identity key
// everywhere (availability, requirements, assignments); a time is display
// metadata only. Always returns an entry for every current shift type, with
// empty strings where nothing is set — so consumers never branch on missing
// keys. Times for labels that no longer exist are dropped.
export const normalizeShiftTimes = (shiftTimes = {}, shiftTypes = BASE_SHIFT_TYPES) =>
  Object.fromEntries(
    shiftTypes.map((label) => {
      const entry = shiftTimes?.[label] ?? {};

      return [
        label,
        {
          startTime: typeof entry.startTime === "string" ? entry.startTime : "",
          endTime: typeof entry.endTime === "string" ? entry.endTime : "",
        },
      ];
    })
  );

export const getShiftTime = (settings = {}, label = "") => {
  const times = normalizeShiftTimes(settings.shiftTimes, getShiftTypes(settings));

  return times[label] ?? { startTime: "", endTime: "" };
};

// "13:30" -> "1:30p", "11:00" -> "11a", "" -> "".
const formatClockPart = (value = "") => {
  const trimmed = `${value}`.trim();

  if (!/^\d{1,2}:\d{2}$/.test(trimmed)) {
    return "";
  }

  const [hoursText, minutesText] = trimmed.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  if (!Number.isFinite(hours) || hours > 23 || minutes > 59) {
    return "";
  }

  const period = hours >= 12 ? "p" : "a";
  const hour12 = hours % 12 || 12;

  return minutes ? `${hour12}:${`${minutes}`.padStart(2, "0")}${period}` : `${hour12}${period}`;
};

// "" when neither end is set, "11a–4p" when both are, or the one that's set.
export const formatShiftTimeRange = (shiftTime = {}) => {
  const start = formatClockPart(shiftTime?.startTime ?? "");
  const end = formatClockPart(shiftTime?.endTime ?? "");

  if (start && end) {
    return `${start}–${end}`;
  }

  return start || end || "";
};

// "Mid" or, when a time range is configured, "Mid · 11a–4p".
export const formatShiftLabel = (settings = {}, label = "") => {
  const range = formatShiftTimeRange(getShiftTime(settings, label));

  return range ? `${label} · ${range}` : label;
};

// The org's configured team-roles list, unioned with any role an employee
// still holds — so a role that's in use never silently drops out of
// scheduling even if it was removed from the Settings list.
export const getTeamRoles = (settings = {}, employees = []) => {
  const configured = getUniqueValues(settings.teamRoles ?? []);
  const list = configured.length ? configured : [...DEFAULT_TEAM_ROLES];

  return getUniqueValues([
    ...list,
    ...employees.flatMap((employee) => employee.roles ?? []),
  ]);
};

// Legacy settings stored team roles as an implicit base list plus a
// custom-only `additionalTeamRoles`; fold that into the single flat list.
const legacyTeamRoles = (additionalTeamRoles = []) =>
  getUniqueValues([...DEFAULT_TEAM_ROLES, ...additionalTeamRoles]);

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

// Shift an ISO yyyy-mm-dd date by `weeks` seven-day steps (may be negative).
export const addWeeks = (startDateValue, weeks) => {
  const date = getDateFromISO(startDateValue);

  if (!date) {
    return "";
  }

  date.setDate(date.getDate() + weeks * 7);

  return formatISODate(date);
};

export const buildWeekRange = (startDateValue, weekStartsOn) => {
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

// The coverage template (settings.roleCoverage): how many of each role a
// given day + shift needs, entered once in Settings. Unlike weekly
// requirements it is NOT zeroed for closed days — reopening a day should
// restore the manager's intent — and it carries no per-week state.
const normalizeCoverageGrid = (grid = {}, shiftTypes = BASE_SHIFT_TYPES) =>
  Object.fromEntries(
    DAYS.map((day) => [
      day,
      Object.fromEntries(
        shiftTypes.map((shift) => [shift, Math.max(0, Number(grid?.[day]?.[shift]) || 0)])
      ),
    ])
  );

export const normalizeRoleCoverage = (
  roleCoverage = {},
  teamRoles = [],
  shiftTypes = BASE_SHIFT_TYPES
) =>
  Object.fromEntries(
    teamRoles.map((role) => [role, normalizeCoverageGrid(roleCoverage?.[role], shiftTypes)])
  );

const roleCoverageHasDemand = (roleCoverage = {}) =>
  Object.values(roleCoverage).some((grid) =>
    Object.values(grid ?? {}).some((dayGrid) =>
      Object.values(dayGrid ?? {}).some((count) => Number(count) > 0)
    )
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

// The manager's outstanding schedule work (§5), one entry per (week, role)
// that still needs attention: a role with signal whose saved record is
// either unpublished or still short-staffed. Fully-past weeks are dropped —
// a stale draft from last month shouldn't nag forever. This is what the
// nav badge counts and the dashboard "Resume schedule" card lists; the
// count is of distinct items, not raw open shifts.
export const getUnresolvedScheduleItems = (state, todayISO = formatISODate(new Date())) => {
  const shiftTypes = getShiftTypes(state.settings);
  const operatingHours = normalizeOperatingHours(state.settings.operatingHours);

  return state.schedules
    .filter((record) => recordHasSignal(record) && (!record.endDate || record.endDate >= todayISO))
    .map((record) => {
      const review = calculateScheduleReview({
        assignments: record.assignments ?? {},
        requirements: record.requirements ?? {},
        employees: state.employees,
        selectedRole: record.role,
        shiftTypes,
        operatingHours,
      });
      const openSlots = review.metrics.openSlots;
      const unpublished = record.status !== "published";

      if (!openSlots && !unpublished) {
        return null;
      }

      return {
        id: record.id,
        startDate: record.startDate,
        weekLabel: record.weekLabel,
        role: record.role,
        openSlots,
        unpublished,
        firstGapDay: review.coverageGaps[0]?.day ?? null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : a.role.localeCompare(b.role)));
};

// The saved status of one week: "published" when every signal record for it
// is published, "draft" when records exist but not all are, "none" when the
// week has no saved records at all.
export const getWeekStatus = (schedules = [], startDate) => {
  const records = schedules.filter((entry) => entry.startDate === startDate);
  const signalRecords = records.filter(recordHasSignal);

  if (records.length === 0) {
    return "none";
  }

  return signalRecords.length > 0 && signalRecords.every((entry) => entry.status === "published")
    ? "published"
    : "draft";
};

// The weeks offered by the "Jump to a week" sheet: last / this / next / the
// two after, plus any week that already has saved records — de-duplicated,
// each with its label and saved status, ordered by date.
export const getWeekChoices = (state, referenceDate = new Date()) => {
  const weekStartsOn = state.settings.weekStartsOn;
  const thisWeek = getCurrentWeekStartDate(weekStartsOn, referenceDate);

  if (!thisWeek) {
    return [];
  }

  const relatives = new Map([
    [addWeeks(thisWeek, -1), "Last week"],
    [thisWeek, "This week"],
    [addWeeks(thisWeek, 1), "Next week"],
    [addWeeks(thisWeek, 2), null],
    [addWeeks(thisWeek, 3), null],
  ]);

  state.schedules.forEach((entry) => {
    if (entry.startDate && !relatives.has(entry.startDate)) {
      relatives.set(entry.startDate, null);
    }
  });

  return Array.from(relatives.entries())
    .filter(([startDate]) => Boolean(startDate))
    .map(([startDate, relative]) => {
      const range = buildWeekRange(startDate, weekStartsOn);

      return {
        startDate,
        relative,
        label: range.weekLabel || startDate,
        status: getWeekStatus(state.schedules, startDate),
        isCurrent: startDate === thisWeek,
      };
    })
    .sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
};

// The most recent saved week strictly before `beforeStartDate`, or "" if
// there is none — the source for "Copy last week" (§7).
export const getPriorScheduledWeekStart = (schedules = [], beforeStartDate = "") => {
  const priorStarts = Array.from(
    new Set(schedules.map((record) => record.startDate).filter((date) => date && date < beforeStartDate))
  ).sort();

  return priorStarts[priorStarts.length - 1] ?? "";
};

// Call-outs that still need a replacement — no one is covering the slot yet
// (§6). The "needs coverage" flag on a shift is derived from this, never a
// stored boolean.
export const getUnresolvedCallOuts = (callOuts = []) =>
  callOuts.filter((callOut) => !callOut.coveredBy);

// Unresolved call-outs on one exact (week, role, day, shift).
export const getCalledOutFor = (callOuts = [], weekStartDate, role, day, shift) =>
  getUnresolvedCallOuts(callOuts).filter(
    (callOut) =>
      callOut.weekStartDate === weekStartDate
      && callOut.role === role
      && callOut.day === day
      && callOut.shift === shift
  );

// Copy-last-week conflicts that still matter: the flagged assignment is
// still on the canvas and the manager hasn't chosen "Keep anyway".
export const getLiveCopyConflicts = (schedule = {}) =>
  (schedule.copyConflicts ?? []).filter((conflict) => {
    if (conflict.resolved) {
      return false;
    }

    const shifts = schedule.assignments?.[conflict.role]?.[conflict.employeeId]?.[conflict.day] ?? [];

    return shifts.includes(conflict.shift);
  });

// Rolls the per-role schedule review (see calculateScheduleReview) up into
// week-level totals across every role that has coverage targets or
// assignments. `state.schedule` is whatever week the caller wants scored —
// the live canvas, or a getWeekView() snapshot of a past/future week.
export const computeWeekReviewTotals = (state, teamRoles) => {
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
      gapCount: totals.gapCount + review.coverageGaps.length,
      capAlertCount: totals.capAlertCount + review.shiftCapAlerts.length,
    };
  }, { totalRequired: 0, totalOpen: 0, gapCount: 0, capAlertCount: 0 });
};

export const computeWeekCoverage = (state, teamRoles) => {
  const { totalRequired, totalOpen } = computeWeekReviewTotals(state, teamRoles);

  return { totalRequired, totalOpen };
};

// Three-state coverage status for one cell, plus "empty" for no demand.
// "none" (zero covered) is deliberately distinct from "partial" (short a
// person) — see §3 of the schedule-builder redesign spec.
export const coverageStatus = (filled, needed) => {
  if (needed <= 0) {
    return "empty";
  }

  if (filled >= needed) {
    return "full";
  }

  return filled <= 0 ? "none" : "partial";
};

const countAssignedForShift = (roleAssignments, roleEmployees, day, shift) =>
  roleEmployees.reduce(
    (count, employee) => count + ((roleAssignments[employee.id]?.[day] ?? []).includes(shift) ? 1 : 0),
    0,
  );

// Day x (role | shift) coverage matrix for the Week overview grid (§3).
// `role` null  -> one row per team role; each cell sums every shift type for
//                 that role on that day.
// `role` set   -> one row per shift type of that role; each cell is that one
//                 shift. Rows carry `role`/`shift` so a cell tap knows what
//                 the manager pointed at.
export const computeWeekGrid = ({
  schedule = {},
  employees = [],
  settings = {},
  teamRoles = [],
  role = null,
  callOuts = [],
  weekStartDate = schedule.startDate,
}) => {
  const shiftTypes = getShiftTypes(settings);
  const openDays = getOpenDays(settings);
  const activeEmployees = employees.filter((employee) => employee.status !== "archived");
  const unresolvedCallOuts = getUnresolvedCallOuts(callOuts);
  const rolesMode = !role;

  const cellFor = (rowRole, rowShifts, day) => {
    const roleAssignments = schedule.assignments?.[rowRole] ?? {};
    const requirements = schedule.roleRequirements?.[rowRole] ?? {};
    const roleEmployees = activeEmployees.filter((employee) => (employee.roles ?? []).includes(rowRole));
    const needed = rowShifts.reduce((total, shift) => total + (requirements?.[day]?.[shift] ?? 0), 0);
    const filled = rowShifts.reduce(
      (total, shift) => total + countAssignedForShift(roleAssignments, roleEmployees, day, shift),
      0,
    );
    const needsCoverage = unresolvedCallOuts.some(
      (callOut) =>
        callOut.weekStartDate === weekStartDate
        && callOut.role === rowRole
        && callOut.day === day
        && rowShifts.includes(callOut.shift)
    );

    return { day, filled, needed, status: coverageStatus(filled, needed), needsCoverage };
  };

  const rows = rolesMode
    ? teamRoles.map((teamRole) => ({
        key: teamRole,
        label: teamRole,
        role: teamRole,
        shift: null,
        cells: openDays.map((day) => cellFor(teamRole, shiftTypes, day)),
      }))
    : shiftTypes.map((shift) => ({
        key: shift,
        label: formatShiftLabel(settings, shift),
        role,
        shift,
        cells: openDays.map((day) => cellFor(role, [shift], day)),
      }));

  return { mode: rolesMode ? "roles" : "shifts", days: openDays, rows };
};

// The calendar date of each weekday for the week starting on `startDate`
// (an ISO yyyy-mm-dd on `weekStartsOn`). Used by the Day builder's day tabs.
export const getWeekDayDates = (startDate, weekStartsOn) => {
  const start = getDateFromISO(startDate);
  const startIndex = getDayIndex(weekStartsOn);

  if (!start || startIndex === -1) {
    return {};
  }

  return Object.fromEntries(
    DAYS.map((day) => {
      const offset = (getDayIndex(day) - startIndex + 7) % 7;
      const date = new Date(start);
      date.setDate(start.getDate() + offset);

      return [day, date];
    })
  );
};

// Everyone currently assigned to one exact (role, day, shift) slot.
export const getAssignedEmployees = ({ schedule = {}, employees = [], role, day, shift }) => {
  const bucket = schedule.assignments?.[role] ?? {};

  return employees.filter(
    (employee) =>
      employee.status !== "archived"
      && (employee.roles ?? []).includes(role)
      && (bucket[employee.id]?.[day] ?? []).includes(shift)
  );
};

// Everyone who could be added to a (role, day, shift) slot, annotated with
// why they can't when they can't. Same rules the TOGGLE_ASSIGNMENT reducer
// enforces — availability, the cross-role weekly shift cap, and no
// same-day/same-shift double-booking under another role — so the candidate
// list never offers a pick the reducer would silently reject. Already-
// assigned employees are excluded. Eligible names sort first, then by who
// is carrying the lightest week.
export const getEligibleCandidates = ({ schedule = {}, employees = [], settings = {}, role, day, shift }) => {
  const operatingHours = normalizeOperatingHours(settings.operatingHours);
  const allAssignments = schedule.assignments ?? {};
  const bucket = allAssignments[role] ?? {};

  return employees
    .filter(
      (employee) =>
        employee.status !== "archived"
        && (employee.roles ?? []).includes(role)
        && !(bucket[employee.id]?.[day] ?? []).includes(shift)
    )
    .map((employee) => {
      const cap = normalizeShiftsPerWeek(employee);
      const assignedThisWeek = countAssignedShiftsForEmployee(allAssignments, employee.id, operatingHours);
      const isAvailable = (employee.availability?.[day] ?? []).includes(shift);
      const isDoubleBooked = Object.entries(allAssignments).some(
        ([otherRole, otherBucket]) =>
          otherRole !== role && (otherBucket[employee.id]?.[day] ?? []).includes(shift)
      );
      const blockedReason = !isAvailable
        ? "unavailable"
        : isDoubleBooked
          ? "double-booked"
          : assignedThisWeek >= cap
            ? "at-cap"
            : null;

      return { employee, cap, assignedThisWeek, blockedReason, eligible: !blockedReason };
    })
    .sort(
      (a, b) => Number(b.eligible) - Number(a.eligible) || a.assignedThisWeek - b.assignedThisWeek
    );
};

// Per-(role, shift) cards for one day of the Day builder, respecting the
// active role filter (`role` null = every team role). A card is included
// when the slot has demand or someone is on it (an over-staffed slot whose
// target dropped to zero still needs to be visible so people can be moved).
export const computeDayCards = ({
  schedule = {},
  employees = [],
  settings = {},
  teamRoles = [],
  role = null,
  day,
  callOuts = [],
  weekStartDate = schedule.startDate,
}) => {
  const shiftTypes = getShiftTypes(settings);
  const roles = role ? [role] : teamRoles;
  const employeesById = Object.fromEntries(employees.map((employee) => [employee.id, employee]));

  return roles.flatMap((cardRole) => {
    const requirements = schedule.roleRequirements?.[cardRole] ?? {};

    return shiftTypes
      .map((shift) => {
        const needed = requirements?.[day]?.[shift] ?? 0;
        const assigned = getAssignedEmployees({ schedule, employees, role: cardRole, day, shift });
        const calledOut = getCalledOutFor(callOuts, weekStartDate, cardRole, day, shift).map((callOut) => ({
          ...callOut,
          employeeName: employeesById[callOut.employeeId]?.name ?? "Someone",
        }));

        return {
          key: `${cardRole}__${shift}`,
          role: cardRole,
          shift,
          label: formatShiftLabel(settings, shift),
          needed,
          assigned,
          calledOut,
          status: coverageStatus(assigned.length, needed),
        };
      })
      .filter((card) => card.needed > 0 || card.assigned.length > 0 || card.calledOut.length > 0);
  });
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

// Weekly requirements are seeded per role from that role's saved record for
// the week if one exists (its snapshot, for History accuracy), otherwise
// from the current Settings coverage template. Requirements are no longer
// typed per week — see §1 of the schedule-builder redesign spec.
const seedRoleRequirements = (recordsByRole, settings, teamRoles, shiftTypes, operatingHours) =>
  normalizeRoleRequirements(
    Object.fromEntries(teamRoles.map((role) => [
      role,
      recordsByRole[role]?.requirements ?? settings.roleCoverage?.[role] ?? {},
    ])),
    teamRoles,
    shiftTypes,
    operatingHours
  );

// One-time backfill for orgs created before settings.roleCoverage existed:
// take the most recently touched saved record per role and lift its
// requirements grid into the template.
const deriveCoverageFromSchedules = (schedules = []) => {
  const timeOf = (entry) => Math.max(
    entry?.savedAt ? new Date(entry.savedAt).getTime() : 0,
    entry?.publishedAt ? new Date(entry.publishedAt).getTime() : 0,
    entry?.createdAt ? new Date(entry.createdAt).getTime() : 0,
  );

  const latestByRole = {};

  schedules.forEach((entry) => {
    if (!entry?.role) {
      return;
    }

    if (!latestByRole[entry.role] || timeOf(entry) >= timeOf(latestByRole[entry.role])) {
      latestByRole[entry.role] = entry;
    }
  });

  return Object.fromEntries(
    Object.entries(latestByRole).map(([role, entry]) => [role, entry.requirements ?? {}])
  );
};

const hydrateScheduleForWeek = (state, startDate) => {
  const shiftTypes = getShiftTypes(state.settings);
  const operatingHours = normalizeOperatingHours(state.settings.operatingHours);
  const teamRoles = getTeamRoles(state.settings, state.employees);
  const recordsForWeek = startDate
    ? state.schedules.filter((entry) => entry.startDate === startDate)
    : [];
  const recordsByRole = Object.fromEntries(recordsForWeek.map((entry) => [entry.role, entry]));
  const roleRequirements = seedRoleRequirements(recordsByRole, state.settings, teamRoles, shiftTypes, operatingHours);
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
    // Copy-last-week review state is per-canvas and transient — switching
    // weeks always clears it.
    copiedFrom: null,
    copyConflicts: [],
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
    copiedFrom: null,
    copyConflicts: [],
  };
};

const createDefaultState = () => {
  const settings = {
    businessName: "ShiftSizzle",
    locationName: "",
    schedulerName: "",
    publishNotifications: true,
    shiftTypes: [...BASE_SHIFT_TYPES],
    shiftTimes: normalizeShiftTimes({}, BASE_SHIFT_TYPES),
    teamRoles: [...DEFAULT_TEAM_ROLES],
    roleCoverage: normalizeRoleCoverage({}, DEFAULT_TEAM_ROLES, BASE_SHIFT_TYPES),
    weekStartsOn: "",
    operatingHours: normalizeOperatingHours(),
  };

  return {
    settings,
    employees: [],
    schedule: createDefaultSchedule([], BASE_SHIFT_TYPES, getTeamRoles(settings, []), normalizeOperatingHours()),
    schedules: [],
    // Call-out events (§6), org-wide and not week-scoped in state — each
    // row carries its own weekStartDate.
    callOuts: [],
    // False until the first HYDRATE_FROM_SERVER — lets consumers (and
    // tests) tell "org data hasn't loaded yet" apart from "this org
    // genuinely has zero employees/schedules".
    isHydrated: false,
  };
};

const normalizeSettings = (settings = {}, schedule = {}) => {
  const { additionalTeamRoles: _legacyAdditionalTeamRoles, ...normalizedSettings } = {
    ...createDefaultState().settings,
    ...settings,
  };

  const explicitTeamRoles = getUniqueValues(settings.teamRoles ?? []);
  const resolvedShiftTypes = getShiftTypes(normalizedSettings);
  const resolvedTeamRoles = explicitTeamRoles.length
    ? explicitTeamRoles
    : legacyTeamRoles(settings.additionalTeamRoles ?? []);

  return {
    ...normalizedSettings,
    shiftTypes: resolvedShiftTypes,
    shiftTimes: normalizeShiftTimes(normalizedSettings.shiftTimes, resolvedShiftTypes),
    teamRoles: resolvedTeamRoles,
    roleCoverage: normalizeRoleCoverage(normalizedSettings.roleCoverage, resolvedTeamRoles, resolvedShiftTypes),
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
      // A changed coverage template re-seeds this week's requirements for any
      // role that hasn't already snapshotted a record for the week.
      const coverageChanged = "roleCoverage" in action.payload
        || ["shiftTypes", "teamRoles", "operatingHours"].some((key) => key in action.payload);
      const recordsByRole = coverageChanged
        ? Object.fromEntries(
            state.schedules
              .filter((entry) => entry.startDate === state.schedule.startDate)
              .map((entry) => [entry.role, entry])
          )
        : {};
      const roleRequirements = coverageChanged
        ? seedRoleRequirements(recordsByRole, settings, teamRoles, shiftTypes, operatingHours)
        : normalizeRoleRequirements(state.schedule.roleRequirements, teamRoles, shiftTypes, operatingHours);
      const assignments = normalizeAssignments(state.schedule.assignments, employees, teamRoles, shiftTypes, operatingHours);
      const invalidatesDraft = ["shiftTypes", "teamRoles", "operatingHours", "weekStartsOn", "roleCoverage"]
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

      if (!rolesWithSignal.length) {
        return state;
      }

      // With an explicit role list (the §4 confirmation sheet) the caller has
      // already accepted the open shifts, so publish exactly those roles and
      // (re)write the rest of the signal roles as held-back drafts. Without a
      // list — the instant path — only a fully-covered week may go out.
      const explicitRoles = Array.isArray(action.payload?.roles) ? action.payload.roles : null;

      if (!explicitRoles) {
        const { totalRequired, totalOpen } = computeWeekCoverage(state, teamRoles);

        if (totalRequired === 0 || totalOpen > 0) {
          return state;
        }
      }

      const publishRoles = rolesWithSignal.filter((role) => (explicitRoles ?? rolesWithSignal).includes(role));

      if (!publishRoles.length) {
        return state;
      }

      const now = new Date().toISOString();
      const schedules = rolesWithSignal.reduce((acc, role) => {
        const existingRecord = acc.find((entry) => entry.id === buildScheduleRecordId(state.schedule.startDate, role));
        const status = publishRoles.includes(role) ? "published" : "draft";

        return upsertScheduleRecord(
          acc,
          buildScheduleRecordFromLiveSchedule(state.schedule, role, state.employees, state.settings, status, now, existingRecord)
        );
      }, state.schedules);

      const summary = summarizeWeekRecords(schedules.filter((entry) => entry.startDate === state.schedule.startDate));

      return {
        ...state,
        schedules,
        schedule: {
          ...state.schedule,
          hasUnsavedChanges: false,
          status: summary.status,
          lastSavedAt: summary.lastSavedAt,
          lastPublishedAt: summary.lastPublishedAt,
        },
      };
    }
    // Reverts a just-published week to the exact records it had immediately
    // before PUBLISH_SCHEDULE (captured by the Scheduler for its undo toast).
    // Records created by that publish are dropped; the rest go back to draft.
    case "UNDO_PUBLISH": {
      const { startDate, records = [] } = action.payload ?? {};
      const schedules = [
        ...records,
        ...state.schedules.filter((entry) => entry.startDate !== startDate),
      ];
      const summary = summarizeWeekRecords(records);

      return {
        ...state,
        schedules,
        schedule: {
          ...state.schedule,
          hasUnsavedChanges: false,
          status: summary.status,
          lastSavedAt: summary.lastSavedAt,
          lastPublishedAt: summary.lastPublishedAt,
        },
      };
    }
    case "RESET_WEEK_DRAFT": {
      const shiftTypes = getShiftTypes(state.settings);
      const operatingHours = normalizeOperatingHours(state.settings.operatingHours);
      const teamRoles = getTeamRoles(state.settings, state.employees);

      return {
        ...state,
        schedule: {
          ...state.schedule,
          // Coverage targets are the Settings template's, not this week's, so
          // reset re-seeds them rather than zeroing them — it only clears the
          // week's own work (assignments + notes).
          roleRequirements: seedRoleRequirements({}, state.settings, teamRoles, shiftTypes, operatingHours),
          assignments: createEmptyAssignments(state.employees, teamRoles, operatingHours),
          notes: "",
          status: "draft",
          hasUnsavedChanges: false,
          lastSavedAt: null,
          lastPublishedAt: null,
          copiedFrom: null,
          copyConflicts: [],
        },
      };
    }
    // Copy-last-week (§7): seed this week's assignments from the most recent
    // saved week, then validate every copied assignment against CURRENT
    // availability / status / role. Coverage targets always come from the
    // Settings template — template drift is never a conflict. Flagged
    // assignments stay on the canvas so the manager can see and resolve
    // them; getLiveCopyConflicts() is what's still outstanding.
    case "COPY_LAST_WEEK": {
      const currentStart = state.schedule.startDate;
      const sourceStart = getPriorScheduledWeekStart(state.schedules, currentStart);

      if (!currentStart || !sourceStart) {
        return state;
      }

      const shiftTypes = getShiftTypes(state.settings);
      const operatingHours = normalizeOperatingHours(state.settings.operatingHours);
      const teamRoles = getTeamRoles(state.settings, state.employees);
      const sourceByRole = Object.fromEntries(
        state.schedules.filter((entry) => entry.startDate === sourceStart).map((entry) => [entry.role, entry])
      );
      const employeesById = Object.fromEntries(state.employees.map((employee) => [employee.id, employee]));

      const assignments = Object.fromEntries(teamRoles.map((role) => [
        role,
        normalizeRoleAssignments(sourceByRole[role]?.assignments ?? {}, state.employees, shiftTypes, operatingHours),
      ]));

      const copyConflicts = [];

      teamRoles.forEach((role) => {
        Object.entries(assignments[role]).forEach(([employeeId, byDay]) => {
          const employee = employeesById[employeeId];

          DAYS.forEach((day) => {
            (byDay[day] ?? []).forEach((shift) => {
              if (!employee || employee.status === "archived") {
                copyConflicts.push({
                  role, employeeId, day, shift, severity: "hard",
                  reason: employee ? `${employee.name} is no longer active` : "Employee no longer on the roster",
                });
              } else if (!(employee.roles ?? []).includes(role)) {
                copyConflicts.push({
                  role, employeeId, day, shift, severity: "hard",
                  reason: `${employee.name} no longer works ${role}`,
                });
              } else if (!(employee.availability?.[day] ?? []).includes(shift)) {
                copyConflicts.push({
                  role, employeeId, day, shift, severity: "soft",
                  reason: `${employee.name} · now off ${day}s`,
                });
              }
            });
          });
        });
      });

      return {
        ...state,
        schedule: {
          ...state.schedule,
          assignments,
          roleRequirements: seedRoleRequirements({}, state.settings, teamRoles, shiftTypes, operatingHours),
          copiedFrom: sourceStart,
          copyConflicts,
          status: "draft",
          hasUnsavedChanges: true,
        },
      };
    }
    case "RESOLVE_COPY_CONFLICT": {
      const { role, employeeId, day, shift } = action.payload ?? {};
      const copyConflicts = (state.schedule.copyConflicts ?? []).map((conflict) =>
        conflict.role === role
          && conflict.employeeId === employeeId
          && conflict.day === day
          && conflict.shift === shift
          ? { ...conflict, resolved: true }
          : conflict
      );

      return { ...state, schedule: { ...state.schedule, copyConflicts } };
    }
    // §6: "Mark called out" logs a durable event AND clears the assignment,
    // so the slot reads as genuinely open (needs coverage) rather than
    // quietly still-filled. The "needs coverage" flag is derived from an
    // unresolved row for the slot — not stored anywhere separately.
    case "MARK_CALLED_OUT": {
      const { employeeId, role, day, shift } = action.payload ?? {};
      const weekStartDate = state.schedule.startDate;
      const roleBucket = state.schedule.assignments?.[role] ?? {};
      const current = roleBucket[employeeId]?.[day] ?? [];

      if (!weekStartDate || !current.includes(shift)) {
        return state;
      }

      const id = buildCallOutId(weekStartDate, role, day, shift, employeeId);
      const record = {
        id,
        weekStartDate,
        role,
        day,
        shift,
        employeeId,
        calledOutAt: new Date().toISOString(),
        resolvedVia: null,
        coveredBy: null,
      };
      const callOuts = [...state.callOuts.filter((entry) => entry.id !== id), record];

      return {
        ...state,
        callOuts,
        schedule: {
          ...state.schedule,
          hasUnsavedChanges: true,
          status: "draft",
          assignments: {
            ...state.schedule.assignments,
            [role]: {
              ...roleBucket,
              [employeeId]: {
                ...(roleBucket[employeeId] ?? {}),
                [day]: current.filter((entry) => entry !== shift),
              },
            },
          },
        },
      };
    }
    // A replacement was assigned to a called-out slot (Find replacement) —
    // mark every still-open call-out on that slot covered so the flag clears.
    case "RESOLVE_CALL_OUT": {
      const { role, day, shift, coveredBy } = action.payload ?? {};
      const weekStartDate = state.schedule.startDate;
      const matches = (entry) =>
        !entry.coveredBy
        && entry.weekStartDate === weekStartDate
        && entry.role === role
        && entry.day === day
        && entry.shift === shift;

      if (!state.callOuts.some(matches)) {
        return state;
      }

      const callOuts = state.callOuts.map((entry) =>
        matches(entry) ? { ...entry, coveredBy: coveredBy ?? null, resolvedVia: "manual" } : entry
      );

      return { ...state, callOuts };
    }
    // Replaces settings/employees/schedules wholesale with what was fetched
    // from Supabase for the current org, then rebuilds the live editing
    // canvas (schedule) for whichever week was already selected (or "this
    // week" on first load) from that data — mirrors what hydrateState used
    // to do from a localStorage blob, just sourced from the server instead.
    case "HYDRATE_FROM_SERVER": {
      const rawSettings = action.payload.settings ?? {};
      const schedules = action.payload.schedules;
      // Backfill the coverage template from saved history the first time an
      // org loads after this change; a template with any demand is left alone.
      const seededSettings = roleCoverageHasDemand(rawSettings.roleCoverage ?? {})
        ? rawSettings
        : { ...rawSettings, roleCoverage: deriveCoverageFromSchedules(schedules) };
      const settings = normalizeSettings(seededSettings);
      const shiftTypes = getShiftTypes(settings);
      const employees = action.payload.employees.map((employee) => normalizeEmployee(employee, shiftTypes));
      const startDate = state.schedule.startDate || getCurrentWeekStartDate(settings.weekStartsOn);

      return applyWeekContext(
        { ...state, settings, employees, schedules, callOuts: action.payload.callOuts ?? [], isHydrated: true },
        startDate,
      );
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

      if (table === "call_outs") {
        const callOuts = eventType === "DELETE"
          ? state.callOuts.filter((entry) => entry.id !== row.id)
          : [...state.callOuts.filter((entry) => entry.id !== row.id), row];

        return { ...state, callOuts };
      }

      return state;
    }
    default:
      return state;
  }
};

// Best-effort local mirror of the server bundle, per org. It is a crash /
// offline-reload cache only — not an offline-first write queue — so every
// access is guarded: private-mode and quota errors must not break the app.
export const mirrorKey = (orgId) => `shiftsizzle:mirror:${orgId}`;

export const readOrgMirror = (orgId) => {
  try {
    const raw = window.localStorage.getItem(mirrorKey(orgId));
    const parsed = raw ? JSON.parse(raw) : null;

    if (parsed && parsed.settings && Array.isArray(parsed.employees) && Array.isArray(parsed.schedules)) {
      return { callOuts: [], ...parsed };
    }
  } catch (error) {
    console.warn('Could not read local schedule mirror', error);
  }

  return null;
};

export const writeOrgMirror = (orgId, { settings, employees, schedules, callOuts = [] }) => {
  try {
    window.localStorage.setItem(mirrorKey(orgId), JSON.stringify({ settings, employees, schedules, callOuts }));
  } catch (error) {
    console.warn('Could not write local schedule mirror', error);
  }
};

export const AppStateProvider = ({ children }) => {
  const { membership } = useAuth();
  const orgId = membership?.orgId ?? null;
  const [state, dispatch] = useReducer(appStateReducer, undefined, createDefaultState);
  // Transient, UI-only. Kept out of the reducer (and the mirror) so setting
  // it never re-triggers the push effect. 'saved' | 'saving' | 'offline' | 'error'.
  const [syncStatus, setSyncStatus] = useState('saved');
  const autosaveTimerRef = useRef(null);
  const syncTimerRef = useRef(null);
  const previousSyncedRef = useRef({ employees: [], schedules: [], settings: null, callOuts: [] });
  const skipNextSyncRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Load this org's data once we know who's signed in, and keep listening
  // for other sessions' changes to it (manager + staff can be editing at
  // the same time now, unlike the old single-user localStorage app).
  useEffect(() => {
    if (!orgId) {
      return undefined;
    }

    let isCurrent = true;

    fetchOrgBundle(orgId)
      .then((bundle) => {
        if (!isCurrent) {
          return;
        }

        skipNextSyncRef.current = true;
        setSyncStatus('saved');
        dispatch({ type: "HYDRATE_FROM_SERVER", payload: bundle });
      })
      .catch((error) => {
        if (!isCurrent) {
          return;
        }

        // Server unreachable: fall back to the last local mirror so the app
        // still opens, and flag that edits aren't syncing yet.
        const mirrored = readOrgMirror(orgId);

        if (mirrored) {
          skipNextSyncRef.current = true;
          setSyncStatus('offline');
          dispatch({ type: "HYDRATE_FROM_SERVER", payload: mirrored });
        } else {
          // No server, no cache: still mark the app hydrated so it renders
          // its empty/first-run state instead of hanging on the loader.
          setSyncStatus('error');
          console.error('Failed to load org bundle from Supabase', error);
          skipNextSyncRef.current = true;
          dispatch({ type: "HYDRATE_FROM_SERVER", payload: { settings: {}, employees: [], schedules: [] } });
        }
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

  // Diffs the current bundle against what was last confirmed on the server
  // and writes only what changed. `force` re-sends everything (used on
  // reconnect). Resolves after every write settles; on any failure the
  // "last synced" marker is NOT advanced, so the next run retries.
  const flushToServer = useCallback(async (force = false) => {
    if (!orgId) {
      return;
    }

    const { employees, schedules, settings, callOuts } = stateRef.current;
    const previous = force
      ? { employees: [], schedules: [], settings: null, callOuts: [] }
      : previousSyncedRef.current;

    setSyncStatus('saving');

    const pending = [];

    employees.forEach((employee) => {
      const { availability, ...core } = employee;
      const previousEmployee = previous.employees.find((entry) => entry.id === employee.id);
      const previousCore = previousEmployee ? { ...previousEmployee, availability: undefined } : null;

      if (!previousEmployee || JSON.stringify(previousCore) !== JSON.stringify({ ...core, availability: undefined })) {
        pending.push(upsertEmployeeRow(orgId, employee));
      }

      if (!previousEmployee || JSON.stringify(previousEmployee.availability) !== JSON.stringify(availability)) {
        pending.push(upsertAvailabilityRow(orgId, employee.id, availability));
      }
    });

    schedules.forEach((record) => {
      const previousRecord = previous.schedules.find((entry) => entry.id === record.id);

      if (!previousRecord || JSON.stringify(previousRecord) !== JSON.stringify(record)) {
        pending.push(upsertScheduleRecordRow(orgId, record));
      }
    });

    (callOuts ?? []).forEach((callOut) => {
      const previousCallOut = (previous.callOuts ?? []).find((entry) => entry.id === callOut.id);

      if (!previousCallOut || JSON.stringify(previousCallOut) !== JSON.stringify(callOut)) {
        pending.push(upsertCallOutRow(orgId, callOut));
      }
    });

    if (!previous.settings || JSON.stringify(previous.settings) !== JSON.stringify(settings)) {
      pending.push(updateOrganizationSettings(orgId, settings));
    }

    if (pending.length === 0) {
      setSyncStatus('saved');
      return;
    }

    const failed = (await Promise.all(pending)).some(Boolean);

    if (failed) {
      setSyncStatus(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'error');
      return;
    }

    previousSyncedRef.current = { employees, schedules, settings, callOuts };
    setSyncStatus('saved');
  }, [orgId]);

  // Push local edits to Supabase — debounced so a burst of edits (e.g.
  // toggling several assignment cells) becomes one write per row, not one
  // per click. Skipped for the state change right after a server
  // hydrate/merge, since that data just came FROM the server.
  useEffect(() => {
    if (!orgId) {
      return undefined;
    }

    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      previousSyncedRef.current = {
        employees: state.employees,
        schedules: state.schedules,
        settings: state.settings,
        callOuts: state.callOuts,
      };
      return undefined;
    }

    window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => flushToServer(false), SYNC_DEBOUNCE_MS);

    return () => window.clearTimeout(syncTimerRef.current);
  }, [state, orgId, flushToServer]);

  // Write-through local mirror: every confirmed bundle is cached so a later
  // reload survives the server being unreachable. Best-effort only.
  useEffect(() => {
    if (!orgId || !state.isHydrated) {
      return;
    }

    writeOrgMirror(orgId, state);
  }, [orgId, state.isHydrated, state.settings, state.employees, state.schedules, state.callOuts]);

  // Retry the full bundle as soon as the browser reports a connection back.
  useEffect(() => {
    if (!orgId || typeof window === 'undefined') {
      return undefined;
    }

    const onOnline = () => flushToServer(true);

    window.addEventListener('online', onOnline);

    return () => window.removeEventListener('online', onOnline);
  }, [orgId, flushToServer]);

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

  const value = useMemo(() => ({ state, dispatch, syncStatus }), [state, syncStatus]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
};

export const useAppState = () => {
  const context = useContext(AppStateContext);

  if (!context) {
    throw new Error("useAppState must be used within an AppStateProvider");
  }

  return context;
};
