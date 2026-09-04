import React, { useEffect, useMemo } from 'react';

import { ContentPanel } from '../../Components';
import { computeWeekReviewTotals, DAYS, getCurrentWeekStartDate, getOpenDays, getShiftTypes, getTeamRoles, getWeekView, useAppState } from '../../state/AppState';
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

// Total assigned shift slots for a week, across every role — a shift only
// ever lives in one role's bucket so summing per-role is additive.
const countAssignedForWeek = (weekSchedule, teamRoles, activeEmployees) =>
  teamRoles.reduce((roleTotal, role) => {
    const bucket = weekSchedule.assignments?.[role] ?? {};

    return roleTotal + activeEmployees.reduce(
      (total, employee) =>
        total + DAYS.reduce((dayTotal, day) => dayTotal + (bucket[employee.id]?.[day] ?? []).length, 0),
      0
    );
  }, 0);

// Unfilled required slots for a week, across every role.
const countOpenForWeek = (weekSchedule, teamRoles, activeEmployees, shiftTypes) =>
  teamRoles.reduce((roleTotal, role) => {
    const requirements = weekSchedule.roleRequirements?.[role] ?? {};
    const bucket = weekSchedule.assignments?.[role] ?? {};
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
  }, 0);

// The week immediately before `weekStartDate` (an ISO yyyy-mm-dd string),
// used to diff this week's metrics against last week's.
const getPreviousWeekStartDate = (weekStartDate) => {
  if (!weekStartDate) {
    return '';
  }

  const start = new Date(`${weekStartDate}T00:00:00`);

  if (Number.isNaN(start.getTime())) {
    return '';
  }

  start.setDate(start.getDate() - 7);

  const year = start.getFullYear();
  const month = `${start.getMonth() + 1}`.padStart(2, '0');
  const day = `${start.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
};

// Renders the line under a metric's number: either a week-over-week delta
// (arrow + count) or a static status pill (dot + label).
const MetricTrend = ({ trend }) => {
  if (trend.kind === 'delta') {
    const isFlat = trend.value === 0;
    const isGood = trend.invert ? trend.value < 0 : trend.value > 0;
    const tone = isFlat ? 'neutral' : isGood ? 'positive' : 'critical';
    const arrow = isFlat ? 'fa-minus' : trend.value > 0 ? 'fa-arrow-up' : 'fa-arrow-down';

    return (
      <span className={`dashboard__metric-trend dashboard__metric-trend--${tone}`}>
        <i className={`fas ${arrow}`} aria-hidden="true"></i>
        <span className="dashboard__metric-trend-value">
          {isFlat ? 'No change' : Math.abs(trend.value)}
        </span>
        {!isFlat && <span className="dashboard__metric-trend-caption">vs last week</span>}
      </span>
    );
  }

  return (
    <span className={`dashboard__metric-trend dashboard__metric-trend--${trend.tone}`}>
      <span className="dashboard__metric-trend-dot" aria-hidden="true"></span>
      <span className="dashboard__metric-trend-value">{trend.label}</span>
    </span>
  );
};

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
  // assignments are role-scoped, summing per-role buckets is genuinely
  // additive (a shift only ever lives in one role's bucket, so this can't
  // double-count someone working multiple roles).
  const assignedShiftCount = useMemo(
    () => countAssignedForWeek(schedule, teamRoles, activeEmployees),
    [schedule, teamRoles, activeEmployees]
  );

  const openShiftCount = useMemo(
    () => countOpenForWeek(schedule, teamRoles, activeEmployees, shiftTypes),
    [schedule, teamRoles, activeEmployees, shiftTypes]
  );

  // The same week's schedule from seven days earlier, read straight from
  // saved history — lets each summary card show a real "vs last week"
  // delta instead of a fabricated trend.
  const previousSchedule = useMemo(() => {
    const previousWeekStartDate = getPreviousWeekStartDate(currentWeekStartDate);

    return previousWeekStartDate ? getWeekView(state, previousWeekStartDate) : null;
  }, [state, currentWeekStartDate]);

  const previousAssignedCount = useMemo(
    () => (previousSchedule ? countAssignedForWeek(previousSchedule, teamRoles, activeEmployees) : null),
    [previousSchedule, teamRoles, activeEmployees]
  );

  const previousOpenCount = useMemo(
    () => (previousSchedule ? countOpenForWeek(previousSchedule, teamRoles, activeEmployees, shiftTypes) : null),
    [previousSchedule, teamRoles, activeEmployees, shiftTypes]
  );

  const reviewTotals = useMemo(
    () => computeWeekReviewTotals({ ...state, schedule }, teamRoles),
    [state, schedule, teamRoles]
  );

  const coveragePercent = reviewTotals.totalRequired > 0
    ? Math.round(((reviewTotals.totalRequired - reviewTotals.totalOpen) / reviewTotals.totalRequired) * 100)
    : null;

  const needsReviewCount = reviewTotals.gapCount + reviewTotals.capAlertCount;

  // My own assigned shifts for a given week, across every role I hold.
  const countMyShifts = (weekSchedule) => {
    if (!me) {
      return 0;
    }

    return me.roles.reduce((total, role) => {
      const myDays = weekSchedule.assignments?.[role]?.[me.id] ?? {};

      return total + DAYS.reduce((dayTotal, day) => dayTotal + (myDays[day] ?? []).length, 0);
    }, 0);
  };

  const myShiftCount = countMyShifts(schedule);
  const previousMyShiftCount = previousSchedule ? countMyShifts(previousSchedule) : null;

  // First day this week I'm working, with its shift label(s) — powers the
  // staff "Next shift" card.
  const nextShift = useMemo(() => {
    const workingDay = myScheduleDays.find((entry) => entry.roles.some((role) => role.shifts.length > 0));

    if (!workingDay) {
      return null;
    }

    const shifts = [...new Set(workingDay.roles.flatMap((role) => role.shifts))];

    return { day: workingDay.day.slice(0, 3), label: shifts.join(', ') };
  }, [myScheduleDays]);

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

  // Manager cards read the whole team's week; staff cards are scoped to the
  // signed-in employee. Both render as a 2x2 icon-card grid.
  const managerCards = [
    {
      key: 'coverage',
      icon: 'fa-shield-halved',
      label: 'Coverage',
      value: coveragePercent === null ? '—' : `${coveragePercent}%`,
      valueIsText: coveragePercent === null,
      tone: coveragePercent === null
        ? 'neutral'
        : coveragePercent >= 95 ? 'positive' : coveragePercent >= 80 ? 'warning' : 'critical',
      trend: coveragePercent === null
        ? { kind: 'status', tone: 'neutral', label: 'Set targets' }
        : coveragePercent >= 95
          ? { kind: 'status', tone: 'positive', label: 'On track' }
          : coveragePercent >= 80
            ? { kind: 'status', tone: 'warning', label: 'Watch gaps' }
            : { kind: 'status', tone: 'critical', label: 'Under-covered' },
    },
    {
      key: 'open',
      icon: 'fa-triangle-exclamation',
      label: 'Open shifts',
      value: openShiftCount,
      tone: openShiftCount === 0 ? 'positive' : 'warning',
      trend: openShiftCount === 0
        ? { kind: 'status', tone: 'positive', label: 'Fully staffed' }
        : previousOpenCount === null
          ? { kind: 'status', tone: 'warning', label: 'To fill' }
          : { kind: 'delta', value: openShiftCount - previousOpenCount, invert: true },
    },
    {
      key: 'assigned',
      icon: 'fa-calendar-check',
      label: 'Shifts scheduled',
      value: assignedShiftCount,
      tone: 'brand',
      trend: previousAssignedCount === null
        ? { kind: 'status', tone: 'neutral', label: 'This week' }
        : { kind: 'delta', value: assignedShiftCount - previousAssignedCount, invert: false },
    },
    {
      key: 'review',
      icon: 'fa-list-check',
      label: 'Needs review',
      value: needsReviewCount,
      tone: needsReviewCount === 0 ? 'positive' : 'warning',
      trend: needsReviewCount === 0
        ? { kind: 'status', tone: 'positive', label: 'All clear' }
        : {
          kind: 'status',
          tone: 'warning',
          label: reviewTotals.capAlertCount > 0 ? `${reviewTotals.capAlertCount} over cap` : 'Coverage gaps',
        },
    },
  ];

  const staffCards = [
    {
      key: 'my-shifts',
      icon: 'fa-calendar-check',
      label: 'My shifts this week',
      value: myShiftCount,
      tone: 'brand',
      trend: previousMyShiftCount === null
        ? { kind: 'status', tone: 'neutral', label: 'This week' }
        : { kind: 'delta', value: myShiftCount - previousMyShiftCount, invert: false },
    },
    {
      key: 'next-shift',
      icon: 'fa-clock',
      label: 'Next shift',
      value: nextShift ? nextShift.day : '—',
      valueIsText: true,
      tone: nextShift ? 'brand' : 'neutral',
      trend: { kind: 'status', tone: 'neutral', label: nextShift ? nextShift.label : 'None scheduled' },
    },
    {
      key: 'pickup',
      icon: 'fa-hand',
      label: 'Open to pick up',
      value: openShiftCount,
      tone: openShiftCount > 0 ? 'positive' : 'neutral',
      trend: openShiftCount > 0
        ? { kind: 'status', tone: 'positive', label: 'Ask your manager' }
        : { kind: 'status', tone: 'neutral', label: 'None open' },
    },
    {
      key: 'status',
      icon: 'fa-circle-check',
      label: 'Schedule',
      value: schedule.status === 'published' ? 'Published' : 'Draft',
      valueIsText: true,
      tone: schedule.status === 'published' ? 'positive' : 'warning',
      trend: schedule.status === 'published'
        ? { kind: 'status', tone: 'positive', label: 'Shifts are final' }
        : { kind: 'status', tone: 'warning', label: 'Not final yet' },
    },
  ];

  const summaryCards = isManager ? managerCards : staffCards;

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
          {!isManager && (
            <p className="dashboard__summary">
              {`Here's what's on the schedule for ${schedule.weekLabel || 'this week'}.`}
            </p>
          )}
        </div>
        <div className="dashboard__card-grid">
          {summaryCards.map((card) => (
            <article key={card.key} className={`dashboard__metric dashboard__metric--${card.tone}`}>
              <span className="dashboard__metric-icon" aria-hidden="true">
                <i className={`fas ${card.icon}`}></i>
              </span>
              <span className="dashboard__metric-label">{card.label}</span>
              <span className={`dashboard__metric-value${card.valueIsText ? ' dashboard__metric-value--text' : ''}`}>
                {card.value}
              </span>
              <MetricTrend trend={card.trend} />
            </article>
          ))}
        </div>
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