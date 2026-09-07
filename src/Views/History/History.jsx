import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, ContentPanel, StatusBadge } from '../../Components';
import {
  calculateScheduleReview,
  coverageStatus,
  getOpenDays,
  getShiftTypes,
  normalizeOperatingHours,
  useAppState,
} from '../../state/AppState';
import { useAuth } from '../../state/AuthState';

import './History.scss';

// This page is the read-only archive of what's been scheduled — one row per
// week, newest first. Building and fixing schedules lives in the builder
// (/schedule/build); the live coverage/gap analytics live there and on the
// Dashboard, so they're intentionally not repeated here.

const STATUS_PILLS = [
  { value: 'all', label: 'All' },
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'In progress' },
];

const formatTimestamp = (value) => new Date(value).toLocaleString([], {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const readParam = (key, fallback = '') => {
  if (typeof window === 'undefined') {
    return fallback;
  }

  return new URLSearchParams(window.location.search).get(key) ?? fallback;
};

export const History = () => {
  const {
    state: { employees, schedules, settings },
  } = useAppState();
  const { membership } = useAuth();
  const navigate = useNavigate();
  const canManage = membership?.accountRole === 'owner' || membership?.accountRole === 'manager';

  const [selectedWeek, setSelectedWeek] = useState(() => readParam('week'));
  const [statusFilter, setStatusFilter] = useState(() => {
    const value = readParam('status', 'all');
    return STATUS_PILLS.some((pill) => pill.value === value) ? value : 'all';
  });

  const openDays = getOpenDays(settings);
  const shiftTypes = getShiftTypes(settings);
  const operatingHours = useMemo(
    () => normalizeOperatingHours(settings.operatingHours),
    [settings.operatingHours],
  );

  // Every saved/published record, grouped into weeks. Each week rolls its
  // per-role records up into one entry: combined fill totals, the newest
  // notes, and a single status (published only when every role is).
  const weeks = useMemo(() => {
    const byWeek = new Map();

    schedules.forEach((record) => {
      const review = calculateScheduleReview({
        assignments: record.assignments ?? {},
        requirements: record.requirements ?? {},
        employees,
        selectedRole: record.role,
        shiftTypes,
        operatingHours,
      });

      if (!byWeek.has(record.startDate)) {
        byWeek.set(record.startDate, {
          startDate: record.startDate,
          endDate: record.endDate,
          weekLabel: record.weekLabel || `${record.startDate} - ${record.endDate}`,
          notes: '',
          notesAt: 0,
          lastActivity: 0,
          roles: [],
        });
      }

      const week = byWeek.get(record.startDate);
      const timestamp = Math.max(
        record.publishedAt ? new Date(record.publishedAt).getTime() : 0,
        record.savedAt ? new Date(record.savedAt).getTime() : 0,
      );

      week.lastActivity = Math.max(week.lastActivity, timestamp);

      if ((record.notes ?? '').trim() && timestamp >= week.notesAt) {
        week.notes = record.notes.trim();
        week.notesAt = timestamp;
      }

      week.roles.push({
        record,
        role: record.role,
        status: record.status,
        filled: review.metrics.assignedSlots,
        required: review.metrics.requiredSlots,
      });
    });

    return [...byWeek.values()]
      .map((week) => {
        const roles = [...week.roles].sort((a, b) => a.role.localeCompare(b.role));

        return {
          ...week,
          roles,
          filled: roles.reduce((total, entry) => total + entry.filled, 0),
          required: roles.reduce((total, entry) => total + entry.required, 0),
          status: roles.length && roles.every((entry) => entry.status === 'published') ? 'published' : 'draft',
        };
      })
      .sort((a, b) => b.lastActivity - a.lastActivity);
  }, [schedules, employees, shiftTypes, operatingHours]);

  const filteredWeeks = statusFilter === 'all'
    ? weeks
    : weeks.filter((week) => week.status === statusFilter);

  const selectedWeekObj = selectedWeek
    ? weeks.find((week) => week.startDate === selectedWeek) ?? null
    : null;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    ['role', 'schedule', 'range', 'start', 'end'].forEach((key) => params.delete(key));

    if (statusFilter !== 'all') {
      params.set('status', statusFilter);
    } else {
      params.delete('status');
    }

    if (selectedWeek) {
      params.set('week', selectedWeek);
    } else {
      params.delete('week');
    }

    const search = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`);
  }, [statusFilter, selectedWeek]);

  useEffect(() => {
    if (selectedWeek && !weeks.some((week) => week.startDate === selectedWeek)) {
      setSelectedWeek('');
    }
  }, [weeks, selectedWeek]);

  const openBuilder = (query = '') => navigate(`/schedule/build${query ? `?${query}` : ''}`);

  if (!schedules.length) {
    return (
      <div className="history">
        <div className="history__page-intro">
          <h2>Schedules</h2>
          <p>Every week you&apos;ve saved or published shows up here.</p>
        </div>
        <ContentPanel className="history__empty-state history__empty-state--onboarding">
          <span className="history__eyebrow">Start your schedule</span>
          <p>You haven&apos;t saved or published any schedules yet.</p>
          {canManage && (
            <div className="history__empty-state-actions">
              <Button type="button" className="history__primary-action" onClick={() => openBuilder()}>
                <span className="history__action-icon" aria-hidden="true">
                  <i className="fas fa-plus" />
                </span>
                New schedule
              </Button>
            </div>
          )}
        </ContentPanel>
      </div>
    );
  }

  if (!selectedWeekObj) {
    return (
      <div className="history" key="list">
        <div className="history__page-intro">
          <h2>Schedules</h2>
          <p>Every week you&apos;ve saved or published, newest first.</p>
        </div>
        <ContentPanel>
          <div className="history__list-head">
            <div className="history__pills" role="tablist" aria-label="Filter schedules by status">
              {STATUS_PILLS.map((pill) => (
                <button
                  key={pill.value}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === pill.value}
                  className={`history__pill ${statusFilter === pill.value ? 'is-active' : ''}`.trim()}
                  onClick={() => setStatusFilter(pill.value)}
                >
                  {pill.label}
                </button>
              ))}
            </div>
            {canManage && (
              <Button
                type="button"
                className="history__primary-action history__new-schedule-action"
                onClick={() => openBuilder()}
              >
                <span className="history__action-icon" aria-hidden="true">
                  <i className="fas fa-plus" />
                </span>
                New schedule
              </Button>
            )}
          </div>

          {filteredWeeks.length === 0 ? (
            <p className="history__empty-filtered">
              {statusFilter === 'published' ? 'No published schedules yet.' : 'Nothing in progress right now.'}
            </p>
          ) : (
            <ul className="history__weeks" aria-label="Schedule list">
              {filteredWeeks.map((week) => (
                <li key={week.startDate}>
                  <button type="button" className="history__week" onClick={() => setSelectedWeek(week.startDate)}>
                    <div className="history__week-top">
                      <strong>{week.weekLabel}</strong>
                      <StatusBadge status={week.status} />
                    </div>
                    <div className="history__week-meta">
                      <span>{week.filled}/{week.required} slots filled</span>
                      {week.lastActivity > 0 && <span>{formatTimestamp(week.lastActivity)}</span>}
                    </div>
                    <div className="history__week-roles">
                      {week.roles.map((entry) => (
                        <span key={entry.role} className="history__role-chip">
                          {entry.role} {entry.filled}/{entry.required}
                        </span>
                      ))}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ContentPanel>
      </div>
    );
  }

  const week = selectedWeekObj;
  const employeesById = Object.fromEntries(employees.map((employee) => [employee.id, employee]));
  const unfilled = week.required - week.filled;

  const rows = [];
  week.roles.forEach(({ record, role }) => {
    const assignments = record.assignments ?? {};

    Object.keys(assignments).forEach((employeeId) => {
      const byDay = Object.fromEntries(openDays.map((day) => [day, assignments[employeeId]?.[day] ?? []]));
      const total = openDays.reduce((count, day) => count + byDay[day].length, 0);

      if (total === 0) {
        return;
      }

      rows.push({
        key: `${role}-${employeeId}`,
        name: employeesById[employeeId]?.name ?? 'Former team member',
        role,
        byDay,
        total,
      });
    });
  });
  rows.sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));

  const dayCoverage = openDays.map((day) => {
    let required = 0;
    let assigned = 0;

    week.roles.forEach(({ record }) => {
      shiftTypes.forEach((shift) => {
        required += Number(record.requirements?.[day]?.[shift] ?? 0);
      });
      Object.values(record.assignments ?? {}).forEach((employeeDays) => {
        assigned += (employeeDays?.[day] ?? []).length;
      });
    });

    return { day, required, assigned, status: coverageStatus(assigned, required) };
  });

  return (
    <div className="history" key={week.startDate}>
      <ContentPanel>
        <div className="history__page-header">
          <div className="history__page-copy">
            <h2>{week.weekLabel}</h2>
            <p className="history__subhead">
              {week.filled} of {week.required} slots filled{unfilled > 0 ? ` · ${unfilled} unfilled` : ''}
            </p>
            {week.lastActivity > 0 && (
              <p className="history__publish-meta">
                {week.status === 'published' ? 'Published' : 'Last saved'} {formatTimestamp(week.lastActivity)}
              </p>
            )}
          </div>
          <StatusBadge status={week.status} />
        </div>

        <section className="history__published-note" aria-label="Notes panel">
          <div>
            <h3>Notes</h3>
            <p>{week.notes || 'No notes were recorded for this week.'}</p>
          </div>
          <div className="history__detail-actions">
            <button type="button" className="button-outline" onClick={() => setSelectedWeek('')}>
              Back to all schedules
            </button>
            {canManage && (
              <button
                type="button"
                className="button"
                onClick={() => openBuilder(`weekStart=${encodeURIComponent(week.startDate)}`)}
              >
                Edit in builder
              </button>
            )}
          </div>
        </section>
      </ContentPanel>

      <ContentPanel>
        <h3 className="history__section-title">Who worked</h3>
        {rows.length === 0 ? (
          <p>No one was assigned for this week.</p>
        ) : (
          <div className="history__assignment-shell">
            <table className="history__assignment-table">
              <thead>
                <tr>
                  <th>Team member</th>
                  <th>Total</th>
                  {openDays.map((day) => (
                    <th key={day}>{day.slice(0, 3)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <td className="history__employee-cell">
                      <strong>{row.name}</strong>
                      <span className="history__role-tag">{row.role}</span>
                    </td>
                    <td><span className="history__total-chip">{row.total}</span></td>
                    {openDays.map((day) => (
                      <td key={day}>
                        {row.byDay[day].length ? (
                          <div className="history__assignment-chip-row">
                            {row.byDay[day].map((shift) => (
                              <span key={shift} className="history__assignment-chip">{shift}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="history__off-chip">Off</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ContentPanel>

      <ContentPanel>
        <h3 className="history__section-title">Coverage by day</h3>
        <div className="history__day-strip" aria-label="Coverage by day">
          {dayCoverage.map((entry) => (
            <span key={entry.day} className={`history__day-chip is-${entry.status}`}>
              <strong>{entry.day.slice(0, 3)}</strong>
              {entry.assigned}/{entry.required}
            </span>
          ))}
        </div>
      </ContentPanel>
    </div>
  );
};
