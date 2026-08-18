// All Supabase table shapes (snake_case) <-> AppState.jsx shapes (camelCase)
// mapping, plus every Supabase call the app makes, live here — AppState.jsx
// stays free of column names and query syntax.
import { supabase } from '../lib/supabaseClient';
import { buildScheduleRecordId } from './scheduleRecordId';

const mapOrganizationRowToSettings = (row) => ({
  businessName: row.name,
  locationName: row.location_name,
  schedulerName: row.scheduler_name,
  publishNotifications: row.publish_notifications,
  shiftTypes: row.shift_types,
  additionalTeamRoles: row.additional_team_roles,
  weekStartsOn: row.week_starts_on,
  operatingHours: row.operating_hours,
});

const mapSettingsToOrganizationRow = (settings) => ({
  name: settings.businessName,
  location_name: settings.locationName,
  scheduler_name: settings.schedulerName,
  publish_notifications: settings.publishNotifications,
  shift_types: settings.shiftTypes,
  additional_team_roles: settings.additionalTeamRoles,
  week_starts_on: settings.weekStartsOn,
  operating_hours: settings.operatingHours,
});

const mapEmployeeRowToEmployee = (row, availability = {}) => ({
  id: row.id,
  name: row.name,
  title: row.title,
  roles: row.roles ?? [],
  contact: row.contact,
  email: row.email,
  shiftsPerWeek: row.shifts_per_week,
  status: row.status,
  availability,
});

const mapEmployeeToEmployeeRow = (orgId, employee) => ({
  id: employee.id,
  org_id: orgId,
  name: employee.name,
  title: employee.title,
  roles: employee.roles,
  contact: employee.contact,
  email: employee.email,
  shifts_per_week: employee.shiftsPerWeek,
  status: employee.status,
});

// The DB's own uuid `id` is never surfaced to the reducer — locally, a
// schedule record is identified by `${startDate}__${role}` (see
// scheduleRecordId.js), and rows are upserted by the (org_id, start_date,
// role) unique constraint instead of by id. This map recomputes that local
// id from the row's own natural key so both stay in sync.
const mapScheduleRowToRecord = (row) => ({
  id: buildScheduleRecordId(row.start_date, row.role),
  weekLabel: row.week_label,
  startDate: row.start_date,
  endDate: row.end_date,
  role: row.role,
  status: row.status,
  requirements: row.requirements,
  assignments: row.assignments,
  notes: row.notes,
  savedAt: row.saved_at,
  publishedAt: row.published_at,
  createdAt: row.created_at,
});

const mapRecordToScheduleRow = (orgId, record) => ({
  org_id: orgId,
  week_label: record.weekLabel,
  start_date: record.startDate,
  end_date: record.endDate,
  role: record.role,
  status: record.status,
  requirements: record.requirements,
  assignments: record.assignments,
  notes: record.notes,
  saved_at: record.savedAt,
  published_at: record.publishedAt,
});

export const fetchOrgBundle = async (orgId) => {
  const [orgResult, employeesResult, availabilityResult, scheduleResult] = await Promise.all([
    supabase.from('organizations').select('*').eq('id', orgId).single(),
    supabase.from('employees').select('*').eq('org_id', orgId),
    supabase.from('employee_availability').select('*').eq('org_id', orgId),
    supabase.from('schedule_records').select('*').eq('org_id', orgId),
  ]);

  if (orgResult.error) throw orgResult.error;
  if (employeesResult.error) throw employeesResult.error;
  if (availabilityResult.error) throw availabilityResult.error;
  if (scheduleResult.error) throw scheduleResult.error;

  const availabilityByEmployeeId = new Map(
    availabilityResult.data.map((row) => [row.employee_id, row.availability])
  );

  return {
    settings: mapOrganizationRowToSettings(orgResult.data),
    employees: employeesResult.data.map((row) =>
      mapEmployeeRowToEmployee(row, availabilityByEmployeeId.get(row.id))
    ),
    schedules: scheduleResult.data.map(mapScheduleRowToRecord),
  };
};

export const upsertEmployeeRow = async (orgId, employee) => {
  const { error } = await supabase.from('employees').upsert(mapEmployeeToEmployeeRow(orgId, employee));

  if (error) {
    console.error('Failed to sync employee to Supabase', error);
  }
};

export const upsertAvailabilityRow = async (orgId, employeeId, availability) => {
  const { error } = await supabase
    .from('employee_availability')
    .upsert({ employee_id: employeeId, org_id: orgId, availability });

  if (error) {
    console.error('Failed to sync availability to Supabase', error);
  }
};

export const upsertScheduleRecordRow = async (orgId, record) => {
  const { error } = await supabase
    .from('schedule_records')
    .upsert(mapRecordToScheduleRow(orgId, record), { onConflict: 'org_id,start_date,role' });

  if (error) {
    console.error('Failed to sync schedule record to Supabase', error);
  }
};

export const updateOrganizationSettings = async (orgId, settings) => {
  const { error } = await supabase
    .from('organizations')
    .update(mapSettingsToOrganizationRow(settings))
    .eq('id', orgId);

  if (error) {
    console.error('Failed to sync settings to Supabase', error);
  }
};

// Realtime: other sessions' writes to this org's data get pushed into local
// state via onChange -> MERGE_SERVER_RECORD, in the same camelCase shape
// fetchOrgBundle produces, so AppState.jsx never has to know about columns.
export const subscribeToOrgChanges = (orgId, onChange) => {
  const channel = supabase
    .channel(`org-${orgId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'employees', filter: `org_id=eq.${orgId}` },
      (payload) => {
        const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
        onChange({ table: 'employees', eventType: payload.eventType, row: mapEmployeeRowToEmployee(row) });
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'employee_availability', filter: `org_id=eq.${orgId}` },
      (payload) => {
        const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
        onChange({
          table: 'employee_availability',
          eventType: payload.eventType,
          row: { employeeId: row.employee_id, availability: row.availability },
        });
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'schedule_records', filter: `org_id=eq.${orgId}` },
      (payload) => {
        const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
        onChange({ table: 'schedule_records', eventType: payload.eventType, row: mapScheduleRowToRecord(row) });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};
