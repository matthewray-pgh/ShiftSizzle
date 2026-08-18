// Shared between AppState.jsx (local reducer identity) and supabaseSync.js
// (mapping DB rows back to that identity) — kept in its own module so
// neither has to import the other just for this one convention.
export const buildScheduleRecordId = (startDate, role) => `${startDate}__${role}`;
