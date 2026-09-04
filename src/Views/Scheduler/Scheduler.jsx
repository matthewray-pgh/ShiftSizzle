import React, { useEffect, useState } from 'react';

import './Scheduler.scss';

import { ContentPanel, StatusBadge } from '../../Components';
import {
  DAYS,
  calculateScheduleReview,
  getOpenDays,
  getRolesWithSignal,
  getShiftTypes,
  getTeamRoles,
  normalizeOperatingHours,
  useAppState,
} from '../../state/AppState';

const formatShiftsPerWeek = (shiftsPerWeek = 0) => `${shiftsPerWeek} ${shiftsPerWeek === 1 ? 'shift' : 'shifts'}/week`;

const formatTimestamp = (value) => new Date(value).toLocaleString([], {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const formatRelativeTime = (timestamp) => {
  if (!timestamp) {
    return '';
  }

  const diffMinutes = Math.round((Date.now() - new Date(timestamp).getTime()) / 60000);

  if (diffMinutes <= 0) {
    return 'just now';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
  }

  return formatTimestamp(timestamp);
};

const ChecklistPill = ({ done, label }) => (
  <span className={`scheduler__checklist-pill ${done ? 'is-done' : ''}`.trim()}>
    <i className={`fas ${done ? 'fa-check' : 'fa-circle'}`} aria-hidden="true" />
    {label}
  </span>
);

const RoleTab = ({ label, active, onClick, badge }) => (
  <button
    type="button"
    role="tab"
    aria-selected={active}
    className={`scheduler__role-tab ${active ? 'is-active' : ''}`.trim()}
    onClick={onClick}
  >
    {label}
    {badge ? <span className="scheduler__role-tab-badge">{badge}</span> : null}
  </button>
);

const RoleSection = ({
  role,
  isExpanded,
  onToggleExpanded,
  stats,
  requirements,
  roleAssignments,
  allAssignments,
  employees,
  openDays,
  shiftTypes,
  onSetRequirement,
  onApplyToAllDays,
  onToggleAssignment,
  onAutoBuild,
}) => {
  const hasCoverageTargets = stats.metrics.requiredSlots > 0;
  const canGenerateDraft = hasCoverageTargets && employees.length > 0;
  const buildActionLabel = stats.metrics.assignedSlots > 0 ? 'Rebuild draft' : 'Generate draft';

  // shiftsPerWeek is a total across every role an employee works, not just
  // this one — so the cap check has to look across every role's bucket.
  const getTotalAssignedAcrossRoles = (employeeId) =>
    Object.values(allAssignments).reduce(
      (total, bucket) => total + openDays.reduce((dayTotal, d) => dayTotal + (bucket[employeeId]?.[d] ?? []).length, 0),
      0
    );

  const getAssignmentState = (employee, day, shift) => {
    const isAssigned = (roleAssignments[employee.id]?.[day] ?? []).includes(shift);
    const isAvailable = (employee.availability?.[day] ?? []).includes(shift);
    const totalAssignedAcrossRoles = getTotalAssignedAcrossRoles(employee.id);
    const isAtShiftCap = totalAssignedAcrossRoles >= employee.shiftsPerWeek;
    // Can't work two roles' shifts at the same time.
    const isDoubleBookedElsewhere = Object.entries(allAssignments).some(
      ([otherRole, bucket]) => otherRole !== role && (bucket[employee.id]?.[day] ?? []).includes(shift)
    );
    const isDisabled = !isAvailable || (!isAssigned && (isAtShiftCap || isDoubleBookedElsewhere));
    const buttonTitle = !isAvailable
      ? `${employee.name} is unavailable for ${day} ${shift}`
      : (!isAssigned && isDoubleBookedElsewhere)
        ? `${employee.name} is already working ${shift} on ${day} under another role`
        : isDisabled
          ? `${employee.name} has reached the ${employee.shiftsPerWeek} shifts/week limit`
          : `Toggle ${shift} for ${employee.name} on ${day}`;

    return { isAssigned, isDisabled, buttonTitle };
  };

  return (
    <ContentPanel className="scheduler__role-section">
      <button
        type="button"
        className="scheduler__role-section-header"
        onClick={onToggleExpanded}
        aria-expanded={isExpanded}
      >
        <div className="scheduler__role-section-header-left">
          <strong>{role}</strong>
          <span className="scheduler__muted-small">
            {stats.metrics.assignedSlots}/{stats.metrics.requiredSlots} filled · {employees.length} {employees.length === 1 ? 'person' : 'people'}
          </span>
        </div>
        <div className="scheduler__role-section-header-right">
          {!hasCoverageTargets ? (
            <span className="scheduler__pending-pill">No demand set</span>
          ) : stats.metrics.openSlots > 0 ? (
            <span className="scheduler__gap-pill">{stats.metrics.openSlots} open</span>
          ) : (
            <span className="scheduler__ok-pill">Covered</span>
          )}
          <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'}`} aria-hidden="true" />
        </div>
      </button>

      {isExpanded && (
        <div className="scheduler__role-section-body">
          <div className="scheduler__control-card-header">
            <div>
              <h3>Coverage targets</h3>
              <p className="scheduler__helper-copy scheduler__helper-copy--compact">
                Set one day, then apply it to the rest of the week.
              </p>
            </div>
            <button
              type="button"
              className="button-outline"
              disabled={!canGenerateDraft}
              onClick={onAutoBuild}
            >
              <i className="fas fa-wand-magic-sparkles" aria-hidden="true" /> {buildActionLabel}
            </button>
          </div>

          <div className="scheduler__requirements-stack" aria-label={`Coverage targets for ${role}`}>
            {openDays.map((day) => (
              <article key={day} className="scheduler__requirements-card">
                <div className="scheduler__requirements-card-head">
                  <h4>{day}</h4>
                  <button
                    type="button"
                    className="scheduler__inline-link"
                    onClick={() => onApplyToAllDays(day)}
                  >
                    Apply to all days
                  </button>
                </div>
                <div className="scheduler__requirements-card-grid">
                  {shiftTypes.map((shift) => (
                    <label key={`${day}-${shift}`} className="scheduler__requirements-field">
                      <span>{shift}</span>
                      <input
                        type="number"
                        min={0}
                        value={requirements[day]?.[shift] ?? 0}
                        onChange={(e) => onSetRequirement(day, shift, e.target.value)}
                        className="scheduler__requirements-input"
                      />
                    </label>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <h3 className="scheduler__role-section-subheading">Assignments</h3>
          {employees.length === 0 ? (
            <p>No active employees are available for {role} yet. Add or reactivate team members in Team.</p>
          ) : (
            <div className="scheduler__assignment-grid" aria-label={`Weekly editor for ${role}`}>
              {employees.map((employee) => {
                const totalAssigned = getTotalAssignedAcrossRoles(employee.id);

                return (
                  <article key={employee.id} className="scheduler__employee-card">
                    <div className="scheduler__employee-header">
                      <div>
                        <strong>{employee.name}</strong>
                        <span>{employee.title}</span>
                        <small className="scheduler__employee-cap">{formatShiftsPerWeek(employee.shiftsPerWeek)}</small>
                        <small className={`scheduler__employee-load ${totalAssigned >= employee.shiftsPerWeek ? 'is-capped' : ''}`.trim()}>
                          {totalAssigned}/{employee.shiftsPerWeek} assigned
                        </small>
                      </div>
                    </div>
                    <div className="scheduler__day-list">
                      {openDays.map((day) => (
                        <div key={`${employee.id}-${day}`} className="scheduler__day-row">
                          <span>{day.slice(0, 3)}</span>
                          <div className="scheduler__shift-buttons">
                            {shiftTypes.map((shift) => {
                              const { isAssigned, isDisabled, buttonTitle } = getAssignmentState(employee, day, shift);

                              return (
                                <button
                                  key={`${employee.id}-${day}-${shift}`}
                                  type="button"
                                  className={`scheduler__shift-toggle ${isAssigned ? 'is-active' : ''}`.trim()}
                                  disabled={isDisabled}
                                  title={buttonTitle}
                                  onClick={() => onToggleAssignment(employee.id, day, shift)}
                                >
                                  {shift}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </ContentPanel>
  );
};

export const Scheduler = () => {
  const appState = useAppState();
  const { state, dispatch } = appState;
  const { employees, schedule, settings } = state;

  const [activeRoleFilter, setActiveRoleFilter] = useState('All');
  const [expandedRoles, setExpandedRoles] = useState({});
  const [isEditingWeekStart, setIsEditingWeekStart] = useState(false);
  const [pendingReset, setPendingReset] = useState(false);

  // On phones the builder paints the app background to match the header, so
  // the white control panels float on it — same treatment as the Dashboard.
  useEffect(() => {
    document.body.classList.add('scheduler-view');
    return () => document.body.classList.remove('scheduler-view');
  }, []);

  const openDays = getOpenDays(settings);
  const shiftTypes = getShiftTypes(settings);
  const teamRoles = getTeamRoles(settings, employees);
  const operatingHours = normalizeOperatingHours(settings.operatingHours);
  const configuredWeekStart = settings.weekStartsOn;
  const configuredWeekEnd = configuredWeekStart ? DAYS[(DAYS.indexOf(configuredWeekStart) + 6) % DAYS.length] : '';
  const hasWeekSettings = Boolean(configuredWeekStart);
  const hasWeekRange = Boolean(schedule.startDate && schedule.endDate && schedule.weekLabel);

  const selectWeek = (nextStartDate) => {
    if (schedule.hasUnsavedChanges) {
      dispatch({ type: 'SAVE_SCHEDULE_DRAFT' });
    }

    dispatch({ type: 'SELECT_WEEK', payload: { startDate: nextStartDate } });
  };

  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const linkedWeekStart = queryParams.get('weekStart');
    const linkedRole = queryParams.get('role');
    const hasDeepLinkParams = Boolean(linkedWeekStart || linkedRole);

    if (!hasDeepLinkParams) {
      return;
    }

    if (linkedWeekStart && linkedWeekStart !== schedule.startDate) {
      selectWeek(linkedWeekStart);
    }

    if (linkedRole && teamRoles.includes(linkedRole)) {
      setActiveRoleFilter(linkedRole);
    }

    queryParams.delete('weekStart');
    queryParams.delete('role');
    const nextSearch = queryParams.toString();

    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleWeekStartChange = (e) => {
    const nextWeekStart = e.target.value;

    if (nextWeekStart === schedule.startDate) {
      return;
    }

    selectWeek(nextWeekStart);
  };

  const handleWeekStartsOnChange = (e) => {
    const nextDay = e.target.value;

    dispatch({ type: 'UPDATE_SETTINGS', payload: { weekStartsOn: nextDay } });
    setIsEditingWeekStart(false);
  };

  const handleRequirementChange = (role, day, shift, value) => {
    dispatch({
      type: 'UPDATE_REQUIREMENTS',
      payload: { role, day, shift, value: Math.max(0, parseInt(value, 10) || 0) },
    });
  };

  const handleApplyToAllDays = (role, sourceDay) => {
    dispatch({ type: 'APPLY_REQUIREMENTS_TO_ALL_DAYS', payload: { role, sourceDay } });
  };

  const handleToggleAssignment = (employeeId, role, day, shift) => {
    dispatch({ type: 'TOGGLE_ASSIGNMENT', payload: { employeeId, role, day, shift } });
  };

  const handleAutoBuild = (role) => {
    dispatch({ type: 'AUTO_BUILD_SCHEDULE', payload: { role } });
  };

  const handleResetWeek = () => {
    dispatch({ type: 'RESET_WEEK_DRAFT' });
    setPendingReset(false);
  };

  const roleStats = Object.fromEntries(teamRoles.map((role) => [
    role,
    calculateScheduleReview({
      assignments: schedule.assignments[role] ?? {},
      allAssignments: schedule.assignments,
      requirements: schedule.roleRequirements[role] ?? {},
      employees,
      selectedRole: role,
      shiftTypes,
      operatingHours,
    }),
  ]));

  const totals = Object.values(roleStats).reduce((acc, stats) => ({
    required: acc.required + stats.metrics.requiredSlots,
    open: acc.open + stats.metrics.openSlots,
  }), { required: 0, open: 0 });

  const rolesWithSignal = getRolesWithSignal(state, teamRoles);
  const demandSet = totals.required > 0;
  const coverageComplete = demandSet && totals.open === 0;
  const hasUnsavedChanges = Boolean(schedule.hasUnsavedChanges);
  const canSaveDraft = hasUnsavedChanges && rolesWithSignal.length > 0;
  const savedLabel = hasUnsavedChanges
    ? 'Unsaved changes'
    : schedule.lastSavedAt
      ? `Autosaved ${formatRelativeTime(schedule.lastSavedAt)}`
      : 'Not saved yet';
  const rolesToShow = activeRoleFilter === 'All' ? teamRoles : [activeRoleFilter];

  return (
    <div className="scheduler">
      <div className="scheduler__page-header">
        <div className="scheduler__page-copy">
          <h2>Build Schedule</h2>
          <p className="scheduler__subhead">
            {hasWeekRange
              ? 'One week, every role. Switching roles just filters the view.'
              : 'Choose which day your schedules start on, then pick a start date below.'}
          </p>
          <p className="scheduler__editing-context" aria-label="Active editing context">
            {hasWeekRange ? `Active week: ${schedule.weekLabel}` : 'No week selected yet'}
          </p>
        </div>
        <div className="scheduler__status-panel" aria-label="Schedule status panel">
          <StatusBadge status={schedule.status} label={schedule.status === 'published' ? 'Published schedule' : 'Draft schedule'} />
          <p className="scheduler__status-summary">
            {!hasWeekRange
              ? 'Set the week to start planning.'
              : coverageComplete
                ? 'Coverage is complete for every role.'
                : demandSet
                  ? `${totals.open} open ${totals.open === 1 ? 'slot' : 'slots'} across the week.`
                  : 'Add coverage targets to get started.'}
          </p>
        </div>
      </div>

      <ContentPanel>
        <div className="scheduler__control-card-header">
          <div>
            <h3>Week</h3>
            <p className="scheduler__helper-copy scheduler__helper-copy--compact">
              Pick the week you're planning.
            </p>
          </div>
          {hasWeekRange && (
            <button type="button" className="button-outline" onClick={() => setPendingReset(true)}>
              Reset week
            </button>
          )}
        </div>
        {(!hasWeekSettings || isEditingWeekStart) ? (
          <div className="scheduler__week-start-setup" role="group" aria-label="Set scheduling week start day">
            <label htmlFor="week-starts-on-select" className="scheduler__label">Week starts on</label>
            <select
              id="week-starts-on-select"
              className="scheduler__role-select"
              value={configuredWeekStart}
              onChange={handleWeekStartsOnChange}
            >
              <option value="">Select a day</option>
              {DAYS.map((day) => (
                <option key={day} value={day}>{day}</option>
              ))}
            </select>
            <p className="scheduler__helper-copy scheduler__helper-copy--compact">
              Schedules always start on this day.
            </p>
          </div>
        ) : (
          <p className="scheduler__week-start-summary">
            Week starts {configuredWeekStart}.{' '}
            <button type="button" className="scheduler__inline-link" onClick={() => setIsEditingWeekStart(true)}>
              Change
            </button>
          </p>
        )}
        <label htmlFor="week-start-date" className="scheduler__label">Week start date</label>
        <input
          id="week-start-date"
          type="date"
          value={schedule.startDate}
          onChange={handleWeekStartChange}
          className="scheduler__date-input"
          disabled={!hasWeekSettings}
        />
        <p className="scheduler__helper-copy scheduler__helper-copy--compact">
          {!hasWeekSettings
            ? 'Set a start day above first.'
            : hasWeekRange
              ? `${configuredWeekStart} to ${configuredWeekEnd}.`
              : `Pick a ${configuredWeekStart} to match your schedule week.`}
        </p>
      </ContentPanel>

      {hasWeekRange && (
        <>
          <ContentPanel className="scheduler__checklist" aria-label="Schedule checklist">
            <div className="scheduler__checklist-pills">
              <ChecklistPill done={demandSet} label="Demand set" />
              <ChecklistPill
                done={coverageComplete}
                label={coverageComplete ? 'Coverage complete' : `Coverage: ${totals.open} open ${totals.open === 1 ? 'slot' : 'slots'}`}
              />
              <ChecklistPill done={!hasUnsavedChanges && Boolean(schedule.lastSavedAt)} label={savedLabel} />
              <ChecklistPill done={schedule.status === 'published'} label={schedule.status === 'published' ? 'Published' : 'Not published'} />
            </div>
            <div className="scheduler__checklist-actions">
              <button type="button" className="button-outline" disabled={!canSaveDraft} onClick={() => dispatch({ type: 'SAVE_SCHEDULE_DRAFT' })}>
                Save draft
              </button>
              <button
                type="button"
                className="button"
                disabled={!coverageComplete}
                onClick={() => dispatch({ type: 'PUBLISH_SCHEDULE' })}
                title={coverageComplete ? 'Publish this week' : 'Resolve open slots first'}
              >
                Publish week
              </button>
            </div>
          </ContentPanel>

          <div className="scheduler__role-tabs" role="tablist" aria-label="Role filter">
            <RoleTab
              label="All roles"
              active={activeRoleFilter === 'All'}
              onClick={() => setActiveRoleFilter('All')}
              badge={totals.open > 0 ? totals.open : null}
            />
            {teamRoles.map((role) => (
              <RoleTab
                key={role}
                label={role}
                active={activeRoleFilter === role}
                onClick={() => setActiveRoleFilter(role)}
                badge={roleStats[role].metrics.openSlots > 0 ? roleStats[role].metrics.openSlots : null}
              />
            ))}
          </div>

          {openDays.length === 0 ? (
            <ContentPanel>
              <p>No operating days are enabled. Update business hours in Settings to plan coverage.</p>
            </ContentPanel>
          ) : (
            rolesToShow.map((role) => (
              <RoleSection
                key={role}
                role={role}
                isExpanded={activeRoleFilter !== 'All' || Boolean(expandedRoles[role])}
                onToggleExpanded={() => setExpandedRoles((prev) => ({ ...prev, [role]: !prev[role] }))}
                stats={roleStats[role]}
                requirements={schedule.roleRequirements[role] ?? {}}
                roleAssignments={schedule.assignments[role] ?? {}}
                allAssignments={schedule.assignments}
                employees={employees.filter((employee) => employee.roles.includes(role) && employee.status !== 'archived')}
                openDays={openDays}
                shiftTypes={shiftTypes}
                onSetRequirement={(day, shift, value) => handleRequirementChange(role, day, shift, value)}
                onApplyToAllDays={(sourceDay) => handleApplyToAllDays(role, sourceDay)}
                onToggleAssignment={(employeeId, day, shift) => handleToggleAssignment(employeeId, role, day, shift)}
                onAutoBuild={() => handleAutoBuild(role)}
              />
            ))
          )}

          <ContentPanel>
            <h3 className="scheduler__role-section-subheading">Manager notes</h3>
            <label htmlFor="scheduler-notes" className="scheduler__label scheduler__visually-hidden">Manager notes</label>
            <textarea
              id="scheduler-notes"
              className="scheduler__notes"
              value={schedule.notes}
              onChange={(e) => dispatch({ type: 'UPDATE_SCHEDULE_NOTES', payload: e.target.value })}
              placeholder="Schedule notes"
            />
            <div className="scheduler__publish-meta">
              {schedule.lastSavedAt && <small>Last saved {formatTimestamp(schedule.lastSavedAt)}</small>}
              {schedule.lastPublishedAt && <small>Last published {formatTimestamp(schedule.lastPublishedAt)}</small>}
            </div>
          </ContentPanel>
        </>
      )}

      {pendingReset && (
        <div className="scheduler__modal-overlay" role="dialog" aria-modal="true" aria-labelledby="reset-week-modal-title">
          <div className="scheduler__modal">
            <h2 id="reset-week-modal-title">Reset this week?</h2>
            <p>
              Clears coverage targets, assignments, and notes for every role in {schedule.weekLabel || 'this week'}.
              Saved and published schedules aren't affected.
            </p>
            <div className="scheduler__modal-actions">
              <button type="button" className="button-outline" onClick={() => setPendingReset(false)}>
                Cancel
              </button>
              <button type="button" className="button" onClick={handleResetWeek}>
                Reset week
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
