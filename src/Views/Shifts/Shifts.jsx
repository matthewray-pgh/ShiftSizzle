import { useEffect, useMemo, useState } from 'react';

import { ContentPanel } from '../../Components';
import { DAYS, getShiftTypes, useAppState } from '../../state/AppState';

import './Shifts.scss';

const ASSIGNMENT_LAYOUT_STORAGE_KEY = 'shiftsizzle.shifts-assignment-layout';

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

const buildRangeKey = (startDate, endDate) => `${startDate || 'unknown-start'}__${endDate || 'unknown-end'}`;

const getInitialRangeFilter = () => {
  const explicitRange = getInitialQueryValue('range', '');
  if (explicitRange) {
    return explicitRange;
  }

  const start = getInitialQueryValue('start', '');
  const end = getInitialQueryValue('end', '');

  if (start || end) {
    return buildRangeKey(start, end);
  }

  return 'all';
};

export const Shifts = () => {
  const {
    state: { employees, schedule, settings },
  } = useAppState();

  const [selectedPublishedId, setSelectedPublishedId] = useState(() => getInitialQueryValue('schedule', ''));
  const [assignmentLayout, setAssignmentLayout] = useState(getInitialAssignmentLayout);
  const [filterRange, setFilterRange] = useState(getInitialRangeFilter);
  const [filterRole, setFilterRole] = useState(() => getInitialQueryValue('role', 'all'));

  const shiftTypes = getShiftTypes(settings);

  const getEntryShiftTypes = (entry) => {
    const requirementShiftTypes = DAYS.flatMap((day) => Object.keys(entry?.requirements?.[day] ?? {}));
    const uniqueShiftTypes = Array.from(new Set(requirementShiftTypes.filter(Boolean)));

    return uniqueShiftTypes.length ? uniqueShiftTypes : shiftTypes;
  };

  const getEntryDays = (entry, roleEmployees, entryShiftTypes) => {
    const requirementDays = DAYS.filter((day) =>
      entryShiftTypes.some((shift) => Number(entry?.requirements?.[day]?.[shift] ?? 0) > 0)
    );
    const assignmentDays = DAYS.filter((day) =>
      roleEmployees.some((employee) => (entry?.assignments?.[employee.id]?.[day] ?? []).length > 0)
    );
    const inferredDays = Array.from(new Set([...requirementDays, ...assignmentDays]));

    return inferredDays.length ? inferredDays : DAYS;
  };

  const buildReviewSummary = (entry) => {
    const selectedRole = entry.selectedRole;
    const roleEmployees = employees.filter((employee) => employee.status !== 'archived' && employee.role === selectedRole);
    const entryShiftTypes = getEntryShiftTypes(entry);
    const entryDays = getEntryDays(entry, roleEmployees, entryShiftTypes);
    const requirements = entry.requirements ?? {};
    const assignments = entry.assignments ?? {};

    const coverageGaps = entryDays.flatMap((day) =>
      entryShiftTypes.flatMap((shift) => {
        const required = requirements[day]?.[shift] ?? 0;
        const assigned = roleEmployees.reduce(
          (count, employee) => count + ((assignments[employee.id]?.[day] ?? []).includes(shift) ? 1 : 0),
          0,
        );

        return assigned >= required ? [] : [{ day, shift, open: required - assigned }];
      })
    );

    const shiftCapAlerts = roleEmployees
      .map((employee) => {
        const assignedCount = entryDays.reduce(
          (total, day) => total + ((assignments[employee.id]?.[day] ?? []).length),
          0,
        );

        return assignedCount > employee.shiftsPerWeek
          ? {
            employeeId: employee.id,
            employeeName: employee.name,
            assigned: assignedCount,
            maxShifts: employee.shiftsPerWeek,
          }
          : null;
      })
      .filter(Boolean);

    const requiredSlots = entryDays.reduce(
      (total, day) => total + entryShiftTypes.reduce((dayTotal, shift) => dayTotal + (requirements[day]?.[shift] ?? 0), 0),
      0,
    );
    const openSlots = coverageGaps.reduce((total, gap) => total + gap.open, 0);

    return {
      coverageGaps,
      shiftCapAlerts,
      metrics: {
        requiredSlots,
        assignedSlots: requiredSlots - openSlots,
        openSlots,
        roleEmployeeCount: roleEmployees.length,
      },
      days: entryDays,
      shiftTypes: entryShiftTypes,
    };
  };

  const currentPublishedEntry = useMemo(() => {
    if (schedule.status !== 'published' || !schedule.lastPublishedAt) {
      return null;
    }

    return {
      id: `current-${schedule.lastPublishedAt}`,
      weekLabel: schedule.weekLabel,
      startDate: schedule.startDate,
      endDate: schedule.endDate,
      selectedRole: schedule.selectedRole,
      notes: schedule.notes,
      requirements: schedule.requirements,
      assignments: schedule.assignments,
      publishedAt: schedule.lastPublishedAt,
      ...(buildReviewSummary(schedule)),
    };
  }, [employees, schedule, shiftTypes]);

  const publishedEntries = useMemo(() => {
    const history = Array.isArray(schedule.publishHistory) ? schedule.publishHistory : [];
    const normalizedHistory = history
      .filter((entry) => entry && entry.publishedAt)
      .map((entry, index) => ({
        ...entry,
        id: entry.id || `${entry.publishedAt}-${entry.startDate || index}-${entry.selectedRole || 'role'}`,
      }))
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    if (!currentPublishedEntry) {
      return normalizedHistory;
    }

    const hasCurrentEntry = normalizedHistory.some((entry) =>
      entry.publishedAt === currentPublishedEntry.publishedAt
      && entry.startDate === currentPublishedEntry.startDate
      && entry.selectedRole === currentPublishedEntry.selectedRole
    );

    return hasCurrentEntry ? normalizedHistory : [currentPublishedEntry, ...normalizedHistory];
  }, [currentPublishedEntry, schedule.publishHistory]);

  const availableRoles = useMemo(() => {
    const roleSet = new Set(
      publishedEntries
        .map((entry) => entry.selectedRole)
        .filter(Boolean)
    );

    return Array.from(roleSet).sort((a, b) => a.localeCompare(b));
  }, [publishedEntries]);

  const availableRanges = useMemo(() => {
    const rangeMap = new Map();

    publishedEntries.forEach((entry) => {
      const key = buildRangeKey(entry.startDate, entry.endDate);

      if (!rangeMap.has(key)) {
        rangeMap.set(key, {
          key,
          label: entry.weekLabel || `${entry.startDate || 'Unknown start'} - ${entry.endDate || 'Unknown end'}`,
          startDate: entry.startDate,
        });
      }
    });

    return Array.from(rangeMap.values()).sort((a, b) => {
      const aValue = a.startDate ? new Date(a.startDate).getTime() : 0;
      const bValue = b.startDate ? new Date(b.startDate).getTime() : 0;
      return bValue - aValue;
    });
  }, [publishedEntries]);

  const filteredEntries = useMemo(() => {
    return publishedEntries.filter((entry) => {
      if (filterRole !== 'all' && entry.selectedRole !== filterRole) {
        return false;
      }

      if (filterRange !== 'all' && buildRangeKey(entry.startDate, entry.endDate) !== filterRange) {
        return false;
      }

      return true;
    });
  }, [filterRange, filterRole, publishedEntries]);

  const groupedFilteredEntries = useMemo(() => {
    const groups = new Map();

    filteredEntries.forEach((entry) => {
      const groupLabel = entry.weekLabel || `${entry.startDate || 'unknown'} - ${entry.endDate || 'unknown'}`;
      const currentGroup = groups.get(groupLabel) ?? [];
      currentGroup.push(entry);
      groups.set(groupLabel, currentGroup);
    });

    return Array.from(groups.entries()).map(([weekLabel, entries]) => ({
      weekLabel,
      entries,
    }));
  }, [filteredEntries]);

  useEffect(() => {
    window.sessionStorage.setItem(ASSIGNMENT_LAYOUT_STORAGE_KEY, assignmentLayout);
  }, [assignmentLayout]);

  useEffect(() => {
    if (filterRole === 'all') {
      return;
    }

    if (!availableRoles.includes(filterRole)) {
      setFilterRole('all');
    }
  }, [availableRoles, filterRole]);

  useEffect(() => {
    if (filterRange === 'all') {
      return;
    }

    if (!availableRanges.some((range) => range.key === filterRange)) {
      setFilterRange('all');
    }
  }, [availableRanges, filterRange]);

  useEffect(() => {
    if (!filteredEntries.length) {
      setSelectedPublishedId('');
      return;
    }

    setSelectedPublishedId((currentId) => {
      if (currentId && filteredEntries.some((entry) => entry.id === currentId)) {
        return currentId;
      }

      return filteredEntries[0].id;
    });
  }, [filteredEntries]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const defaultSelectedId = filteredEntries[0]?.id ?? '';

    if (filterRange !== 'all') {
      params.set('range', filterRange);
    } else {
      params.delete('range');
    }

    params.delete('start');
    params.delete('end');

    if (filterRole !== 'all') {
      params.set('role', filterRole);
    } else {
      params.delete('role');
    }

    if (selectedPublishedId && selectedPublishedId !== defaultSelectedId) {
      params.set('schedule', selectedPublishedId);
    } else {
      params.delete('schedule');
    }

    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', nextUrl);
  }, [filterRange, filterRole, filteredEntries, selectedPublishedId]);

  const selectedEntry = filteredEntries.find((entry) => entry.id === selectedPublishedId) ?? filteredEntries[0] ?? null;
  const selectedReview = selectedEntry
    ? {
      coverageGaps: selectedEntry.coverageGaps ?? [],
      shiftCapAlerts: selectedEntry.shiftCapAlerts ?? [],
      metrics: selectedEntry.metrics ?? buildReviewSummary(selectedEntry).metrics,
      days: selectedEntry.days ?? buildReviewSummary(selectedEntry).days,
      shiftTypes: selectedEntry.shiftTypes ?? buildReviewSummary(selectedEntry).shiftTypes,
    }
    : null;

  const selectedAssignments = selectedEntry?.assignments ?? {};
  const selectedRoleEmployees = selectedEntry
    ? employees.filter((employee) => employee.status !== 'archived' && employee.role === selectedEntry.selectedRole)
    : [];
  const selectedDays = selectedReview?.days ?? DAYS;
  const selectedShiftTypes = selectedReview?.shiftTypes ?? shiftTypes;
  const assignedEmployees = selectedRoleEmployees.filter((employee) =>
    selectedDays.some((day) => (selectedAssignments[employee.id]?.[day] ?? []).length > 0)
  );

  const assignmentRows = assignedEmployees.map((employee) => {
    const totalAssigned = selectedDays.reduce(
      (total, day) => total + ((selectedAssignments[employee.id]?.[day] ?? []).length),
      0,
    );

    return {
      employee,
      totalAssigned,
      dailyAssignments: Object.fromEntries(
        selectedDays.map((day) => [day, selectedAssignments[employee.id]?.[day] ?? []]),
      ),
    };
  });

  const dailyCoverageRows = selectedDays.map((day) => {
    const required = selectedShiftTypes.reduce(
      (total, shift) => total + Number(selectedEntry?.requirements?.[day]?.[shift] ?? 0),
      0,
    );
    const assigned = selectedRoleEmployees.reduce(
      (total, employee) => total + ((selectedAssignments[employee.id]?.[day] ?? []).length),
      0,
    );

    return {
      day,
      required,
      assigned,
      open: Math.max(required - assigned, 0),
    };
  });

  const dayFirstRows = selectedDays.map((day) => {
    const coverage = dailyCoverageRows.find((row) => row.day === day) ?? { required: 0, assigned: 0, open: 0 };

    return {
      day,
      ...coverage,
      employeeAssignments: assignedEmployees.map((employee) => ({
        employee,
        shifts: selectedAssignments[employee.id]?.[day] ?? [],
      })),
    };
  });

  const formatPublishedAt = (publishedAt) => new Date(publishedAt).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const schedulerLink = `/scheduler?weekStart=${encodeURIComponent(selectedEntry?.startDate ?? '')}&role=${encodeURIComponent(selectedEntry?.selectedRole ?? '')}`;
  const hasActiveFilters = filterRole !== 'all' || filterRange !== 'all';

  const resetFilters = () => {
    setFilterRange('all');
    setFilterRole('all');
    setSelectedPublishedId('');
  };

  const filterControls = (
    <section className="shifts__filters" aria-label="Published schedule filters">
      <div className="shifts__filter-field">
        <label htmlFor="shifts-filter-range">Schedule range</label>
        <select
          id="shifts-filter-range"
          value={filterRange}
          onChange={(event) => setFilterRange(event.target.value)}
        >
          <option value="all">All published ranges</option>
          {availableRanges.map((range) => (
            <option key={`range-filter-${range.key}`} value={range.key}>{range.label}</option>
          ))}
        </select>
      </div>
      <div className="shifts__filter-field">
        <label htmlFor="shifts-filter-role">Role</label>
        <select
          id="shifts-filter-role"
          value={filterRole}
          onChange={(event) => setFilterRole(event.target.value)}
        >
          <option value="all">All roles</option>
          {availableRoles.map((role) => (
            <option key={`role-filter-${role}`} value={role}>{role}</option>
          ))}
        </select>
      </div>
      <div className="shifts__filter-actions">
        <button
          type="button"
          className="shifts__filter-reset"
          onClick={resetFilters}
          disabled={!hasActiveFilters}
        >
          Reset filters
        </button>
      </div>
    </section>
  );

  if (!selectedEntry) {
    if (publishedEntries.length > 0) {
      return (
        <div className="shifts">
          <ContentPanel>
            <div className="shifts__page-header">
              <div className="shifts__page-copy">
                <span className="shifts__page-eyebrow">Shifts review</span>
                <h2>Published schedule view</h2>
                <p className="shifts__subhead">Filter by date range first, then role to narrow down published schedules.</p>
              </div>
              <div className="shifts__status shifts__status--published">published</div>
            </div>

            {filterControls}

            {hasActiveFilters && (
              <section className="shifts__empty-state" aria-label="No matching schedules">
                <h3>No matching schedules</h3>
                <p>No published schedules match the selected range and role filters.</p>
                <p>Use Reset filters to return to all published schedules.</p>
              </section>
            )}
          </ContentPanel>
        </div>
      );
    }

    return (
      <div className="shifts">
        <ContentPanel>
          <div className="shifts__page-header">
            <div className="shifts__page-copy">
              <span className="shifts__page-eyebrow">Shifts review</span>
              <h2>Published schedule view</h2>
              <p className="shifts__subhead">Publish a schedule in Scheduler to review assignments, coverage, and unresolved issues here.</p>
            </div>
            <div className="shifts__status shifts__status--draft">draft</div>
          </div>
        </ContentPanel>
      </div>
    );
  }

  return (
    <div className="shifts">
      <ContentPanel>
        <div className="shifts__page-header">
          <div className="shifts__page-copy">
            <span className="shifts__page-eyebrow">Shifts review</span>
            <h2>{selectedEntry.weekLabel || 'Published schedule'}</h2>
            <p className="shifts__subhead">Select date range first, then role, then choose a published schedule to inspect below.</p>
            <p className="shifts__publish-meta">Published {formatPublishedAt(selectedEntry.publishedAt)}</p>
          </div>
          <div className="shifts__status shifts__status--published">published</div>
        </div>
        {filterControls}
        {hasActiveFilters && (
          <div className="shifts__filtered-count" aria-label="Filtered schedule count">
            {filteredEntries.length} schedule{filteredEntries.length === 1 ? '' : 's'} match this filter.
          </div>
        )}
        <section className="shifts__match-list" aria-label="Matching published schedules">
          <div className="shifts__match-list-title">{hasActiveFilters ? 'Matching schedules' : 'Published schedules'}</div>
          <div className="shifts__match-groups">
            {groupedFilteredEntries.map((group) => (
              <article key={`match-group-${group.weekLabel}`} className="shifts__match-group">
                <h4>{group.weekLabel}</h4>
                <div className="shifts__match-items">
                  {group.entries.map((entry) => {
                    const isSelected = selectedEntry.id === entry.id;

                    return (
                      <button
                        key={`match-entry-${entry.id}`}
                        type="button"
                        className={`shifts__match-item ${isSelected ? 'is-selected' : ''}`.trim()}
                        aria-pressed={isSelected}
                        aria-label={`${entry.weekLabel || 'Published schedule'} ${entry.selectedRole || 'Role not set'}`}
                        onClick={() => setSelectedPublishedId(entry.id)}
                      >
                        <span className="shifts__match-item-role">{entry.selectedRole || 'Role not set'}</span>
                        <span className="shifts__match-item-meta">Published {formatPublishedAt(entry.publishedAt)}</span>
                      </button>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="shifts__published-note" aria-label="Published note panel">
          <div>
            <h3>Publish note</h3>
            <p>{selectedEntry.notes?.trim() || 'No publish notes were recorded for this schedule.'}</p>
          </div>
          <a className="shifts__scheduler-link" href={schedulerLink}>Open in Scheduler</a>
        </section>
      </ContentPanel>

      <ContentPanel>
        <h3 className="shifts__section-title">Published assignments</h3>
        <p className="shifts__section-copy">Review staffing by team member and compare day-level required versus assigned coverage.</p>
        <div className="shifts__assignment-controls">
          <p className="shifts__assignment-context" aria-label="Selected assignment schedule context">
            <strong>{selectedEntry.selectedRole || 'Role not set'}</strong>
            <span>{selectedEntry.weekLabel || `${selectedEntry.startDate || 'Unknown'} - ${selectedEntry.endDate || 'Unknown'}`}</span>
          </p>

          {assignmentRows.length > 0 && (
            <div className="shifts__layout-toggle" role="tablist" aria-label="Published assignment layout">
              <button
                type="button"
                role="tab"
                aria-selected={assignmentLayout === 'employee'}
                className={`shifts__layout-toggle-button ${assignmentLayout === 'employee' ? 'is-active' : ''}`.trim()}
                onClick={() => setAssignmentLayout('employee')}
              >
                Employee view
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={assignmentLayout === 'day'}
                className={`shifts__layout-toggle-button ${assignmentLayout === 'day' ? 'is-active' : ''}`.trim()}
                onClick={() => setAssignmentLayout('day')}
              >
                Day-first view
              </button>
            </div>
          )}
        </div>

        {assignmentRows.length > 0 ? (
          assignmentLayout === 'employee' ? (
            <div className="shifts__assignment-shell" aria-label="Published assignments view">
              <table className="shifts__assignment-table">
                <thead>
                  <tr>
                    <th>Team member</th>
                    <th>Total</th>
                    {selectedDays.map((day) => (
                      <th key={`header-${day}`}>{day.slice(0, 3)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {assignmentRows.map(({ employee, totalAssigned, dailyAssignments }) => (
                    <tr key={employee.id}>
                      <td className="shifts__employee-cell">
                        <strong>{employee.name}</strong>
                      </td>
                      <td><span className="shifts__total-chip">{totalAssigned}</span></td>
                      {selectedDays.map((day) => {
                        const shiftsForDay = dailyAssignments[day] ?? [];

                        return (
                          <td key={`${employee.id}-${day}`}>
                            {shiftsForDay.length ? (
                              <div className="shifts__assignment-chip-row">
                                {shiftsForDay.map((shift) => (
                                  <span key={`${employee.id}-${day}-${shift}`} className="shifts__assignment-chip">{shift}</span>
                                ))}
                              </div>
                            ) : (
                              <span className="shifts__off-chip">Off</span>
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
            <div className="shifts__assignment-shell" aria-label="Published day-first view">
              <table className="shifts__assignment-table shifts__assignment-table--day-first">
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
                      <td className="shifts__employee-cell"><strong>{row.day}</strong></td>
                      <td>{row.required}</td>
                      <td>{row.assigned}</td>
                      <td>
                        <span className={`shifts__day-coverage-status ${row.open > 0 ? 'is-open' : 'is-filled'}`}>
                          {row.open > 0 ? row.open : '0'}
                        </span>
                      </td>
                      {row.employeeAssignments.map(({ employee, shifts }) => (
                        <td key={`day-first-${row.day}-${employee.id}`}>
                          {shifts.length ? (
                            <div className="shifts__assignment-chip-row">
                              {shifts.map((shift) => (
                                <span key={`day-first-${row.day}-${employee.id}-${shift}`} className="shifts__assignment-chip">{shift}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="shifts__off-chip">Off</span>
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
          <p>No published assignments for this role and week yet.</p>
        )}

        <div className="shifts__day-coverage" aria-label="Published day coverage">
          {dailyCoverageRows.map((row) => (
            <article key={row.day} className="shifts__day-coverage-item">
              <h4>{row.day}</h4>
              <p>{row.assigned} assigned / {row.required} required</p>
              <span className={`shifts__day-coverage-status ${row.open > 0 ? 'is-open' : 'is-filled'}`}>
                {row.open > 0 ? `${row.open} open` : 'Filled'}
              </span>
            </article>
          ))}
        </div>

        {(selectedReview.coverageGaps.length > 0 || selectedReview.shiftCapAlerts.length > 0) && (
          <div className="shifts__issues" aria-label="Published unresolved issues details">
            <h3>Issue details</h3>
            {selectedReview.coverageGaps.length > 0 && (
              <ul>
                {selectedReview.coverageGaps.map((gap) => (
                  <li key={`gap-${gap.day}-${gap.shift}`}>
                    Coverage gap: {gap.day} {gap.shift} ({gap.open} open)
                  </li>
                ))}
              </ul>
            )}
            {selectedReview.shiftCapAlerts.length > 0 && (
              <ul>
                {selectedReview.shiftCapAlerts.map((alert) => (
                  <li key={`alert-${alert.employeeId}`}>
                    Shift-cap alert: {alert.employeeName} assigned {alert.assigned} shifts (limit {alert.maxShifts})
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </ContentPanel>

      <ContentPanel>
        <div className="shifts__review-grid">
          <article className="shifts__review-card" aria-label="Assignment review summary">
            <h3>Assignments</h3>
            <p>{selectedReview.metrics.assignedSlots} assigned slots across {selectedReview.metrics.roleEmployeeCount} team members.</p>
          </article>
          <article className="shifts__review-card" aria-label="Coverage review summary">
            <h3>Coverage</h3>
            <p>{selectedReview.metrics.requiredSlots} required slots for the week.</p>
            <p>{selectedReview.metrics.openSlots} unfilled slots after publish.</p>
          </article>
          <article className="shifts__review-card" aria-label="Unresolved issues summary">
            <h3>Unresolved issues</h3>
            <p>{selectedReview.coverageGaps.length} coverage gap {selectedReview.coverageGaps.length === 1 ? 'issue' : 'issues'}.</p>
            <p>{selectedReview.shiftCapAlerts.length} shift-cap {selectedReview.shiftCapAlerts.length === 1 ? 'alert' : 'alerts'}.</p>
          </article>
        </div>
      </ContentPanel>
    </div>
  );
};