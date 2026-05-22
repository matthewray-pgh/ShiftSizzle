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

const baseRequirements = {
  Sunday: { Open: 1, Mid: 1, Close: 1 },
  Monday: { Open: 1, Mid: 0, Close: 1 },
  Tuesday: { Open: 1, Mid: 0, Close: 1 },
  Wednesday: { Open: 1, Mid: 1, Close: 1 },
  Thursday: { Open: 1, Mid: 1, Close: 1 },
  Friday: { Open: 1, Mid: 2, Close: 1 },
  Saturday: { Open: 1, Mid: 1, Close: 1 },
};

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

const createDefaultRequirements = (shiftTypes = BASE_SHIFT_TYPES) =>
  Object.fromEntries(
    DAYS.map((day) => [
      day,
      Object.fromEntries(shiftTypes.map((shift) => [shift, baseRequirements[day]?.[shift] ?? 0])),
    ])
  );

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

const createDefaultSchedule = (
  employees = defaultEmployees,
  shiftTypes = BASE_SHIFT_TYPES,
  selectedRole = DEFAULT_TEAM_ROLE,
  operatingHours = normalizeOperatingHours()
) => {
  const requirements = normalizeRequirements(createDefaultRequirements(shiftTypes), shiftTypes, operatingHours);

  return {
    weekLabel: "May 24 - May 30, 2026",
    startDate: "2026-05-24",
    endDate: "2026-05-30",
    status: "draft",
    selectedRole,
    requirements,
    assignments: buildAssignments(employees, selectedRole, requirements, shiftTypes, operatingHours),
    notes: "Review closing coverage before Friday publish.",
    lastPublishedAt: null,
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
    operatingHours: normalizeOperatingHours(),
  },
  employees: defaultEmployees,
  schedule: createDefaultSchedule(defaultEmployees, BASE_SHIFT_TYPES, DEFAULT_TEAM_ROLE, normalizeOperatingHours()),
  messages: [
    {
      id: 1,
      title: "Welcome to ShiftSizzle",
      body: "Your staffing dashboard is ready. Build this week's manager schedule and publish when coverage is complete.",
      createdAt: "2026-05-21T09:00:00.000Z",
      status: "unread",
      audience: "manager",
    },
  ],
});

const normalizeSettings = (settings = {}) => {
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
    operatingHours: normalizeOperatingHours(normalizedSettings.operatingHours),
  };
};

const normalizeSchedule = (schedule = {}, employees = [], settings = {}) => {
  const shiftTypes = getShiftTypes(settings);
  const teamRoles = getTeamRoles(settings, employees);
  const operatingHours = normalizeOperatingHours(settings.operatingHours);
  const selectedRole = teamRoles.includes(schedule.selectedRole) ? schedule.selectedRole : teamRoles[0];
  const requirements = normalizeRequirements(schedule.requirements, shiftTypes, operatingHours);
  const assignments = Object.keys(schedule.assignments ?? {}).length
    ? normalizeAssignments(schedule.assignments, employees, shiftTypes, operatingHours)
    : buildAssignments(employees, selectedRole, requirements, shiftTypes, operatingHours);

  return {
    ...createDefaultSchedule(employees, shiftTypes, selectedRole, operatingHours),
    ...schedule,
    selectedRole,
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
    const settings = normalizeSettings(parsedState.settings);
    const shiftTypes = getShiftTypes(settings);
    const employees = (parsedState.employees ?? defaultEmployees).map((employee) => normalizeEmployee(employee, shiftTypes));
    const schedule = normalizeSchedule(parsedState.schedule, employees, settings);

    return {
      ...createDefaultState(),
      ...parsedState,
      settings,
      employees,
      schedule,
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
      const selectedRole = teamRoles.includes(state.schedule.selectedRole) ? state.schedule.selectedRole : teamRoles[0];
      const requirements = normalizeRequirements(state.schedule.requirements, shiftTypes, operatingHours);
      const assignments = normalizeAssignments(state.schedule.assignments, employees, shiftTypes, operatingHours);

      return {
        ...state,
        settings,
        employees,
        schedule: {
          ...state.schedule,
          selectedRole,
          requirements,
          assignments,
          status: "draft",
        },
      };
    }
    case "UPDATE_REQUIREMENTS": {
      const shiftTypes = getShiftTypes(state.settings);

      return {
        ...state,
        schedule: {
          ...state.schedule,
          requirements: normalizeRequirements(action.payload, shiftTypes, state.settings.operatingHours),
          status: "draft",
        },
      };
    }
    case "SET_SELECTED_ROLE": {
      return {
        ...state,
        schedule: {
          ...state.schedule,
          selectedRole: action.payload,
          status: "draft",
          assignments: buildAssignments(
            state.employees,
            action.payload,
            state.schedule.requirements,
            getShiftTypes(state.settings),
            state.settings.operatingHours
          ),
        },
      };
    }
    case "TOGGLE_ASSIGNMENT": {
      const { employeeId, day, shift } = action.payload;
      const currentDayAssignments = state.schedule.assignments[employeeId]?.[day] ?? [];
      const hasAssignment = currentDayAssignments.includes(shift);
      const nextDayAssignments = hasAssignment
        ? currentDayAssignments.filter((currentShift) => currentShift !== shift)
        : [...currentDayAssignments, shift];

      return {
        ...state,
        schedule: {
          ...state.schedule,
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
      return {
        ...state,
        schedule: {
          ...state.schedule,
          status: "draft",
          assignments: buildAssignments(
            state.employees,
            state.schedule.selectedRole,
            state.schedule.requirements,
            getShiftTypes(state.settings),
            state.settings.operatingHours
          ),
        },
      };
    }
    case "UPDATE_SCHEDULE_NOTES": {
      return {
        ...state,
        schedule: {
          ...state.schedule,
          notes: action.payload,
        },
      };
    }
    case "PUBLISH_SCHEDULE": {
      const publishTimestamp = new Date().toISOString();
      const assignedEmployees = state.employees.filter((employee) => {
        const employeeAssignments = state.schedule.assignments[employee.id] ?? {};
        return DAYS.some((day) => (employeeAssignments[day] ?? []).length > 0);
      });

      return {
        ...state,
        schedule: {
          ...state.schedule,
          status: "published",
          lastPublishedAt: publishTimestamp,
        },
        messages: [
          {
            id: Date.now(),
            title: `Schedule published for ${state.schedule.weekLabel}`,
            body: `Published ${assignedEmployees.length} employee schedules for ${state.schedule.selectedRole} coverage.`,
            createdAt: publishTimestamp,
            status: "unread",
            audience: "team",
          },
          ...state.messages,
        ],
      };
    }
    case "MARK_MESSAGE_READ": {
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === action.payload ? { ...message, status: "read" } : message
        ),
      };
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