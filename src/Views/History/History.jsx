import { useEffect, useMemo, useState } from 'react';

import { ContentPanel, StatusBadge } from '../../Components';
import { getOpenDays, getShiftTypes, useAppState } from '../../state/AppState';

import './History.scss';

const ASSIGNMENT_LAYOUT_STORAGE_KEY = 'shiftsizzle.history-assignment-layout';

const getInitialAssignmentLayout = () => {
  if (typeof window === 'undefined') {
    return 'employee';
  }

  const storedLayout = window.sessionStorage.getItem(ASSIGNMENT_LAYOUT_STORAGE_KEY);
  return storedLayout === 'day' ? 'day' : 'employee';
};

const getInitialQueryValue = (key, fallback = '') => {
  if (typeof window === 'undefined') {
    return fallback;
  }

  const value = new URLSearchParams(window.location.search).get(key);
  return value ?? fallback;
};

const formatTimestamp = (value) => new Date(value).toLocaleString([], {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const getEntryActivityLabel = (entry) => (
  entry.status === 'published' && entry.publishedAt
    ? `Published ${formatTimestamp(entry.publishedAt)}`
    : entry.savedAt
      ? `Saved ${formatTimestamp(entry.savedAt)}`
      : ''
);

const STATUS_FILTER_LABELS = {
  all: 'All statuses',
  draft: 'In progress',
  published: 'Published',
};

export const History = () => {
  const {
    state: { employees, schedules, settings },
  } = useAppState();

  const openDays = getOpenDays(settings);
  const shiftTypes = getShiftTypes(settings);

  const [selectedId, setSelectedId] = useState(() => getInitialQueryValue('schedule', ''));
  const [filterRole, setFilterRole] = useState(() => getInitialQueryValue('role', 'all'));
  const [filterStatus, setFilterStatus] = useState(() => getInitialQueryValue('status', 'all'));
  const [assignmentLayout, setAssignmentLayout] = useState(getInitialAssignmentLayout);

  const sortedSchedules = useMemo(
    () => [...schedules].sort((a, b) => {
      const aTime = new Date(a.publishedAt || a.savedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.publishedAt || b.savedAt || b.createdAt || 0).getTime();

      return bTime - aTime;
    }),
    [schedules],
  );

  const availableRoles = useMemo(
    () => Array.from(new Set(schedules.map((entry) => entry.role).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [schedules],
  );

  const filteredEntries = useMemo(
    () => sortedSchedules.filter((entry) => {
      if (filterRole !== 'all' && entry.role !== filterRole) {
        return false;
      }

      if (filterStatus !== 'all' && entry.status !== filterStatus) {
        return false;
      }

      return true;
    }),
    [sortedSchedules, filterRole, filterStatus],
  );

  useEffect(() => {
    window.sessionStorage.setItem(ASSIGNMENT_LAYOUT_STORAGE_KEY, assignmentLayout);
  }, [assignmentLayout]);

  useEffect(() => {
    if (filterRole !== 'all' && !availableRoles.includes(filterRole)) {
      setFilterRole('all');
    }
  }, [availableRoles, filterRole]);

  useEffect(() => {
    if (selectedId && !schedules.some((entry) => entry.id === selectedId)) {
      setSelectedId('');
    }
  }, [schedules, selectedId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);

    if (filterRole !== 'all') {
      params.set('role', filterRole);
    } else {
      params.delete('role');
    }

    if (filterStatus !== 'all') {
      params.set('status', filterStatus);
    } else {
      params.delete('status');
    }

    params.delete('range');
    params.delete('start');
    params.delete('end');

    if (selectedId) {
      params.set('schedule', selectedId);
    } else {
      params.delete('schedule');
    }

    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', nextUrl);
  }, [filterRole, filterStatus, selectedId]);

  const hasActiveFilters = filterRole !== 'all' || filterStatus !== 'all';
  const selectedEntry = selectedId ? (schedules.find((entry) => entry.id === selectedId) ?? null) : null;

  const resetFilters = () => {
    setFilterRole('all');
    setFilterStatus('all');
  };

  const filterControls = (
    <section className="history__filters" aria-label="Schedule history filters">
      <div className="history__filter-field">
        <label htmlFor="history-filter-role">Role</label>
        <select
          id="history-filter-role"
          value={filterRole}
          onChange={(event) => setFilterRole(event.target.value)}
        >
          <option value="all">All roles</option>
          {availableRoles.map((role) => (
            <option key={`role-filter-${role}`} value={role}>{role}</option>
          ))}
        </select>
      </div>
      <div className="history__filter-field">
        <label htmlFor="history-filter-status">Status</label>
        <select
          id="history-filter-status"
          value={filterStatus}
          onChange={(event) => setFilterStatus(event.target.value)}
        >
          {Object.entries(STATUS_FILTER_LABELS).map(([value, label]) => (
            <option key={`status-filter-${value}`} value={value}>{label}</option>
          ))}
        </select>
      </div>
      <div className="history__filter-actions">
        <button
          type="button"
          className="history__filter-reset"
          onClick={resetFilters}
          disabled={!hasActiveFilters}
        >
          Reset filters
        </button>
      </div>
    </section>
  );

  if (!schedules.length) {
    return (
      <div className="history">
        <ContentPanel>
          <div className="history__empty-state history__empty-state--onboarding" aria-label="No schedules yet">
            <span className="history__empty-state-icon" aria-hidden="true">
              <i className="fas fa-clock-rotate-left" />
            </span>
            <span className="history__page-eyebrow">Schedule history</span>
            <h2>No schedules yet</h2>
            <p className="history__subhead">Save or publish a schedule in Scheduler to see it here.</p>
            <a href="/scheduler" className="button">
              Go to Scheduler
            </a>
          </div>
        </ContentPanel>
      </div>
    );
  }

  if (!selectedEntry) {
    return (
      <div className="history">
        <ContentPanel>
          <div className="history__page-header">
            <div className="history__page-copy">
              <span className="history__page-eyebrow">Schedule history</span>
              <h2>All schedules</h2>
              <p className="history__subhead">Every schedule you've saved or published, newest first.</p>
            </div>
          </div>

          {filterControls}

          {filteredEntries.length === 0 ? (
            <section className="history__empty-state" aria-label="No matching schedules">
              <h3>No matching schedules</h3>
              <p>No schedules match the selected role and status filters.</p>
              <p>Use Reset filters to return to all schedules.</p>
            </section>
          ) : (
            <ul className="history__list" aria-label="Schedule list">
              {filteredEntries.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className="history__list-item"
                    onClick={() => setSelectedId(entry.id)}
                  >
                    <div className="history__list-item-main">
                      <strong>{entry.weekLabel || `${entry.startDate} - ${entry.endDate}`}</strong>
                      <span>{entry.role}</span>
                    </div>
                    <div className="history__list-item-meta">
                      <span>{entry.metrics?.assignedSlots ?? 0}/{entry.metrics?.requiredSlots ?? 0} assigned</span>
                      <span>{getEntryActivityLabel(entry)}</span>
                    </div>
                    <StatusBadge status={entry.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ContentPanel>
      </div>
    );
  }

  const roleEmployees = employees.filter(
    (employee) => employee.status !== 'archived' && employee.role === selectedEntry.role
  );
  const assignments = selectedEntry.assignments ?? {};
  const requirements = selectedEntry.requirements ?? {};
  const coverageGaps = selectedEntry.coverageGaps ?? [];
  const shiftCapAlerts = selectedEntry.shiftCapAlerts ?? [];
  const metrics = selectedEntry.metrics ?? { requiredSlots: 0, assignedSlots: 0, openSlots: 0, roleEmployeeCount: roleEmployees.length };
  const assignedEmployees = roleEmployees.filter((employee) =>
    openDays.some((day) => (assignments[employee.id]?.[day] ?? []).length > 0)
  );

  const assignmentRows = assignedEmployees.map((employee) => {
    const totalAssigned = openDays.reduce(
      (total, day) => total + ((assignments[employee.id]?.[day] ?? []).length),
      0,
    );

    return {
      employee,
      totalAssigned,
      dailyAssignments: Object.fromEntries(
        openDays.map((day) => [day, assignments[employee.id]?.[day] ?? []]),
      ),
    };
  });

  const dailyCoverageRows = openDays.map((day) => {
    const required = shiftTypes.reduce(
      (total, shift) => total + Number(requirements?.[day]?.[shift] ?? 0),
      0,
    );
    const assigned = roleEmployees.reduce(
      (total, employee) => total + ((assignments[employee.id]?.[day] ?? []).length),
      0,
    );

    return {
      day,
      required,
      assigned,
      open: Math.max(required - assigned, 0),
    };
  });

  const dayFirstRows = openDays.map((day) => {
    const coverage = dailyCoverageRows.find((row) => row.day === day) ?? { required: 0, assigned: 0, open: 0 };

    return {
      day,
      ...coverage,
      employeeAssignments: assignedEmployees.map((employee) => ({
        employee,
        shifts: assignments[employee.id]?.[day] ?? [],
      })),
    };
  });

  const schedulerLink = `/scheduler?weekStart=${encodeURIComponent(selectedEntry.startDate ?? '')}&role=${encodeURIComponent(selectedEntry.role ?? '')}`;

  return (
    <div className="history">
      <ContentPanel>
        <div className="history__page-header">
          <div className="history__page-copy">
            <span className="history__page-eyebrow">Schedule history</span>
            <h2>{selectedEntry.weekLabel || 'Schedule'}</h2>
            <p className="history__subhead">{selectedEntry.role} coverage for {selectedEntry.weekLabel}.</p>
            <p className="history__publish-meta">{getEntryActivityLabel(selectedEntry)}</p>
          </div>
          <StatusBadge status={selectedEntry.status} />
        </div>
        <section className="history__published-note" aria-label="Notes panel">
          <div>
            <h3>Notes</h3>
            <p>{selectedEntry.notes?.trim() || 'No notes were recorded for this schedule.'}</p>
          </div>
          <div className="history__detail-actions">
            <button type="button" className="button-outline" onClick={() => setSelectedId('')}>
              Back to all schedules
            </button>
            <a className="button" href={schedulerLink}>
              Edit Schedule
            </a>
          </div>
        </section>
      </ContentPanel>

      <ContentPanel>
        <h3 className="history__section-title">Shift Assignments</h3>
        <p className="history__section-copy">Review staffing by team member and compare day-level required versus assigned coverage.</p>
        <div className="history__assignment-controls">
          <p className="history__assignment-context" aria-label="Selected assignment schedule context">
            <strong>{selectedEntry.role || 'Role not set'}</strong>
            <span>{selectedEntry.weekLabel}</span>
          </p>

          {assignmentRows.length > 0 && (
            <div className="history__layout-toggle" role="tablist" aria-label="Assignment layout">
              <button
                type="button"
                role="tab"
                aria-selected={assignmentLayout === 'employee'}
                className={`history__layout-toggle-button ${assignmentLayout === 'employee' ? 'is-active' : ''}`.trim()}
                onClick={() => setAssignmentLayout('employee')}
              >
                Employee view
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={assignmentLayout === 'day'}
                className={`history__layout-toggle-button ${assignmentLayout === 'day' ? 'is-active' : ''}`.trim()}
                onClick={() => setAssignmentLayout('day')}
              >
                Day-first view
              </button>
            </div>
          )}
        </div>

        {assignmentRows.length > 0 ? (
          assignmentLayout === 'employee' ? (
            <div className="history__assignment-shell" aria-label="Assignments view">
              <table className="history__assignment-table">
                <thead>
                  <tr>
                    <th>Team member</th>
                    <th>Total</th>
                    {openDays.map((day) => (
                      <th key={`header-${day}`}>{day.slice(0, 3)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {assignmentRows.map(({ employee, totalAssigned, dailyAssignments }) => (
                    <tr key={employee.id}>
                      <td className="history__employee-cell">
                        <strong>{employee.name}</strong>
                      </td>
                      <td><span className="history__total-chip">{totalAssigned}</span></td>
                      {openDays.map((day) => {
                        const shiftsForDay = dailyAssignments[day] ?? [];

                        return (
                          <td key={`${employee.id}-${day}`}>
                            {shiftsForDay.length ? (
                              <div className="history__assignment-chip-row">
                                {shiftsForDay.map((shift) => (
                                  <span key={`${employee.id}-${day}-${shift}`} className="history__assignment-chip">{shift}</span>
                                ))}
                              </div>
                            ) : (
                              <span className="history__off-chip">Off</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="history__assignment-shell" aria-label="Day-first view">
              <table className="history__assignment-table history__assignment-table--day-first">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Required</th>
                    <th>Assigned</th>
                    <th>Open</th>
                    {assignedEmployees.map((employee) => (
                      <th key={`day-first-head-${employee.id}`}>{employee.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dayFirstRows.map((row) => (
                    <tr key={`day-first-row-${row.day}`}>
                      <td className="history__employee-cell"><strong>{row.day}</strong></td>
                      <td>{row.required}</td>
                      <td>{row.assigned}</td>
                      <td>
                        <span className={`history__day-coverage-status ${row.open > 0 ? 'is-open' : 'is-filled'}`}>
                          {row.open > 0 ? row.open : '0'}
                        </span>
                      </td>
                      {row.employeeAssignments.map(({ employee, shifts }) => (
                        <td key={`day-first-${row.day}-${employee.id}`}>
                          {shifts.length ? (
                            <div className="history__assignment-chip-row">
                              {shifts.map((shift) => (
                                <span key={`day-first-${row.day}-${employee.id}-${shift}`} className="history__assignment-chip">{shift}</span>
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
          )
        ) : (
          <p>No assignments for this role and week yet.</p>
        )}
      </ContentPanel>

      <ContentPanel>
        <h3 className="history__section-title">Day coverage</h3>
        <p className="history__section-copy">Check required versus assigned coverage before drilling into the assignment grid.</p>
        <div className="history__day-coverage" aria-label="Day coverage">
          {dailyCoverageRows.map((row) => (
            <article key={row.day} className="history__day-coverage-item">
              <h4>{row.day}</h4>
              <p>{row.assigned} assigned / {row.required} required</p>
              <span className={`history__day-coverage-status ${row.open > 0 ? 'is-open' : 'is-filled'}`}>
                {row.open > 0 ? `${row.open} open` : 'Filled'}
              </span>
            </article>
          ))}
        </div>

        {(coverageGaps.length > 0 || shiftCapAlerts.length > 0) && (
          <div className="history__issues" aria-label="Unresolved issues details">
            <h3>Issue details</h3>
            {coverageGaps.length > 0 && (
              <div className="history__issue-group">
                <h4>Coverage gaps</h4>
                <ul>
                  {coverageGaps.map((gap) => (
                    <li key={`gap-${gap.day}-${gap.shift}`}>
                      Coverage gap: {gap.day} {gap.shift} ({gap.open} open)
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {shiftCapAlerts.length > 0 && (
              <div className="history__issue-group">
                <h4>Shift-cap alerts</h4>
                <ul>
                  {shiftCapAlerts.map((alert) => (
                    <li key={`alert-${alert.employeeId}`}>
                      Shift-cap alert: {alert.employeeName} assigned {alert.assigned} shifts (limit {alert.maxShifts})
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </ContentPanel>

      <ContentPanel>
        <h3 className="history__section-title">Details</h3>
        <div className="history__review-grid">
          <article className="history__review-card" aria-label="Assignment review summary">
            <h3>Assignments</h3>
            <p>{metrics.assignedSlots} assigned slots across {metrics.roleEmployeeCount} team members.</p>
          </article>
          <article className="history__review-card" aria-label="Coverage review summary">
            <h3>Coverage</h3>
            <p>{metrics.requiredSlots} required slots for the week.</p>
            <p>{metrics.openSlots} unfilled slots.</p>
          </article>
          <article className="history__review-card" aria-label="Unresolved issues summary">
            <h3>Unresolved issues</h3>
            <p>{coverageGaps.length} coverage gap {coverageGaps.length === 1 ? 'issue' : 'issues'}.</p>
            <p>{shiftCapAlerts.length} shift-cap {shiftCapAlerts.length === 1 ? 'alert' : 'alerts'}.</p>
          </article>
        </div>
      </ContentPanel>
    </div>
  );
};
