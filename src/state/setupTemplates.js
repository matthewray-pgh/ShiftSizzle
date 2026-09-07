import { DAYS } from "./AppState";

// Business-type starter templates (§ schedule fast-start). Each one is a
// compact definition — shift labels + optional times, the roles that matter,
// weekday/weekend hours, and a per-role-per-shift headcount — that expands
// into a full `UPDATE_SETTINGS` payload. The point is to replace ~50 hand
// interactions in Settings (hours for 7 days, a 5x7x3 coverage grid) with a
// single tap plus review.
//
// `coverage` is stated once per (role, shift) and applied to every open day;
// the manager tunes per-day afterward in Settings if they need to.

const WEEKEND = new Set(["Saturday", "Sunday"]);

const TEMPLATE_DEFS = {
  "full-service-restaurant": {
    label: "Full-service restaurant",
    description: "Table service with lunch and dinner, front and back of house.",
    shiftTypes: ["Open", "Mid", "Close"],
    shiftTimes: {
      Open: { startTime: "10:00", endTime: "16:00" },
      Mid: { startTime: "12:00", endTime: "20:00" },
      Close: { startTime: "16:00", endTime: "23:00" },
    },
    teamRoles: ["Manager", "Server", "Host", "Bartender", "Cook"],
    hours: {
      weekday: { openTime: "11:00", closeTime: "22:00" },
      weekend: { openTime: "10:00", closeTime: "23:00" },
      closedDays: [],
    },
    coverage: {
      Manager: { Open: 1, Mid: 1, Close: 1 },
      Server: { Open: 2, Mid: 3, Close: 2 },
      Host: { Open: 1, Mid: 1, Close: 1 },
      Bartender: { Open: 1, Mid: 1, Close: 1 },
      Cook: { Open: 2, Mid: 2, Close: 2 },
    },
  },
  "cafe": {
    label: "Cafe / coffee shop",
    description: "Early open, counter service, winds down mid-afternoon.",
    shiftTypes: ["Open", "Mid", "Close"],
    shiftTimes: {
      Open: { startTime: "06:00", endTime: "11:00" },
      Mid: { startTime: "10:00", endTime: "15:00" },
      Close: { startTime: "14:00", endTime: "18:00" },
    },
    teamRoles: ["Shift Lead", "Barista", "Cook"],
    hours: {
      weekday: { openTime: "06:00", closeTime: "18:00" },
      weekend: { openTime: "07:00", closeTime: "17:00" },
      closedDays: [],
    },
    coverage: {
      "Shift Lead": { Open: 1, Mid: 1, Close: 1 },
      Barista: { Open: 2, Mid: 2, Close: 1 },
      Cook: { Open: 1, Mid: 1, Close: 1 },
    },
  },
  "bar": {
    label: "Bar / pub",
    description: "Afternoon open, late close, no morning shift.",
    shiftTypes: ["Mid", "Close"],
    shiftTimes: {
      Mid: { startTime: "15:00", endTime: "21:00" },
      Close: { startTime: "20:00", endTime: "02:00" },
    },
    teamRoles: ["Manager", "Bartender", "Server", "Security"],
    hours: {
      weekday: { openTime: "15:00", closeTime: "00:00" },
      weekend: { openTime: "13:00", closeTime: "02:00" },
      closedDays: ["Monday"],
    },
    coverage: {
      Manager: { Mid: 1, Close: 1 },
      Bartender: { Mid: 2, Close: 3 },
      Server: { Mid: 1, Close: 2 },
      Security: { Mid: 0, Close: 1 },
    },
  },
  "quick-service": {
    label: "Quick-service / counter",
    description: "Fast counter service with a lunch rush, one continuous day.",
    shiftTypes: ["Open", "Mid", "Close"],
    shiftTimes: {
      Open: { startTime: "07:00", endTime: "12:00" },
      Mid: { startTime: "11:00", endTime: "16:00" },
      Close: { startTime: "15:00", endTime: "21:00" },
    },
    teamRoles: ["Shift Lead", "Cashier", "Cook"],
    hours: {
      weekday: { openTime: "07:00", closeTime: "21:00" },
      weekend: { openTime: "08:00", closeTime: "21:00" },
      closedDays: [],
    },
    coverage: {
      "Shift Lead": { Open: 1, Mid: 1, Close: 1 },
      Cashier: { Open: 1, Mid: 2, Close: 1 },
      Cook: { Open: 2, Mid: 3, Close: 2 },
    },
  },
  "pizza-delivery": {
    label: "Pizza / delivery",
    description: "Phone and online orders with a dinner rush and a driver crew.",
    shiftTypes: ["Lunch", "Dinner", "Close"],
    shiftTimes: {
      Lunch: { startTime: "10:30", endTime: "16:00" },
      Dinner: { startTime: "15:00", endTime: "21:00" },
      Close: { startTime: "20:00", endTime: "00:00" },
    },
    teamRoles: ["Manager", "Cook", "Driver", "Cashier"],
    hours: {
      weekday: { openTime: "10:30", closeTime: "23:00" },
      weekend: { openTime: "10:30", closeTime: "01:00" },
      closedDays: [],
    },
    coverage: {
      Manager: { Lunch: 1, Dinner: 1, Close: 1 },
      Cook: { Lunch: 1, Dinner: 3, Close: 2 },
      Driver: { Lunch: 1, Dinner: 4, Close: 2 },
      Cashier: { Lunch: 1, Dinner: 2, Close: 1 },
    },
  },
  "retail": {
    label: "Retail store",
    description: "One open shift and one close shift, open every day.",
    shiftTypes: ["Open", "Close"],
    shiftTimes: {
      Open: { startTime: "09:00", endTime: "14:00" },
      Close: { startTime: "14:00", endTime: "19:00" },
    },
    teamRoles: ["Manager", "Sales Associate", "Stock"],
    hours: {
      weekday: { openTime: "09:00", closeTime: "19:00" },
      weekend: { openTime: "10:00", closeTime: "18:00" },
      closedDays: [],
    },
    coverage: {
      Manager: { Open: 1, Close: 1 },
      "Sales Associate": { Open: 2, Close: 2 },
      Stock: { Open: 1, Close: 1 },
    },
  },
};

export const SETUP_TEMPLATE_IDS = Object.keys(TEMPLATE_DEFS);

// Menu data for a template picker — no grids, just what a person chooses from.
export const SETUP_TEMPLATES = SETUP_TEMPLATE_IDS.map((id) => ({
  id,
  label: TEMPLATE_DEFS[id].label,
  description: TEMPLATE_DEFS[id].description,
  roles: [...TEMPLATE_DEFS[id].teamRoles],
  shiftTypes: [...TEMPLATE_DEFS[id].shiftTypes],
}));

export const getSetupTemplate = (templateId) => TEMPLATE_DEFS[templateId] ?? null;

// Expand `hours` (weekday/weekend slots + closed days) into a full 7-day
// operatingHours map.
export const buildTemplateOperatingHours = (hours = {}) =>
  Object.fromEntries(
    DAYS.map((day) => {
      if ((hours.closedDays ?? []).includes(day)) {
        return [day, { isOpen: false, openTime: "", closeTime: "" }];
      }

      const slot = (WEEKEND.has(day) ? hours.weekend : hours.weekday) ?? hours.weekday ?? {};

      return [
        day,
        {
          isOpen: true,
          openTime: slot.openTime ?? "",
          closeTime: slot.closeTime ?? "",
        },
      ];
    })
  );

// Expand the per-(role, shift) `coverage` spec into a full
// { [role]: { [day]: { [shift]: count } } } grid. Closed days get zeros so
// the grid stays well-formed; the template's non-zero intent is preserved on
// open days only.
export const buildTemplateRoleCoverage = (coverage = {}, operatingHours = {}) =>
  Object.fromEntries(
    Object.entries(coverage).map(([role, byShift]) => [
      role,
      Object.fromEntries(
        DAYS.map((day) => [
          day,
          Object.fromEntries(
            Object.keys(byShift).map((shift) => [
              shift,
              operatingHours[day]?.isOpen ? Math.max(0, Number(byShift[shift]) || 0) : 0,
            ])
          ),
        ])
      ),
    ])
  );

// The full settings payload for a `UPDATE_SETTINGS` dispatch. `weekStartsOn`
// is only filled when the org hasn't picked one yet, so re-applying a
// template never silently moves an established week boundary. Pass
// `weekStartsOn` in `overrides` to honor an explicit choice (e.g. from the
// setup wizard).
export const settingsFromTemplate = (templateId, { currentSettings = {}, weekStartsOn } = {}) => {
  const def = TEMPLATE_DEFS[templateId];

  if (!def) {
    return null;
  }

  const operatingHours = buildTemplateOperatingHours(def.hours);

  return {
    shiftTypes: [...def.shiftTypes],
    shiftTimes: def.shiftTimes ? JSON.parse(JSON.stringify(def.shiftTimes)) : {},
    teamRoles: [...def.teamRoles],
    operatingHours,
    roleCoverage: buildTemplateRoleCoverage(def.coverage, operatingHours),
    weekStartsOn: weekStartsOn || currentSettings.weekStartsOn || "Monday",
  };
};
