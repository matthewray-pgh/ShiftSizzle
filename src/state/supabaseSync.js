// All Supabase table shapes (snake_case) <-> AppState.jsx shapes (camelCase)
// mapping, plus every Supabase call the app makes, live here — AppState.jsx
// stays free of column names and query syntax.
import { supabase } from '../lib/supabaseClient';
import { buildCallOutId, buildScheduleRecordId } from './scheduleRecordId';

const mapOrganizationRowToSettings = (row) => ({
  businessName: row.name,
  locationName: row.location_name,
  publishNotifications: row.publish_notifications,
  shiftTypes: row.shift_types,
  // Optional per-label time ranges; `{}` when the org has never set any.
  shiftTimes: row.shift_times ?? undefined,
  // The once-entered coverage template: { [role]: { [day]: { [shift]: n } } }.
  roleCoverage: row.role_coverage ?? undefined,
  // `team_roles` is the current column; `additional_team_roles` is only
  // read here so a not-yet-migrated org still hydrates (AppState folds the
  // legacy custom-only list back into the flat one).
  teamRoles: row.team_roles ?? undefined,
  additionalTeamRoles: row.additional_team_roles,
  weekStartsOn: row.week_starts_on,
  operatingHours: row.operating_hours,
});

const mapSettingsToOrganizationRow = (settings) => ({
  name: settings.businessName,
  location_name: settings.locationName,
  publish_notifications: settings.publishNotifications,
  shift_types: settings.shiftTypes,
  shift_times: settings.shiftTimes ?? {},
  role_coverage: settings.roleCoverage ?? {},
  team_roles: settings.teamRoles,
  week_starts_on: settings.weekStartsOn,
  operating_hours: settings.operatingHours,
});

const mapEmployeeRowToEmployee = (row, availability = {}, sharedLocationIds = []) => ({
  id: row.id,
  name: row.name,
  title: row.title,
  roles: row.roles ?? [],
  contact: row.contact,
  email: row.email,
  shiftsPerWeek: row.shifts_per_week,
  status: row.status,
  availability,
  // Home location. Absent/null on a not-yet-migrated backend (no
  // `location_id` column yet) — AppState backfills it from the resolved
  // current location on hydrate.
  locationId: row.location_id ?? null,
  // Shared (granted, non-home) access — folded in from employee_location_access
  // by fetchOrgBundle, the same way availability is folded in by employee_id.
  sharedLocationIds,
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
  location_id: employee.locationId ?? null,
});

const mapLocationRowToLocation = (row) => ({
  id: row.id,
  orgId: row.org_id,
  name: row.name,
  address: row.address,
  shiftTypes: row.shift_types,
  shiftTimes: row.shift_times ?? {},
  teamRoles: row.team_roles,
  weekStartsOn: row.week_starts_on,
  operatingHours: row.operating_hours,
  roleCoverage: row.role_coverage ?? {},
  isArchived: row.is_archived,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapLocationToLocationRow = (orgId, location) => ({
  id: location.id,
  org_id: orgId,
  name: location.name,
  address: location.address ?? '',
  shift_types: location.shiftTypes,
  shift_times: location.shiftTimes ?? {},
  team_roles: location.teamRoles,
  week_starts_on: location.weekStartsOn,
  operating_hours: location.operatingHours,
  role_coverage: location.roleCoverage ?? {},
  is_archived: location.isArchived ?? false,
});

// The DB's own uuid `id` is never surfaced to the reducer — locally, a
// schedule record is identified by `${startDate}__${role}` (see
// scheduleRecordId.js), and rows are upserted by the (org_id, start_date,
// role) unique constraint instead of by id. This map recomputes that local
// id from the row's own natural key so both stay in sync.
const mapScheduleRowToRecord = (row) => ({
  id: buildScheduleRecordId(row.start_date, row.role),
  locationId: row.location_id ?? null,
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

const mapCallOutRowToRecord = (row) => ({
  id: buildCallOutId(row.week_start_date, row.role, row.day, row.shift, row.employee_id),
  weekStartDate: row.week_start_date,
  role: row.role,
  day: row.day,
  shift: row.shift,
  employeeId: row.employee_id,
  calledOutAt: row.called_out_at,
  resolvedVia: row.resolved_via ?? null,
  coveredBy: row.covered_by ?? null,
});

const mapCallOutToRow = (orgId, callOut) => ({
  org_id: orgId,
  week_start_date: callOut.weekStartDate,
  role: callOut.role,
  day: callOut.day,
  shift: callOut.shift,
  employee_id: callOut.employeeId,
  called_out_at: callOut.calledOutAt,
  resolved_via: callOut.resolvedVia ?? null,
  covered_by: callOut.coveredBy ?? null,
});

const mapRecordToScheduleRow = (orgId, record) => ({
  org_id: orgId,
  // NOT NULL and part of the unique constraint after migration
  // 0007_locations.sql — a record synced before that migration runs and
  // before AppState has resolved a real location will fail this write
  // (logged, not fatal); it starts succeeding once both are in place.
  location_id: record.locationId ?? null,
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

// `call_outs` (migration 0006) is newer than the other tables. If it is
// missing, or its columns are, tolerate that — return no call-outs — rather
// than rejecting the whole bundle and dropping the app into offline mode.
const fetchCallOuts = async (orgId) => {
  try {
    const { data, error } = await supabase.from('call_outs').select('*').eq('org_id', orgId);

    if (error) {
      console.warn('call_outs unavailable (apply migration 0006_call_outs.sql to enable call-out sync)', error);
      return [];
    }

    return data.map(mapCallOutRowToRecord);
  } catch (error) {
    console.warn('call_outs fetch failed', error);
    return [];
  }
};

// `locations` (migration 0007) is newer still. Missing it entirely (table
// not yet created) is expected and tolerated the same way — AppState treats
// an empty array as "synthesize one implicit location from settings" rather
// than a hard error, so a not-yet-migrated org keeps working unchanged.
const fetchLocations = async (orgId) => {
  try {
    const { data, error } = await supabase.from('locations').select('*').eq('org_id', orgId);

    if (error) {
      console.warn('locations unavailable (apply migration 0007_locations.sql to enable multi-location support)', error);
      return [];
    }

    return data.map(mapLocationRowToLocation);
  } catch (error) {
    console.warn('locations fetch failed', error);
    return [];
  }
};

// No org_id column on this join table (see 0007_locations.sql) — fetched
// unfiltered and narrowed by RLS, same approach the spec calls for.
const fetchEmployeeLocationAccess = async () => {
  try {
    const { data, error } = await supabase.from('employee_location_access').select('employee_id, location_id');

    if (error) {
      console.warn('employee_location_access unavailable (apply migration 0007_locations.sql)', error);
      return [];
    }

    return data.map((row) => ({ employeeId: row.employee_id, locationId: row.location_id }));
  } catch (error) {
    console.warn('employee_location_access fetch failed', error);
    return [];
  }
};

export const fetchOrgBundle = async (orgId) => {
  const [orgResult, employeesResult, availabilityResult, scheduleResult, callOuts, locations, employeeLocationAccess] = await Promise.all([
    supabase.from('organizations').select('*').eq('id', orgId).single(),
    supabase.from('employees').select('*').eq('org_id', orgId),
    supabase.from('employee_availability').select('*').eq('org_id', orgId),
    supabase.from('schedule_records').select('*').eq('org_id', orgId),
    fetchCallOuts(orgId),
    fetchLocations(orgId),
    fetchEmployeeLocationAccess(),
  ]);

  if (orgResult.error) throw orgResult.error;
  if (employeesResult.error) throw employeesResult.error;
  if (availabilityResult.error) throw availabilityResult.error;
  if (scheduleResult.error) throw scheduleResult.error;

  const availabilityByEmployeeId = new Map(
    availabilityResult.data.map((row) => [row.employee_id, row.availability])
  );
  const sharedLocationIdsByEmployeeId = new Map();

  employeeLocationAccess.forEach(({ employeeId, locationId }) => {
    sharedLocationIdsByEmployeeId.set(employeeId, [...(sharedLocationIdsByEmployeeId.get(employeeId) ?? []), locationId]);
  });

  return {
    settings: mapOrganizationRowToSettings(orgResult.data),
    locations,
    employees: employeesResult.data.map((row) =>
      mapEmployeeRowToEmployee(
        row,
        availabilityByEmployeeId.get(row.id),
        sharedLocationIdsByEmployeeId.get(row.id) ?? [],
      )
    ),
    schedules: scheduleResult.data.map(mapScheduleRowToRecord),
    callOuts,
  };
};

// Each writer resolves to the error (or null on success) rather than
// swallowing it, so AppState's push loop can surface a sync-status and
// retry. A thrown network error is caught and returned in the same shape.
const runWrite = async (label, thunk) => {
  try {
    const { error } = await thunk();

    if (error) {
      console.error(`Failed to sync ${label} to Supabase`, error);
    }

    return error ?? null;
  } catch (error) {
    console.error(`Failed to sync ${label} to Supabase`, error);
    return error;
  }
};

export const upsertEmployeeRow = (orgId, employee) =>
  runWrite('employee', () => supabase.from('employees').upsert(mapEmployeeToEmployeeRow(orgId, employee)));

export const upsertAvailabilityRow = (orgId, employeeId, availability) =>
  runWrite('availability', () =>
    supabase.from('employee_availability').upsert({ employee_id: employeeId, org_id: orgId, availability }));

// NOTE: onConflict target matches the POST-migration-0007 unique constraint
// (location_id, start_date, role). This requires that migration to already
// be applied — the old (org_id, start_date, role) constraint it replaced no
// longer exists once it runs. Deploy the migration before this client code,
// per the spec's rollout order; deploying this first would make every
// schedule save fail (logged, retried, never succeeding) until it's applied.
export const upsertScheduleRecordRow = (orgId, record) =>
  runWrite('schedule record', () =>
    supabase
      .from('schedule_records')
      .upsert(mapRecordToScheduleRow(orgId, record), { onConflict: 'location_id,start_date,role' }));

// Matches the same natural key as the upsert's onConflict target — `record.id`
// is a client-side synthetic id (startDate + role), not the DB row's own
// primary key, so deleting by it directly isn't an option.
export const deleteScheduleRecordRow = (orgId, record) =>
  runWrite('schedule record delete', () =>
    supabase
      .from('schedule_records')
      .delete()
      .eq('org_id', orgId)
      .eq('location_id', record.locationId)
      .eq('start_date', record.startDate)
      .eq('role', record.role));

export const upsertLocationRow = (orgId, location) =>
  runWrite('location', () =>
    supabase.from('locations').upsert(mapLocationToLocationRow(orgId, location)));

export const updateOrganizationSettings = (orgId, settings) =>
  runWrite('settings', () =>
    supabase.from('organizations').update(mapSettingsToOrganizationRow(settings)).eq('id', orgId));

export const upsertCallOutRow = (orgId, callOut) =>
  runWrite('call-out', () =>
    supabase
      .from('call_outs')
      .upsert(mapCallOutToRow(orgId, callOut), { onConflict: 'org_id,week_start_date,role,day,shift,employee_id' }));

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
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'call_outs', filter: `org_id=eq.${orgId}` },
      (payload) => {
        const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
        onChange({ table: 'call_outs', eventType: payload.eventType, row: mapCallOutRowToRecord(row) });
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'locations', filter: `org_id=eq.${orgId}` },
      (payload) => {
        const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
        onChange({ table: 'locations', eventType: payload.eventType, row: mapLocationRowToLocation(row) });
      }
    )
    // No org_id column to filter on (see 0007_locations.sql) — RLS already
    // narrows this to rows the caller can see, same as the unfiltered fetch.
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'employee_location_access' },
      (payload) => {
        const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
        onChange({
          table: 'employee_location_access',
          eventType: payload.eventType,
          row: { employeeId: row.employee_id, locationId: row.location_id },
        });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};
