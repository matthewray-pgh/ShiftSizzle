import React, { useEffect, useMemo } from 'react';

import { ContentPanel } from '../../Components';
import { DAYS, getCurrentWeekStartDate, getOpenDays, getShiftTypes, getTeamRoles, getWeekView, useAppState } from '../../state/AppState';
import { useAuth } from '../../state/AuthState';

import './Dashboard.scss';

const formatTime = (timeValue) => {
  if (!timeValue) {
    return '';
  }

  const [hoursText = '0', minutesText = '00'] = timeValue.split(':');
  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return timeValue;
  }

  const period = hours >= 12 ? 'PM' : 'AM';
  const normalizedHours = hours % 12 || 12;

  return `${normalizedHours}:${`${minutes}`.padStart(2, '0')} ${period}`;
};

const buildOperatingHoursSummary = (operatingHours = {}) =>
  DAYS.map((day) => {
    const hours = operatingHours[day] ?? { isOpen: false, openTime: '', closeTime: '' };
    const label = hours.isOpen
      ? `${formatTime(hours.openTime)} - ${formatTime(hours.closeTime)}`
      : 'Closed';

    return { dayRange: day.slice(0, 3), label };
  });

export const Dashboard = () => {
  const { state, dispatch } = useAppState();
  const { employees, schedule: liveSchedule, settings } = state;
  const { user, membership } = useAuth();

  // Paint the app shell to match the header while this view is mounted.
  useEffect(() => {
    document.body.classList.add('dashboard-view');
    return () => document.body.classList.remove('dashboard-view');
  }, []);
  const shiftTypes = getShiftTypes(settings);
  const teamRoles = getTeamRoles(settings, employees);
  const operatingHoursSummary = useMemo(
    () => buildOperatingHoursSummary(settings.operatingHours),
    [settings.operatingHours]
  );

  const todayLabel = useMemo(
    () => new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
    []
  );

  // The Dashboard always reflects the actual current calendar week, not
  // whichever week happens to be loaded in the Scheduler's editing canvas
  // (a manager could be mid-draft on a future week). If the live canvas
  // already IS the current week, use it as-is so in-progress edits show up
  // immediately; otherwise read the current week straight from saved
  // history without disturbing whatever the manager is actively editing.
  const currentWeekStartDate = useMemo(
    () => getCurrentWeekStartDate(settings.weekStartsOn),
    [settings.weekStartsOn]
  );
  const schedule = useMemo(
    () => (
      currentWeekStartDate && liveSchedule.startDate === currentWeekStartDate
        ? liveSchedule
        : getWeekView(state, currentWeekStartDate)
    ),
    [state, liveSchedule, currentWeekStartDate]
  );

  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.status !== 'archived'),
    [employees]
  );

  const openDays = getOpenDays(settings);

  const me = activeEmployees.find((employee) => employee.id === membership?.employeeId);

  // ShiftSizzle is for every employee, not just managers — team-wide
  // operational content (coverage metrics, publish status) only makes
  // sense for whoever is actually running the schedule. Everyone else
  // just needs their own shifts, business hours, and any notes.
  const isManager = membership?.accountRole === 'owner' || membership?.accountRole === 'manager';

  // One row per day of the week — mirrors Business Hours' day-row list.
  // Each row still checks every role the employee holds, since someone
  // working both Bartender and Server can have shifts in either role's
  // assignment bucket on the same day.
  const myScheduleDays = useMemo(() => {
    if (!me) {
      return [];
    }

    return openDays.map((day) => ({
      day,
      roles: me.roles.map((role) => ({ role, shifts: schedule.assignments[role]?.[me.id]?.[day] ?? [] })),
    }));
  }, [me, openDays, schedule.assignments]);

  // Both metrics aggregate across every role for the active week — scoping
  // one to a single role while leaving the other role-agnostic is what let
  // this drift out of sync after switching roles (backlog #1). Since
  // assignments are role-scoped, summing per-role buckets here is now
  // genuinely additive (a shift only ever lives in one role's bucket, so
  // this can't double-count someone working multiple roles).
  const assignedShiftCount = useMemo(
    () =>
      teamRoles.reduce((roleTotal, role) => {
        const bucket = schedule.assignments[role] ?? {};

        return roleTotal + activeEmployees.reduce(
          (total, employee) =>
            total + DAYS.reduce((dayTotal, day) => dayTotal + (bucket[employee.id]?.[day] ?? []).length, 0),
          0
        );
      }, 0),
    [activeEmployees, schedule.assignments, teamRoles]
  );

  const openShiftCount = useMemo(
    () =>
      teamRoles.reduce((roleTotal, role) => {
        const requirements = schedule.roleRequirements?.[role] ?? {};
        const bucket = schedule.assignments[role] ?? {};
        const roleEmployees = activeEmployees.filter((employee) => employee.roles.includes(role));

        return roleTotal + DAYS.reduce(
          (dayTotal, day) =>
            dayTotal +
            shiftTypes.reduce((shiftTotal, shift) => {
              const required = requirements[day]?.[shift] ?? 0;
              const assigned = roleEmployees.reduce(
                (count, employee) => count + ((bucket[employee.id]?.[day] ?? []).includes(shift) ? 1 : 0),
                0
              );

              return shiftTotal + Math.max(required - assigned, 0);
            }, 0),
          0
        );
      }, 0),
    [activeEmployees, schedule.assignments, schedule.roleRequirements, shiftTypes, teamRoles]
  );

  const toggleMyAvailability = (day, shift) => {
    if (!me) {
      return;
    }

    const currentDayShifts = me.availability?.[day] ?? [];
    const hasShift = currentDayShifts.includes(shift);
    const nextDayShifts = hasShift
      ? currentDayShifts.filter((currentShift) => currentShift !== shift)
      : [...currentDayShifts, shift];

    dispatch({
      type: 'UPSERT_EMPLOYEE',
      payload: { ...me, availability: { ...me.availability, [day]: nextDayShifts } },
    });
  };

  const dashboardCards = [
    { label: 'Active employees', value: activeEmployees.length, accent: 'orange' },
    { label: 'Assigned shifts', value: assignedShiftCount, accent: 'blue' },
    { label: 'Open shifts', value: openShiftCount, accent: openShiftCount ? 'red' : 'green' },
  ];

  return (
    <div className="dashboard">
      <div className="dashboard__top">
        <div className="dashboard__hero">
          <p className="dashboard__today">
            <span className="dashboard__today-date">{todayLabel}</span>
            {schedule.weekLabel && (
              <span className="dashboard__today-week">{schedule.weekLabel}</span>
            )}
          </p>
          <h1>Hello, {me?.name ?? user?.email}</h1>
          <p className="dashboard__summary">
            {isManager
              ? `${schedule.status === 'published' ? 'Published' : 'Draft'} schedule for ${schedule.weekLabel} covering every role.`
              : `Here's what's on the schedule for ${schedule.weekLabel || 'this week'}.`}
          </p>
        </div>
        {isManager && (
          <div className="dashboard__card-grid">
            {dashboardCards.map((card) => (
              <article key={card.label} className={`dashboard__metric dashboard__metric--${card.accent}`}>
                <span>{card.label}</span>
                <strong>{card.value}</strong>
              </article>
            ))}
          </div>
        )}
      </div>

      <ContentPanel>
        <div className="dashboard__section-heading">
          <h2>This Week</h2>
          <span>{schedule.weekLabel}</span>
        </div>
        <div className="dashboard__two-column">
          <div className="dashboard__panel dashboard__panel--myschedule">
            <h3>My Schedule</h3>
            {!me ? (
              <p className="dashboard__myschedule-empty">
                Ask a manager to link your account to a roster profile to see your personal schedule here.
              </p>
            ) : openDays.length === 0 ? (
              <p className="dashboard__myschedule-empty">No operating days are enabled.</p>
            ) : (
              <div className="dashboard__myschedule-rows">
                {myScheduleDays.map(({ day, roles }) => {
                  const working = roles.filter((entry) => entry.shifts.length > 0);

                  return (
                    <div key={day} className="dashboard__myschedule-row">
                      <strong className="dashboard__myschedule-day">{day.slice(0, 3)}</strong>
                      {working.length ? (
                        <div className="dashboard__schedule-day-shifts">
                          {working.map(({ role, shifts }) => (
                            <span key={role} className="dashboard__schedule-chip">
                              {me.roles.length > 1 ? `${role}: ${shifts.join(', ')}` : shifts.join(', ')}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="dashboard__schedule-off">Off</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {me && (
            <div className="dashboard__panel dashboard__panel--availability">
              <h3>My Availability</h3>
              <div className="dashboard__availability-rows">
                {openDays.map((day) => (
                  <div key={day} className="dashboard__availability-row">
                    <strong className="dashboard__myschedule-day">{day.slice(0, 3)}</strong>
                    <div className="dashboard__availability-shifts">
                      {shiftTypes.map((shift) => {
                        const isAvailable = (me.availability?.[day] ?? []).includes(shift);

                        return (
                          <button
                            key={shift}
                            type="button"
                            className={`dashboard__availability-toggle ${isAvailable ? 'is-available' : ''}`.trim()}
                            onClick={() => toggleMyAvailability(day, shift)}
                            aria-pressed={isAvailable}
                          >
                            {shift}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="dashboard__panel dashboard__panel--highlight">
            <h3>Manager Notes</h3>
            <p>{schedule.notes}</p>
          </div>
          <div className="dashboard__panel dashboard__panel--hours">
            <h3>Business Hours</h3>
            <ul className="dashboard__hours-list">
              {operatingHoursSummary.map(({ dayRange, label }) => (
                <li key={`${dayRange}-${label}`} className="dashboard__hours-item">
                  <strong>{dayRange}</strong>
                  <span>{label}</span>
                </li>
              ))}
            </ul>
          </div>
          {isManager && (
            <div className="dashboard__panel">
              <h3>Publish Status</h3>
              <p>
                {schedule.lastPublishedAt
                  ? `Last published ${new Date(schedule.lastPublishedAt).toLocaleString()}`
                  : 'No published schedule yet.'}
              </p>
              <small>
                {schedule.status === 'published'
                  ? 'The active week is live for the whole team.'
                  : 'Finish the draft and publish when coverage blockers are resolved.'}
              </small>
            </div>
          )}
        </div>
      </ContentPanel>
    </div>
  );
};