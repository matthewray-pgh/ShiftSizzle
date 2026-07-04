import { createContext, useContext, useEffect, useMemo, useReducer } from "react";

const STORAGE_KEY = "shiftsizzle.app-state.v1";

export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const BASE_SHIFT_TYPES = ["Open", "Mid", "Close"];

export const BASE_TEAM_ROLES = Object.freeze({
  MANAGER: "Manager",
  SERVER: "Server",
  HOST: "Host",
  BARTENDER: "Bartender",
  COOK: "Cook",
});

const DEFAULT_TEAM_ROLE = BASE_TEAM_ROLES.MANAGER;
const DEFAULT_SHIFTS_PER_WEEK = 5;
const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const YEAR_FORMATTER = new Intl.DateTimeFormat("en-US", { year: "numeric" });
const DEFAULT_OPERATING_HOURS = Object.fromEntries(
  DAYS.map((day) => [
    day,
    {
      isOpen: true,
      openTime: day === "Friday" || day === "Saturday" ? "10:00" : "11:00",
      closeTime: day === "Friday" || day === "Saturday" ? "23:00" : "21:00",
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
  ...employees.map((employee) => employee.role),
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
  teamRoles = [DEFAULT_TEAM_ROLE],
  selectedRole = DEFAULT_TEAM_ROLE,
  activeRequirements = {},
  shiftTypes = BASE_SHIFT_TYPES,
  operatingHours = normalizeOperatingHours()
) =>
  Object.fromEntries(
    teamRoles.map((role) => [
      role,
      normalizeRequirements(
        roleRequirements?.[role] ?? (role === selectedRole && selectedRole ? activeRequirements : createEmptyRequirements(shiftTypes)),
        shiftTypes,
        operatingHours
      ),
    ])
  );

const normalizeAssignments = (
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

const createEmptyAssignments = (
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

const replaceAssignmentsForRole = (
  assignments = {},
  employees = [],
  role = DEFAULT_TEAM_ROLE,
  nextAssignments = {},
  shiftTypes = BASE_SHIFT_TYPES,
  operatingHours = normalizeOperatingHours()
) =>
  Object.fromEntries(
    employees.map((employee) => {
      const assignmentSource = employee.role === role
        ? nextAssignments?.[employee.id]
        : assignments?.[employee.id];

      return [
        employee.id,
        Object.fromEntries(
          DAYS.map((day) => [
            day,
            operatingHours[day]?.isOpen
              ? getUniqueValues(assignmentSource?.[day] ?? []).filter((shift) => shiftTypes.includes(shift))
              : [],
          ])
        ),
      ];
    })
  );

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

const normalizeEmployee = (employee, shiftTypes = BASE_SHIFT_TYPES) => ({
  ...employee,
  role: employee.role || DEFAULT_TEAM_ROLE,
  status: employee.status ?? "active",
  shiftsPerWeek: normalizeShiftsPerWeek(employee),
  availability: normalizeAvailability(employee.availability, shiftTypes),
});

const normalizeOperatingHours = (operatingHours = {}) =>
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

const defaultEmployees = [
  {
    id: 1,
    name: "Jen Ray",
    title: "General Manager",
    role: BASE_TEAM_ROLES.MANAGER,
    contact: "(555) 010-1001",
    email: "jen@shiftsizzle.app",
    shiftsPerWeek: 5,
    status: "active",
    availability: createAvailability(),
  },
  {
    id: 2,
    name: "Ryan Sutton",
    title: "Assistant General Manager",
    role: BASE_TEAM_ROLES.MANAGER,
    contact: "(555) 010-1002",
    email: "ryan@shiftsizzle.app",
    shiftsPerWeek: 5,
    status: "active",
    availability: createAvailability(["Open", "Mid"]),
  },
  {
    id: 3,
    name: "Kayla Brooks",
    title: "Bar Manager",
    role: BASE_TEAM_ROLES.BARTENDER,
    contact: "(555) 010-1003",
    email: "kayla@shiftsizzle.app",
    shiftsPerWeek: 4,
    status: "active",
    availability: createAvailability(["Mid", "Close"]),
  },
  {
    id: 4,
    name: "Kirk Brady",
    title: "Director",
    role: BASE_TEAM_ROLES.MANAGER,
    contact: "(555) 010-1004",
    email: "kirk@shiftsizzle.app",
    shiftsPerWeek: 4,
    status: "active",
    availability: createAvailability(["Open", "Close"]),
  },
  {
    id: 5,
    name: "Jackie Carter",
    title: "Lead Host",
    role: BASE_TEAM_ROLES.HOST,
    contact: "(555) 010-1005",
    email: "jackie@shiftsizzle.app",
    shiftsPerWeek: 4,
    status: "active",
    availability: createAvailability(),
  },
  {
    id: 6,
    name: "Marco Ellis",
    title: "Line Cook",
    role: BASE_TEAM_ROLES.COOK,
    contact: "(555) 010-1006",
    email: "marco@shiftsizzle.app",
    shiftsPerWeek: 5,
    status: "active",
    availability: createAvailability(["Open", "Mid"]),
  },
  {
    id: 7,
    name: "Ariana Cole",
    title: "Server",
    role: BASE_TEAM_ROLES.SERVER,
    contact: "(555) 010-1007",
    email: "ariana@shiftsizzle.app",
    shiftsPerWeek: 4,
    status: "active",
    availability: createAvailability(["Mid", "Close"]),
  },
].map((employee) => normalizeEmployee(employee));

const buildAssignments = (
  employees,
  role,
  requirements,
  shiftTypes = BASE_SHIFT_TYPES,
  operatingHours = normalizeOperatingHours()
) => {
  const assignments = Object.fromEntries(employees.map((employee) => [employee.id, {}]));
  const eligibleEmployees = employees.filter(
    (employee) => employee.role === role && employee.status !== "archived"
  );

  if (!eligibleEmployees.length) {
    return assignments;
  }

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
        const assignedShiftCount = openDays.reduce(
          (total, openDay) => total + ((assignments[candidate.id][openDay] ?? []).length),
          0,
        );
        const maxShiftsPerWeek = normalizeShiftsPerWeek(candidate);

        if (!availableShifts.includes(shift) || hasShiftAlready || assignedShiftCount >= maxShiftsPerWeek) {
          continue;
        }

        assignments[candidate.id][day] = [...(assignments[candidate.id][day] ?? []), shift];
        filled += 1;
      }
    });
  });

  return assignments;
};

const countAssignedShiftsForEmployee = (assignments = {}, employeeId, operatingHours = normalizeOperatingHours()) =>
  DAYS.reduce((total, day) => {
    if (!operatingHours[day]?.isOpen) {
      return total;
    }

    return total + ((assignments[employeeId]?.[day] ?? []).length);
  }, 0);

const calculateScheduleReview = ({
  assignments = {},
  requirements = {},
  employees = [],
  selectedRole = "",
  shiftTypes = BASE_SHIFT_TYPES,
  operatingHours = normalizeOperatingHours(),
}) => {
  const roleEmployees = employees.filter(
    (employee) => employee.status !== "archived" && employee.role === selectedRole
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
      const assigned = countAssignedShiftsForEmployee(assignments, employee.id, operatingHours);
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

const buildScheduleRecordId = (startDate, role) => `${startDate}__${role}`;

const upsertScheduleRecord = (schedules = [], nextRecord) => {
  const existingIndex = schedules.findIndex((entry) => entry.id === nextRecord.id);

  if (existingIndex === -1) {
    return [{ ...nextRecord, createdAt: nextRecord.createdAt || nextRecord.savedAt }, ...schedules];
  }

  return schedules.map((entry, index) => (
    index === existingIndex ? { ...entry, ...nextRecord, createdAt: entry.createdAt } : entry
  ));
};

const buildScheduleRecordFromLiveSchedule = (schedule, employees, settings, status, timestamp) => {
  const shiftTypes = getShiftTypes(settings);
  const operatingHours = normalizeOperatingHours(settings.operatingHours);
  const review = calculateScheduleReview({
    assignments: schedule.assignments,
    requirements: schedule.requirements,
    employees,
    selectedRole: schedule.selectedRole,
    shiftTypes,
    operatingHours,
  });

  return {
    id: buildScheduleRecordId(schedule.startDate, schedule.selectedRole),
    weekLabel: schedule.weekLabel,
    startDate: schedule.startDate,
    endDate: schedule.endDate,
    role: schedule.selectedRole,
    status,
    requirements: schedule.requirements,
    assignments: schedule.assignments,
    notes: schedule.notes,
    savedAt: timestamp,
    publishedAt: status === "published" ? timestamp : (schedule.lastPublishedAt ?? null),
    ...review,
  };
};

const hydrateScheduleForWeek = (state, startDate, selectedRole) => {
  const shiftTypes = getShiftTypes(state.settings);
  const operatingHours = normalizeOperatingHours(state.settings.operatingHours);
  const teamRoles = getTeamRoles(state.settings, state.employees);
  const recordsForWeek = startDate
    ? state.schedules.filter((entry) => entry.startDate === startDate)
    : [];
  const recordsByRole = Object.fromEntries(recordsForWeek.map((entry) => [entry.role, entry.requirements]));
  const roleRequirements = normalizeRoleRequirements(recordsByRole, teamRoles, "", {}, shiftTypes, operatingHours);
  const assignments = recordsForWeek.reduce(
    (nextAssignments, entry) => replaceAssignmentsForRole(
      nextAssignments,
      state.employees,
      entry.role,
      entry.assignments,
      shiftTypes,
      operatingHours
    ),
    createEmptyAssignments(state.employees, operatingHours)
  );
  const activeRecord = selectedRole ? recordsForWeek.find((entry) => entry.role === selectedRole) : null;

  return {
    hasUnsavedChanges: false,
    status: activeRecord ? activeRecord.status : "draft",
    notes: activeRecord ? activeRecord.notes : "",
    lastSavedAt: activeRecord ? activeRecord.savedAt : null,
    lastPublishedAt: activeRecord ? activeRecord.publishedAt : null,
    roleRequirements,
    requirements: selectedRole
      ? roleRequirements[selectedRole]
      : normalizeRequirements(createEmptyRequirements(shiftTypes), shiftTypes, operatingHours),
    assignments,
  };
};

const applyScheduleContext = (state, startDate, role) => {
  const weekRange = buildWeekRange(startDate, state.settings.weekStartsOn);

  return {
    ...state,
    schedule: {
      ...state.schedule,
      ...weekRange,
      selectedRole: role,
      ...hydrateScheduleForWeek(state, weekRange.startDate, role),
    },
  };
};

const migrateToScheduleRecords = (schedule = {}, employees = [], settings = {}) => {
  const shiftTypes = getShiftTypes(settings);
  const operatingHours = normalizeOperatingHours(settings.operatingHours);
  const legacyHistory = Array.isArray(schedule.publishHistory) ? schedule.publishHistory : [];

  const fromHistory = legacyHistory
    .filter((entry) => entry && entry.startDate && entry.selectedRole)
    .map((entry) => ({
      id: buildScheduleRecordId(entry.startDate, entry.selectedRole),
      weekLabel: entry.weekLabel,
      startDate: entry.startDate,
      endDate: entry.endDate,
      role: entry.selectedRole,
      status: "published",
      requirements: normalizeRequirements(entry.requirements, shiftTypes, operatingHours),
      assignments: normalizeAssignments(entry.assignments, employees, shiftTypes, operatingHours),
      notes: entry.notes ?? "",
      createdAt: entry.publishedAt,
      savedAt: entry.publishedAt,
      publishedAt: entry.publishedAt,
      coverageGaps: entry.coverageGaps,
      shiftCapAlerts: entry.shiftCapAlerts,
      metrics: entry.metrics,
    }));

  const legacyIsSavedDraft = Boolean(
    schedule.startDate
    && schedule.selectedRole
    && schedule.status !== "published"
    && schedule.lastSavedAt
    && !schedule.hasUnsavedChanges
  );

  const fromActiveDraft = legacyIsSavedDraft
    ? [{
      id: buildScheduleRecordId(schedule.startDate, schedule.selectedRole),
      weekLabel: schedule.weekLabel,
      startDate: schedule.startDate,
      endDate: schedule.endDate,
      role: schedule.selectedRole,
      status: "draft",
      requirements: normalizeRequirements(schedule.requirements, shiftTypes, operatingHours),
      assignments: normalizeAssignments(schedule.assignments, employees, shiftTypes, operatingHours),
      notes: schedule.notes ?? "",
      createdAt: schedule.lastSavedAt,
      savedAt: schedule.lastSavedAt,
      publishedAt: schedule.lastPublishedAt ?? null,
    }]
    : [];

  const byId = new Map();
  [...fromHistory, ...fromActiveDraft].forEach((record) => byId.set(record.id, record));

  return Array.from(byId.values());
};

const hasScheduleDraftProgress = (schedule = {}) => {
  const hasRequirements = Object.values(schedule.requirements ?? {}).some((dayRequirements) =>
    Object.values(dayRequirements ?? {}).some((requiredCount) => Number(requiredCount) > 0)
  );
  const hasAssignments = Object.values(schedule.assignments ?? {}).some((employeeAssignments) =>
    Object.values(employeeAssignments ?? {}).some((assignedShifts) => (assignedShifts ?? []).length > 0)
  );

  return Boolean(
    schedule.weekLabel
    || schedule.startDate
    || schedule.endDate
    || schedule.selectedRole
    || schedule.notes
    || hasRequirements
    || hasAssignments
  );
};

const createDefaultSchedule = (
  employees = defaultEmployees,
  shiftTypes = BASE_SHIFT_TYPES,
  selectedRole = "",
  operatingHours = normalizeOperatingHours()
) => {
  const requirements = normalizeRequirements(createEmptyRequirements(shiftTypes), shiftTypes, operatingHours);

  return {
    weekLabel: "",
    startDate: "",
    endDate: "",
    status: "draft",
    selectedRole,
    roleRequirements: selectedRole ? { [selectedRole]: requirements } : {},
    requirements,
    assignments: createEmptyAssignments(employees, operatingHours),
    notes: "",
    lastSavedAt: null,
    lastPublishedAt: null,
    hasUnsavedChanges: false,
  };
};

const createDefaultState = () => ({
  settings: {
    businessName: "ShiftSizzle",
    locationName: "Riverfront Grill",
    currentUserName: "Jennifer",
    schedulerName: "Jennifer Ray",
    publishNotifications: true,
    shiftTypes: [...BASE_SHIFT_TYPES],
    additionalTeamRoles: [],
    weekStartsOn: "",
    operatingHours: normalizeOperatingHours(),
  },
  employees: defaultEmployees,
  schedule: createDefaultSchedule(defaultEmployees, BASE_SHIFT_TYPES, "", normalizeOperatingHours()),
  schedules: [],
});

const normalizeSettings = (settings = {}, schedule = {}) => {
  const normalizedSettings = {
    ...createDefaultState().settings,
    ...settings,
    businessName: "ShiftSizzle",
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

const normalizeSchedule = (schedule = {}, employees = [], settings = {}) => {
  const shiftTypes = getShiftTypes(settings);
  const teamRoles = getTeamRoles(settings, employees);
  const operatingHours = normalizeOperatingHours(settings.operatingHours);
  const selectedRole = teamRoles.includes(schedule.selectedRole) ? schedule.selectedRole : "";
  const roleRequirements = normalizeRoleRequirements(
    schedule.roleRequirements,
    teamRoles,
    selectedRole,
    schedule.requirements,
    shiftTypes,
    operatingHours
  );
  const requirements = selectedRole ? roleRequirements[selectedRole] : normalizeRequirements(createEmptyRequirements(shiftTypes), shiftTypes, operatingHours);
  const assignments = normalizeAssignments(schedule.assignments, employees, shiftTypes, operatingHours);
  const lastSavedAt = typeof schedule.lastSavedAt === "string" && schedule.lastSavedAt
    ? schedule.lastSavedAt
    : schedule.status === "published" || Boolean(schedule.lastPublishedAt)
      ? schedule.lastPublishedAt
      : null;
  const { publishHistory: _legacyPublishHistory, ...restSchedule } = schedule;

  return {
    ...createDefaultSchedule(employees, shiftTypes, selectedRole, operatingHours),
    ...restSchedule,
    selectedRole,
    lastSavedAt,
    hasUnsavedChanges: typeof schedule.hasUnsavedChanges === "boolean"
      ? schedule.hasUnsavedChanges
      : Boolean(hasScheduleDraftProgress(schedule) && !lastSavedAt),
    roleRequirements,
    requirements,
    assignments,
  };
};

const AppStateContext = createContext(null);

const hydrateState = () => {
  if (typeof window === "undefined") {
    return createDefaultState();
  }

  const storedState = window.localStorage.getItem(STORAGE_KEY);

  if (!storedState) {
    return createDefaultState();
  }

  try {
    const parsedState = JSON.parse(storedState);
    const settings = normalizeSettings(parsedState.settings, parsedState.schedule);
    const shiftTypes = getShiftTypes(settings);
    const employees = (parsedState.employees ?? defaultEmployees).map((employee) => normalizeEmployee(employee, shiftTypes));
    const schedule = normalizeSchedule(parsedState.schedule, employees, settings);
    const existingSchedules = Array.isArray(parsedState.schedules) ? parsedState.schedules : [];
    const schedules = existingSchedules.length
      ? existingSchedules
      : migrateToScheduleRecords(parsedState.schedule ?? {}, employees, settings);

    return {
      ...createDefaultState(),
      ...parsedState,
      settings,
      employees,
      schedule,
      schedules,
    };
  } catch {
    return createDefaultState();
  }
};

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
          id: employee.id ?? Date.now() + nextEmployees.length,
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
      const selectedRole = teamRoles.includes(state.schedule.selectedRole) ? state.schedule.selectedRole : "";
      const weekRange = buildWeekRange(state.schedule.startDate, settings.weekStartsOn);
      const roleRequirements = normalizeRoleRequirements(
        state.schedule.roleRequirements,
        teamRoles,
        selectedRole,
        state.schedule.requirements,
        shiftTypes,
        operatingHours
      );
      const requirements = selectedRole
        ? roleRequirements[selectedRole]
        : normalizeRequirements(createEmptyRequirements(shiftTypes), shiftTypes, operatingHours);
      const assignments = normalizeAssignments(state.schedule.assignments, employees, shiftTypes, operatingHours);
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
          selectedRole,
          roleRequirements,
          requirements,
          assignments,
          ...draftResetFields,
        },
      };
    }
    case "SET_SCHEDULE_START_DATE": {
      return applyScheduleContext(state, action.payload, state.schedule.selectedRole);
    }
    case "UPDATE_REQUIREMENTS": {
      if (!state.schedule.selectedRole) {
        return state;
      }

      const shiftTypes = getShiftTypes(state.settings);
      const requirements = normalizeRequirements(action.payload, shiftTypes, state.settings.operatingHours);

      return {
        ...state,
        schedule: {
          ...state.schedule,
          roleRequirements: {
            ...(state.schedule.roleRequirements ?? {}),
            [state.schedule.selectedRole]: requirements,
          },
          requirements,
          hasUnsavedChanges: true,
          status: "draft",
        },
      };
    }
    case "SET_SELECTED_ROLE": {
      const shiftTypes = getShiftTypes(state.settings);
      const operatingHours = normalizeOperatingHours(state.settings.operatingHours);
      const nextSelectedRole = action.payload;
      const roleRequirements = normalizeRoleRequirements(
        state.schedule.roleRequirements,
        getTeamRoles(state.settings, state.employees),
        nextSelectedRole,
        state.schedule.requirements,
        shiftTypes,
        operatingHours
      );
      const requirements = nextSelectedRole
        ? roleRequirements[nextSelectedRole]
        : normalizeRequirements(createEmptyRequirements(shiftTypes), shiftTypes, operatingHours);

      return {
        ...state,
        schedule: {
          ...state.schedule,
          selectedRole: nextSelectedRole,
          hasUnsavedChanges: true,
          status: "draft",
          roleRequirements,
          requirements,
        },
      };
    }
    case "TOGGLE_ASSIGNMENT": {
      const { employeeId, day, shift } = action.payload;
      const employee = state.employees.find((currentEmployee) => currentEmployee.id === employeeId);

      if (!employee) {
        return state;
      }

      const currentDayAssignments = state.schedule.assignments[employeeId]?.[day] ?? [];
      const hasAssignment = currentDayAssignments.includes(shift);

      if (!hasAssignment) {
        const isAvailable = (employee.availability?.[day] ?? []).includes(shift);
        const assignedShiftCount = countAssignedShiftsForEmployee(
          state.schedule.assignments,
          employeeId,
          normalizeOperatingHours(state.settings.operatingHours),
        );
        const maxShiftsPerWeek = normalizeShiftsPerWeek(employee);

        if (!isAvailable || assignedShiftCount >= maxShiftsPerWeek) {
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
            ...state.schedule.assignments,
            [employeeId]: {
              ...(state.schedule.assignments[employeeId] ?? {}),
              [day]: nextDayAssignments,
            },
          },
        },
      };
    }
    case "AUTO_BUILD_SCHEDULE": {
      const shiftTypes = getShiftTypes(state.settings);
      const operatingHours = normalizeOperatingHours(state.settings.operatingHours);
      const hasCoverageTargets = Object.values(state.schedule.requirements ?? {}).some((dayRequirements) =>
        Object.values(dayRequirements ?? {}).some((requiredCount) => Number(requiredCount) > 0)
      );

      if (!state.schedule.startDate || !state.schedule.endDate || !state.schedule.selectedRole || !hasCoverageTargets) {
        return state;
      }

      return {
        ...state,
        schedule: {
          ...state.schedule,
          hasUnsavedChanges: true,
          status: "draft",
          assignments: replaceAssignmentsForRole(
            state.schedule.assignments,
            state.employees,
            state.schedule.selectedRole,
            buildAssignments(
              state.employees,
              state.schedule.selectedRole,
              state.schedule.requirements,
              shiftTypes,
              operatingHours
            ),
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
      if (!state.schedule.hasUnsavedChanges) {
        return state;
      }

      const savedAt = new Date().toISOString();
      const nextSchedule = {
        ...state.schedule,
        lastSavedAt: savedAt,
        hasUnsavedChanges: false,
        status: "draft",
      };
      const schedules = nextSchedule.startDate && nextSchedule.selectedRole
        ? upsertScheduleRecord(
          state.schedules,
          buildScheduleRecordFromLiveSchedule(nextSchedule, state.employees, state.settings, "draft", savedAt)
        )
        : state.schedules;

      return {
        ...state,
        schedule: nextSchedule,
        schedules,
      };
    }
    case "PUBLISH_SCHEDULE": {
      if (state.schedule.hasUnsavedChanges || !state.schedule.lastSavedAt) {
        return state;
      }

      const publishedAt = new Date().toISOString();
      const nextSchedule = {
        ...state.schedule,
        hasUnsavedChanges: false,
        status: "published",
        lastSavedAt: publishedAt,
        lastPublishedAt: publishedAt,
      };

      return {
        ...state,
        schedule: nextSchedule,
        schedules: upsertScheduleRecord(
          state.schedules,
          buildScheduleRecordFromLiveSchedule(nextSchedule, state.employees, state.settings, "published", publishedAt)
        ),
      };
    }
    case "START_NEW_SCHEDULE_CONTEXT": {
      const shiftTypes = getShiftTypes(state.settings);
      const operatingHours = normalizeOperatingHours(state.settings.operatingHours);

      return {
        ...state,
        schedule: createDefaultSchedule(state.employees, shiftTypes, "", operatingHours),
      };
    }
    case "RESUME_SCHEDULE": {
      const record = state.schedules.find((entry) => entry.id === action.payload);

      if (!record) {
        return state;
      }

      return applyScheduleContext(state, record.startDate, record.role);
    }
    case "SELECT_SCHEDULE_CONTEXT": {
      return applyScheduleContext(state, action.payload.startDate, action.payload.role);
    }
    default:
      return state;
  }
};

export const AppStateProvider = ({ children }) => {
  const [state, dispatch] = useReducer(appStateReducer, undefined, hydrateState);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

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