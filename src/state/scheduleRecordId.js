// Shared between AppState.jsx (local reducer identity) and supabaseSync.js
// (mapping DB rows back to that identity) — kept in its own module so
// neither has to import the other just for this one convention.
export const buildScheduleRecordId = (startDate, role) => `${startDate}__${role}`;

// Local identity for a call-out event — one per person per scheduled slot,
// matching the (week, role, day, shift, employee) unique key on the DB row.
export const buildCallOutId = (weekStartDate, role, day, shift, employeeId) =>
  `${weekStartDate}__${role}__${day}__${shift}__${employeeId}`;
