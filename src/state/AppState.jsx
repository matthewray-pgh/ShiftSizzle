import { createContext, useContext, useEffect, useMemo, useReducer } from "react";

const STORAGE_KEY = "shiftsizzle.app-state.v1";

export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// TODO: Move shift definitions into business-configured settings before adding availability to roster import/export.
// For the first roster import flow, limit bulk import to employee profile fields and revisit availability once shifts are configurable.
export const SHIFT_TYPES = ["Open", "Mid", "Close"];

export const TEAM_ROLES = Object.freeze({
  MANAGER: "Manager",
  SERVER: "Server",
  HOST: "Host",
  BARTENDER: "Bartender",
  COOK: "Cook",
});

const defaultRequirements = {
  Sunday: { Open: 1, Mid: 1, Close: 1 },
  Monday: { Open: 1, Mid: 0, Close: 1 },
  Tuesday: { Open: 1, Mid: 0, Close: 1 },
  Wednesday: { Open: 1, Mid: 1, Close: 1 },
  Thursday: { Open: 1, Mid: 1, Close: 1 },
  Friday: { Open: 1, Mid: 2, Close: 1 },
  Saturday: { Open: 1, Mid: 1, Close: 1 },
};

const createAvailability = (allowedShifts = SHIFT_TYPES) =>
  Object.fromEntries(DAYS.map((day) => [day, [...allowedShifts]]));

const defaultEmployees = [
  {
    id: 1,
    name: "Jen Ray",
    title: "General Manager",
    role: TEAM_ROLES.MANAGER,
    contact: "(555) 010-1001",
    email: "jen@shiftsizzle.app",
    preferredHours: 40,
    status: "active",
    availability: createAvailability(),
  },
  {
    id: 2,
    name: "Ryan Sutton",
    title: "Assistant General Manager",
    role: TEAM_ROLES.MANAGER,
    contact: "(555) 010-1002",
    email: "ryan@shiftsizzle.app",
    preferredHours: 40,
    status: "active",
    availability: createAvailability(["Open", "Mid"]),
  },
  {
    id: 3,
    name: "Kayla Brooks",
    title: "Bar Manager",
    role: TEAM_ROLES.BARTENDER,
    contact: "(555) 010-1003",
    email: "kayla@shiftsizzle.app",
    preferredHours: 35,
    status: "active",
    availability: createAvailability(["Mid", "Close"]),
  },
  {
    id: 4,
    name: "Kirk Brady",
    title: "Director",
    role: TEAM_ROLES.MANAGER,
    contact: "(555) 010-1004",
    email: "kirk@shiftsizzle.app",
    preferredHours: 32,
    status: "active",
    availability: createAvailability(["Open", "Close"]),
  },
  {
    id: 5,
    name: "Jackie Carter",
    title: "Lead Host",
    role: TEAM_ROLES.HOST,
    contact: "(555) 010-1005",
    email: "jackie@shiftsizzle.app",
    preferredHours: 30,
    status: "active",
    availability: createAvailability(),
  },
  {
    id: 6,
    name: "Marco Ellis",
    title: "Line Cook",
    role: TEAM_ROLES.COOK,
    contact: "(555) 010-1006",
    email: "marco@shiftsizzle.app",
    preferredHours: 38,
    status: "active",
    availability: createAvailability(["Open", "Mid"]),
  },
  {
    id: 7,
    name: "Ariana Cole",
    title: "Server",
    role: TEAM_ROLES.SERVER,
    contact: "(555) 010-1007",
    email: "ariana@shiftsizzle.app",
    preferredHours: 28,
    status: "active",
    availability: createAvailability(["Mid", "Close"]),
  },
];

const buildAssignments = (employees, role, requirements) => {
  const assignments = Object.fromEntries(employees.map((employee) => [employee.id, {}]));
  const eligibleEmployees = employees.filter(
    (employee) => employee.role === role && employee.status !== "archived"
  );

  if (!eligibleEmployees.length) {
    return assignments;
  }

  let index = 0;

  DAYS.forEach((day) => {
    SHIFT_TYPES.forEach((shift) => {
      const needed = requirements[day]?.[shift] ?? 0;
      let attempts = 0;
      let filled = 0;

      while (filled < needed && attempts < eligibleEmployees.length * 3) {
        const candidate = eligibleEmployees[index % eligibleEmployees.length];
        index += 1;
        attempts += 1;

        const availableShifts = candidate.availability?.[day] ?? [];
        const hasShiftAlready = assignments[candidate.id][day]?.includes(shift);

        if (!availableShifts.includes(shift) || hasShiftAlready) {
          continue;
        }

        assignments[candidate.id][day] = [...(assignments[candidate.id][day] ?? []), shift];
        filled += 1;
      }
    });
  });

  return assignments;
};

const createDefaultState = () => ({
  settings: {
    businessName: "ShiftSizzle",
    locationName: "Riverfront Grill",
    currentUserName: "Jennifer",
    schedulerName: "Jennifer Ray",
    publishNotifications: true,
  },
  employees: defaultEmployees,
  schedule: {
    weekLabel: "May 24 - May 30, 2026",
    startDate: "2026-05-24",
    endDate: "2026-05-30",
    status: "draft",
    selectedRole: TEAM_ROLES.MANAGER,
    requirements: defaultRequirements,
    assignments: buildAssignments(defaultEmployees, TEAM_ROLES.MANAGER, defaultRequirements),
    notes: "Review closing coverage before Friday publish.",
    lastPublishedAt: null,
  },
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

const normalizeSettings = (settings = {}) => ({
  ...createDefaultState().settings,
  ...settings,
  businessName: "ShiftSizzle",
});

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

    return {
      ...createDefaultState(),
      ...parsedState,
      settings: normalizeSettings(parsedState.settings),
    };
  } catch {
    return createDefaultState();
  }
};

const appStateReducer = (state, action) => {
  switch (action.type) {
    case "UPSERT_EMPLOYEE": {
      const employee = {
        ...action.payload,
        availability: action.payload.availability ?? createAvailability(),
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
      const employees = action.payload.reduce((nextEmployees, employee) => {
        const normalizedEmployee = {
          ...employee,
          id: employee.id ?? Date.now() + nextEmployees.length,
          availability: employee.availability ?? createAvailability(),
          status: employee.status ?? "active",
        };
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
      return {
        ...state,
        settings: {
          ...state.settings,
          ...action.payload,
          businessName: "ShiftSizzle",
        },
      };
    }
    case "UPDATE_REQUIREMENTS": {
      return {
        ...state,
        schedule: {
          ...state.schedule,
          requirements: action.payload,
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
          assignments: buildAssignments(state.employees, action.payload, state.schedule.requirements),
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
            state.schedule.requirements
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