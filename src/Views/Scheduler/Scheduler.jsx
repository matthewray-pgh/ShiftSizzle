import React, { useEffect, useMemo, useState } from 'react';

import './Scheduler.scss';

import { ContentPanel } from '../../Components';
import { DAYS, getOpenDays, getShiftTypes, getTeamRoles, useAppState } from '../../state/AppState';

const formatShiftsPerWeek = (shiftsPerWeek = 0) => `${shiftsPerWeek} ${shiftsPerWeek === 1 ? 'shift' : 'shifts'}/week`;
const formatLastPublishedAt = (publishedAt) => new Date(publishedAt).toLocaleString([], {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const formatLastSavedAt = (savedAt) => new Date(savedAt).toLocaleString([], {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const EDITOR_VIEW_STORAGE_KEY = 'shiftsizzle.scheduler-editor-view';

const getInitialEditorView = () => {
  if (typeof window === 'undefined') {
    return 'individual';
  }

  const storedView = window.sessionStorage.getItem(EDITOR_VIEW_STORAGE_KEY);
  return storedView || 'individual';
};

export const Scheduler = () => {
  const { state, dispatch } = useAppState();
  const { employees, schedule, settings } = state;
  const [editorView, setEditorView] = useState(getInitialEditorView);
  const openDays = getOpenDays(settings);
  const shiftTypes = getShiftTypes(settings);
  const teamRoles = getTeamRoles(settings, employees);
  const selectedRole = schedule.selectedRole;
  const shouldStackCoverageTargets = shiftTypes.length > 4;
  const configuredWeekStart = settings.weekStartsOn;
  const configuredWeekEnd = configuredWeekStart ? DAYS[(DAYS.indexOf(configuredWeekStart) + 6) % DAYS.length] : '';

  const handleRequirementChange = (day, shift, value) => {
    dispatch({
      type: 'UPDATE_REQUIREMENTS',
      payload: {
        ...schedule.requirements,
        [day]: {
          ...schedule.requirements[day],
          [shift]: Math.max(0, parseInt(value, 10) || 0),
        },
      },
    });
  };

  const handleRoleChange = (e) => {
    dispatch({ type: 'SET_SELECTED_ROLE', payload: e.target.value });
  };

  const handleWeekStartChange = (e) => {
    dispatch({ type: 'SET_SCHEDULE_START_DATE', payload: e.target.value });
  };

  const scrollToWorkflowSection = (sectionId) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const filteredEmployees = useMemo(
    () => employees.filter((employee) => employee.role === selectedRole && employee.status !== 'archived'),
    [employees, selectedRole]
  );

  const openShifts = useMemo(
    () =>
      openDays.flatMap((day) =>
        shiftTypes.flatMap((shift) => {
          const required = schedule.requirements[day]?.[shift] ?? 0;
          const assigned = filteredEmployees.reduce(
            (count, employee) => count + ((schedule.assignments[employee.id]?.[day] ?? []).includes(shift) ? 1 : 0),
            0
          );

          return assigned >= required ? [] : [{ day, shift, open: required - assigned }];
        })
      ),
    [filteredEmployees, openDays, schedule.assignments, schedule.requirements, shiftTypes]
  );

  const scheduledTotals = useMemo(
    () =>
      filteredEmployees.reduce(
        (count, employee) =>
          count + openDays.reduce((dayCount, day) => dayCount + (schedule.assignments[employee.id]?.[day] ?? []).length, 0),
        0
      ),
    [filteredEmployees, openDays, schedule.assignments]
  );

  const employeeAssignmentTotals = useMemo(
    () => Object.fromEntries(
      filteredEmployees.map((employee) => [
        employee.id,
        openDays.reduce((count, day) => count + ((schedule.assignments[employee.id]?.[day] ?? []).length), 0),
      ])
    ),
    [filteredEmployees, openDays, schedule.assignments]
  );

  const employeeLimitAlerts = useMemo(
    () => filteredEmployees.filter((employee) => (employeeAssignmentTotals[employee.id] ?? 0) > employee.shiftsPerWeek),
    [employeeAssignmentTotals, filteredEmployees]
  );

  const totalOpenSlots = useMemo(
    () => openShifts.reduce((total, shift) => total + shift.open, 0),
    [openShifts]
  );

  const totalRequiredSlots = useMemo(
    () => openDays.reduce(
      (total, day) => total + shiftTypes.reduce(
        (dayTotal, shift) => dayTotal + (schedule.requirements[day]?.[shift] ?? 0),
        0,
      ),
      0,
    ),
    [openDays, schedule.requirements, shiftTypes]
  );

  const coveragePlanComplete = Boolean(schedule.coveragePlanReviewed);
  const hasUnsavedChanges = Boolean(schedule.hasUnsavedChanges);
  const hasWeekSettings = Boolean(configuredWeekStart);
  const hasWeekRange = Boolean(schedule.startDate && schedule.endDate && schedule.weekLabel);
  const hasRoleSelected = Boolean(selectedRole);
  const hasCoverageTargets = totalRequiredSlots > 0;
  const currentRoleDraftExists = scheduledTotals > 0;
  const issuesResolved = currentRoleDraftExists && totalOpenSlots === 0 && employeeLimitAlerts.length === 0;
  const canConfirmCoverage = hasWeekRange && hasRoleSelected && hasCoverageTargets;
  const canGenerateDraft = hasWeekRange
    && hasRoleSelected
    && hasCoverageTargets
    && coveragePlanComplete
    && filteredEmployees.length > 0;

  const publishReady = hasWeekRange
    && hasRoleSelected
    && coveragePlanComplete
    && totalOpenSlots === 0
    && employeeLimitAlerts.length === 0
    && filteredEmployees.length > 0
    && scheduledTotals > 0;
  const canSaveDraft = hasWeekRange
    && hasRoleSelected
    && hasUnsavedChanges
    && (hasCoverageTargets || currentRoleDraftExists || coveragePlanComplete || Boolean(schedule.notes.trim()));
  const canPublish = publishReady && !hasUnsavedChanges && Boolean(schedule.lastSavedAt);

  const buildActionLabel = currentRoleDraftExists ? 'Rebuild draft' : 'Generate draft';
  const resetDraftLabel = currentRoleDraftExists ? 'Clear current role draft' : 'Reset to blank draft';

  const scheduleStatusLabel = schedule.status === 'published' ? 'Published schedule' : 'Draft schedule';
  const activeWeekLabel = hasWeekRange ? schedule.weekLabel : 'Not selected';
  const roleFocusLabel = hasRoleSelected ? selectedRole : 'Not selected';

  const heroSubhead = hasWeekRange && hasRoleSelected
    ? `Build and publish the active ${schedule.weekLabel} staffing plan for ${selectedRole} coverage.`
    : 'Choose a week, select a role, and confirm demand before generating a schedule.';

  const weekSelectionNote = !hasWeekSettings
    ? 'Set the workspace week start in Settings before choosing a week to generate.'
    : schedule.startDate && !hasWeekRange
      ? `Pick a ${configuredWeekStart} so the generated week matches the workspace schedule cycle.`
      : hasWeekRange
        ? `${configuredWeekStart} to ${configuredWeekEnd}. ${schedule.weekLabel}.`
        : `Choose a ${configuredWeekStart} start date for the schedule you want to generate.`;

  const coveragePlanNote = !hasWeekRange
    ? 'Choose a week before confirming demand.'
    : !hasRoleSelected
      ? 'Select a role before confirming demand.'
      : !hasCoverageTargets
        ? 'Add at least one required slot before confirming demand.'
        : coveragePlanComplete
          ? `Confirmed for ${selectedRole}. Any target change will reset this checkpoint.`
          : 'Review the targets, then confirm the plan.';

  const publishSummary = canPublish
    ? 'Coverage is filled and the saved draft is ready to publish.'
    : !hasWeekRange
      ? 'Choose the week you want to generate before publishing.'
      : !hasRoleSelected
        ? 'Select the role you are publishing before continuing.'
        : !coveragePlanComplete
          ? 'Confirm the coverage plan before publishing.'
          : hasUnsavedChanges
            ? 'Save the current draft before publishing.'
          : totalOpenSlots > 0
            ? `Resolve ${totalOpenSlots} open ${totalOpenSlots === 1 ? 'slot' : 'slots'} before publishing.`
            : employeeLimitAlerts.length > 0
              ? 'One or more employees exceed their shifts-per-week limit.'
              : filteredEmployees.length === 0
                ? 'Add or reactivate employees for this role before publishing.'
                : 'Add at least one assignment before publishing.';

  const workflowPublishDescription = canPublish
    ? 'Ready to publish.'
    : !hasWeekRange
      ? 'Choose week.'
      : !hasRoleSelected
        ? 'Select role.'
        : !coveragePlanComplete
          ? 'Confirm demand.'
          : hasUnsavedChanges
            ? 'Save draft.'
          : totalOpenSlots > 0
            ? `${totalOpenSlots} open ${totalOpenSlots === 1 ? 'slot' : 'slots'}.`
            : employeeLimitAlerts.length > 0
              ? `${employeeLimitAlerts.length} shift-cap ${employeeLimitAlerts.length === 1 ? 'alert' : 'alerts'}.`
              : filteredEmployees.length === 0
                ? 'Add staff.'
                : 'Add assignments.';

  const resolvePhaseDescription = !hasWeekRange
    ? 'Choose a week first.'
    : !hasRoleSelected
      ? 'Select a role first.'
      : !currentRoleDraftExists
        ? 'Generate a draft first.'
    : issuesResolved
      ? 'No blockers remain.'
      : totalOpenSlots > 0 && employeeLimitAlerts.length > 0
        ? `${totalOpenSlots} gaps and ${employeeLimitAlerts.length} alerts remain.`
        : totalOpenSlots > 0
          ? `${totalOpenSlots} coverage ${totalOpenSlots === 1 ? 'gap' : 'gaps'} remain.`
          : `${employeeLimitAlerts.length} shift-cap ${employeeLimitAlerts.length === 1 ? 'alert' : 'alerts'} remain.`;

  const generationCheckpoints = [
    {
      label: 'Week selected',
      complete: hasWeekRange,
      pendingCopy: hasWeekSettings ? `Choose a ${configuredWeekStart} start date.` : 'Set the workspace week start in Settings.',
    },
    {
      label: 'Role selected',
      complete: hasRoleSelected,
      pendingCopy: 'Choose the role this schedule is being generated for.',
    },
    {
      label: 'Demand added',
      complete: hasCoverageTargets,
      pendingCopy: 'Add at least one required slot to define demand.',
    },
    {
      label: 'Demand confirmed',
      complete: coveragePlanComplete,
      pendingCopy: 'Confirm the coverage plan before generating the draft.',
    },
    {
      label: 'Staff available',
      complete: hasRoleSelected && filteredEmployees.length > 0,
      pendingCopy: 'Add or reactivate employees for this role before generating.',
    },
  ];

  const nextGenerationCheckpoint = generationCheckpoints.find((checkpoint) => !checkpoint.complete);

  const workflowSteps = [
    {
      id: 'demand',
      targetId: 'scheduler-demand-phase',
      label: 'Define demand',
      description: coveragePlanComplete
        ? `${totalRequiredSlots} ${totalRequiredSlots === 1 ? 'slot' : 'slots'} confirmed.`
        : !hasWeekRange
          ? 'Choose week.'
          : !hasRoleSelected
            ? 'Select role.'
            : hasCoverageTargets
              ? 'Confirm targets.'
              : 'Add targets.',
      complete: coveragePlanComplete,
    },
    {
      id: 'build',
      targetId: 'scheduler-build-phase',
      label: 'Build draft',
      description: currentRoleDraftExists
        ? `${scheduledTotals} ${scheduledTotals === 1 ? 'shift' : 'shifts'} assigned.`
        : canGenerateDraft
          ? 'Generate first pass.'
          : nextGenerationCheckpoint?.pendingCopy ?? 'Complete setup first.',
      complete: currentRoleDraftExists,
    },
    {
      id: 'resolve',
      targetId: 'scheduler-resolve-phase',
      label: 'Resolve issues',
      description: resolvePhaseDescription,
      complete: issuesResolved,
    },
    {
      id: 'publish',
      targetId: 'scheduler-publish-phase',
      label: 'Publish schedule',
      description: workflowPublishDescription,
      complete: canPublish,
    },
  ];

  const editorViewOptions = [
    { id: 'individual', label: 'Individual', ariaLabel: 'Individual employee view' },
    { id: 'day', label: 'Daily', ariaLabel: 'Daily view' },
    { id: 'comprehensive', label: 'Weekly', ariaLabel: 'Weekly view' },
  ];

  const editorViewSummary = {
    individual: 'Review one employee at a time to balance weekly caps and availability.',
    day: 'Work day-by-day when you want to fill coverage gaps for a specific service period first.',
    comprehensive: 'Scan the whole week as one scheduling canvas, then adjust day cells inline without jumping between cards.',
  };

  useEffect(() => {
    window.sessionStorage.setItem(EDITOR_VIEW_STORAGE_KEY, editorView);
  }, [editorView]);

  const getAssignmentState = (employee, day, shift) => {
    const isAssigned = (schedule.assignments[employee.id]?.[day] ?? []).includes(shift);
    const isAvailable = (employee.availability?.[day] ?? []).includes(shift);
    const isAtShiftCap = (employeeAssignmentTotals[employee.id] ?? 0) >= employee.shiftsPerWeek;
    const isDisabled = !isAvailable || (!isAssigned && isAtShiftCap);
    const buttonTitle = !isAvailable
      ? `${employee.name} is unavailable for ${day} ${shift}`
      : isDisabled
        ? `${employee.name} has reached the ${employee.shiftsPerWeek} shifts/week limit`
        : `Toggle ${shift} for ${employee.name} on ${day}`;

    return {
      isAssigned,
      isDisabled,
      buttonTitle,
    };
  };

  const renderShiftToggle = (employee, day, shift, keyPrefix = 'toggle') => {
    const { isAssigned, isDisabled, buttonTitle } = getAssignmentState(employee, day, shift);

    return (
      <button
        key={`${keyPrefix}-${employee.id}-${day}-${shift}`}
        type="button"
        className={`scheduler__shift-toggle ${isAssigned ? 'is-active' : ''}`.trim()}
        disabled={isDisabled}
        title={buttonTitle}
        onClick={() => dispatch({
          type: 'TOGGLE_ASSIGNMENT',
          payload: { employeeId: employee.id, day, shift },
        })}
      >
        {shift}
      </button>
    );
  };

  const renderIndividualEditor = () => (
    <div className="scheduler__assignment-grid" aria-label="Weekly editor by individual">
      {filteredEmployees.map((employee) => (
        <article key={employee.id} className="scheduler__employee-card">
          <div className="scheduler__employee-header">
            <div>
              <strong>{employee.name}</strong>
              <span>{employee.title}</span>
              <small className="scheduler__employee-cap">{formatShiftsPerWeek(employee.shiftsPerWeek)}</small>
              <small className={`scheduler__employee-load ${(employeeAssignmentTotals[employee.id] ?? 0) >= employee.shiftsPerWeek ? 'is-capped' : ''}`.trim()}>
                {employeeAssignmentTotals[employee.id] ?? 0}/{employee.shiftsPerWeek} assigned
              </small>
            </div>
          </div>
          <div className="scheduler__day-list">
            {openDays.map((day) => (
              <div key={`${employee.id}-${day}`} className="scheduler__day-row">
                <span>{day.slice(0, 3)}</span>
                <div className="scheduler__shift-buttons">
                  {shiftTypes.map((shift) => renderShiftToggle(employee, day, shift, 'individual'))}
                </div>
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  );

  const renderDayEditor = () => (
    <div className="scheduler__day-editor-grid" aria-label="Weekly editor by day">
      {openDays.map((day) => (
        <article key={day} className="scheduler__day-editor-card">
          <div className="scheduler__day-editor-header">
            <h3>{day}</h3>
            <span>
              {filteredEmployees.reduce((total, employee) => total + ((schedule.assignments[employee.id]?.[day] ?? []).length), 0)} assigned
            </span>
          </div>
          <div className="scheduler__day-editor-list">
            {filteredEmployees.map((employee) => (
              <div key={`${day}-${employee.id}`} className="scheduler__day-editor-row">
                <div className="scheduler__day-editor-person">
                  <strong>{employee.name}</strong>
                  <small>{employeeAssignmentTotals[employee.id] ?? 0}/{employee.shiftsPerWeek} assigned</small>
                </div>
                <div className="scheduler__shift-buttons">
                  {shiftTypes.map((shift) => renderShiftToggle(employee, day, shift, 'day'))}
                </div>
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  );

  const renderComprehensiveEditor = () => (
    <div className="scheduler__canvas" aria-label="Weekly editor weekly canvas">
      <div className="scheduler__canvas-rows">
        {filteredEmployees.map((employee) => (
          <article key={employee.id} className="scheduler__canvas-row">
            <div className="scheduler__canvas-person">
              <strong>{employee.name}</strong>
              <span>{employee.title}</span>
              <small>{employeeAssignmentTotals[employee.id] ?? 0}/{employee.shiftsPerWeek} assigned</small>
            </div>
            <div className="scheduler__canvas-days">
              {openDays.map((day) => {
                const assignedShifts = schedule.assignments[employee.id]?.[day] ?? [];

                return (
                  <section key={`${employee.id}-${day}`} className="scheduler__canvas-day-cell" aria-label={`${employee.name} ${day}`}>
                    <div className="scheduler__canvas-day-meta">
                      <strong>{day}</strong>
                      <span>{assignedShifts.length ? `${assignedShifts.length} assigned` : 'Unassigned'}</span>
                    </div>
                    <div className="scheduler__canvas-day-actions">
                      {shiftTypes.map((shift) => renderShiftToggle(employee, day, shift, 'canvas'))}
                    </div>
                  </section>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </div>
  );

  const renderEditor = () => {
    switch (editorView) {
      case 'day':
        return renderDayEditor();
      case 'comprehensive':
        return renderComprehensiveEditor();
      default:
        return renderIndividualEditor();
    }
  };

  return (
    <div className="scheduler">
      <ContentPanel>
        <div className="scheduler__page-header">
          <div className="scheduler__page-copy">
            <span className="scheduler__page-eyebrow">Schedule workspace</span>
            <h2>Schedule Control Panel</h2>
            <p className="scheduler__subhead">
              {heroSubhead}
            </p>
            <p className="scheduler__hero-summary">
              Use this workspace to configure one schedule at a time, then publish it once each checkpoint is complete.
            </p>
          </div>
          <div className="scheduler__status-panel" aria-label="Schedule status panel">
            <div className={`scheduler__status scheduler__status--${schedule.status}`}>
              {scheduleStatusLabel}
            </div>
            <dl className="scheduler__status-meta">
              <div className="scheduler__status-meta-item">
                <dt>Active week</dt>
                <dd>{activeWeekLabel}</dd>
              </div>
              <div className="scheduler__status-meta-item">
                <dt>Role in focus</dt>
                <dd>{roleFocusLabel}</dd>
              </div>
            </dl>
          </div>
        </div>
      </ContentPanel>

      <div className="scheduler__workflow-shell">
        <ContentPanel>
          <div className="scheduler__workflow-panel" aria-label="Schedule workflow">
            {workflowSteps.map((step, index) => (
              <button
                key={step.id}
                type="button"
                className={`scheduler__workflow-step ${step.complete ? 'is-complete' : 'is-pending'}`.trim()}
                onClick={() => scrollToWorkflowSection(step.targetId)}
              >
                <div className="scheduler__workflow-step-marker" aria-hidden="true">
                  <span className="scheduler__workflow-icon">
                    <i className={`fas ${step.complete ? 'fa-check' : 'fa-circle'}`} />
                  </span>
                  {index < workflowSteps.length - 1 && <span className="scheduler__workflow-line" />}
                </div>
                <div className="scheduler__workflow-step-copy">
                  <strong>{step.label}</strong>
                  <p>{step.description}</p>
                </div>
              </button>
            ))}
          </div>
        </ContentPanel>
      </div>

      <ContentPanel>
        <div id="scheduler-demand-phase" className="scheduler__anchor" />
        <div className="scheduler__section-header">
          <div>
            <span className="scheduler__step-eyebrow">Phase 1</span>
            <h2>Define demand</h2>
            <p>Choose the role you are planning for and set target coverage for each open day and shift.</p>
          </div>
        </div>
        <div className="scheduler__control-grid scheduler__control-grid--coverage">
          <div className="scheduler__control-card scheduler__control-card--coverage-role">
            <div className="scheduler__control-card-header">
              <div>
                <h3>Planning Scope</h3>
                <p className="scheduler__helper-copy scheduler__helper-copy--compact">
                  Pick the role first. That controls who appears in the editor and how many targets need coverage.
                </p>
              </div>
              <span className="scheduler__coverage-summary-chip">{totalRequiredSlots} required slots</span>
            </div>
            {!hasWeekSettings && (
              <div className="scheduler__setup-banner" role="status" aria-label="Scheduling week setup notice">
                <strong>Scheduling week setup required</strong>
                <p>
                  Set the workspace week start in{' '}
                  <a href="/settings">Settings</a>
                  {' '}before choosing the week to generate here.
                </p>
              </div>
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
              {weekSelectionNote}
            </p>
            <label htmlFor="role-select" className="scheduler__label">Role</label>
            <select
              id="role-select"
              value={selectedRole}
              onChange={handleRoleChange}
              className="scheduler__role-select"
            >
              <option value="">Select role</option>
              {teamRoles.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
            <dl className="scheduler__scope-summary" aria-label="Planning scope summary">
              <div className="scheduler__scope-summary-item">
                <dt>Week status</dt>
                <dd>{hasWeekRange ? 'Selected' : 'Needed'}</dd>
              </div>
              <div className="scheduler__scope-summary-item">
                <dt>Eligible team</dt>
                <dd>{filteredEmployees.length} employees</dd>
              </div>
              <div className="scheduler__scope-summary-item">
                <dt>Draft assignments</dt>
                <dd>{scheduledTotals} shifts assigned</dd>
              </div>
              <div className="scheduler__scope-summary-item">
                <dt>Coverage shape</dt>
                <dd>{openDays.length} days x {shiftTypes.length} shifts</dd>
              </div>
            </dl>
          </div>
          <div className="scheduler__control-card scheduler__control-card--coverage-targets">
            <div className="scheduler__control-card-header">
              <div>
                <h3>Coverage Targets</h3>
                <p className="scheduler__helper-copy scheduler__helper-copy--compact">
                  Set target coverage for each open day and shift. The layout adapts as shift types change.
                </p>
              </div>
              <span
                className={`scheduler__coverage-state ${coveragePlanComplete ? 'is-complete' : 'is-pending'}`.trim()}
              >
                {coveragePlanComplete ? 'Confirmed' : 'Pending'}
              </span>
            </div>
            <div className="scheduler__coverage-plan-status">
              <div className="scheduler__coverage-plan-meta" aria-label="Coverage target summary">
                <span>{openDays.length} open days</span>
                <span>{shiftTypes.length} shift {shiftTypes.length === 1 ? 'type' : 'types'}</span>
                <span>{totalRequiredSlots} required slots</span>
              </div>
              <p className="scheduler__coverage-plan-note">
                {coveragePlanNote}
              </p>
            </div>
            {openDays.length ? (
              shouldStackCoverageTargets ? (
                <div className="scheduler__requirements-stack" aria-label="Coverage targets stacked layout">
                  {openDays.map((day) => (
                    <article key={day} className="scheduler__requirements-card">
                      <h4>{day}</h4>
                      <div className="scheduler__requirements-card-grid">
                        {shiftTypes.map((shift) => (
                          <label key={`${day}-${shift}`} className="scheduler__requirements-field">
                            <span>{shift}</span>
                            <input
                              type="number"
                              min={0}
                              value={schedule.requirements[day][shift]}
                              onChange={(e) => handleRequirementChange(day, shift, e.target.value)}
                              className="scheduler__requirements-input"
                            />
                          </label>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="scheduler__requirements-table-wrap">
                  <table className="scheduler__requirements-table">
                    <colgroup>
                      <col className="scheduler__requirements-col scheduler__requirements-col--day" />
                      {shiftTypes.map((shift) => (
                        <col key={`${shift}-column`} className="scheduler__requirements-col scheduler__requirements-col--shift" />
                      ))}
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Day</th>
                        {shiftTypes.map((shift) => (
                          <th key={shift}>{shift}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {openDays.map((day) => (
                        <tr key={day}>
                          <td className="scheduler__requirements-day">{day}</td>
                          {shiftTypes.map((shift) => (
                            <td key={shift} data-label={shift}>
                              <input
                                type="number"
                                min={0}
                                value={schedule.requirements[day][shift]}
                                onChange={(e) => handleRequirementChange(day, shift, e.target.value)}
                                className="scheduler__requirements-input"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              <p>No operating days are enabled. Update business hours in Settings to plan coverage.</p>
            )}
            <div className="scheduler__coverage-plan-footer">
              <button
                type="button"
                className="button scheduler__coverage-plan-button"
                disabled={!canConfirmCoverage}
                onClick={() => dispatch({ type: 'CONFIRM_COVERAGE_PLAN' })}
              >
                Confirm coverage plan
              </button>
            </div>
          </div>
        </div>
      </ContentPanel>

      <ContentPanel>
        <div id="scheduler-build-phase" className="scheduler__anchor" />
        <div className="scheduler__section-header">
          <div>
            <span className="scheduler__step-eyebrow">Phase 2</span>
            <h2>Build draft</h2>
            <p>Generate the first-pass schedule only after the week, role, and demand checkpoints are complete.</p>
          </div>
        </div>
        <div className="scheduler__control-grid scheduler__control-grid--build">
          <div className="scheduler__control-card scheduler__control-card--build-main">
            <div className="scheduler__control-card-header">
              <div>
                <h3>Draft generator</h3>
                <p className="scheduler__helper-copy scheduler__helper-copy--compact">
                  {currentRoleDraftExists
                    ? `Use ${buildActionLabel.toLowerCase()} when you want a fresh pass from the confirmed demand plan.`
                    : 'Create the first pass only after the week, role, and demand checkpoints are complete.'}
                </p>
              </div>
              <span className="scheduler__coverage-summary-chip">{hasRoleSelected ? selectedRole : 'Role required'}</span>
            </div>
            <dl className="scheduler__scope-summary" aria-label="Draft generation summary">
              <div className="scheduler__scope-summary-item">
                <dt>Week ready</dt>
                <dd>{hasWeekRange ? 'Selected' : 'Pending'}</dd>
              </div>
              <div className="scheduler__scope-summary-item">
                <dt>Eligible team</dt>
                <dd>{filteredEmployees.length} employees</dd>
              </div>
              <div className="scheduler__scope-summary-item">
                <dt>Current draft</dt>
                <dd>{scheduledTotals} shifts assigned</dd>
              </div>
              <div className="scheduler__scope-summary-item">
                <dt>Demand ready</dt>
                <dd>{coveragePlanComplete ? 'Confirmed' : 'Pending'}</dd>
              </div>
            </dl>
            <div className="scheduler__action-bar">
              <button
                type="button"
                className="button button-outline"
                disabled={!hasRoleSelected}
                onClick={() => dispatch({ type: 'RESET_SCHEDULE_DRAFT' })}
              >
                {resetDraftLabel}
              </button>
              <button
                type="button"
                className="button"
                disabled={!canGenerateDraft}
                onClick={() => dispatch({ type: 'AUTO_BUILD_SCHEDULE' })}
              >
                {buildActionLabel}
              </button>
            </div>
            <div
              className={`scheduler__build-note ${canGenerateDraft ? 'is-ready' : 'is-pending'}`.trim()}
              aria-label="Build draft guidance"
            >
              <span className="scheduler__build-note-icon" aria-hidden="true">
                <i className={`fas ${canGenerateDraft ? 'fa-circle-check' : 'fa-triangle-exclamation'}`} />
              </span>
              <div className="scheduler__build-note-copy">
                <strong>{canGenerateDraft ? 'Ready to generate' : 'Workflow checkpoint pending'}</strong>
                <p>
                  {canGenerateDraft
                    ? `The next draft will be generated for ${selectedRole} across ${schedule.weekLabel}.`
                    : nextGenerationCheckpoint?.pendingCopy}
                </p>
              </div>
            </div>
          </div>
        </div>
      </ContentPanel>

      <ContentPanel>
        <div id="scheduler-resolve-phase" className="scheduler__anchor" />
        <div className="scheduler__section-header">
          <div>
            <span className="scheduler__step-eyebrow">Phase 3</span>
            <h2>Resolve issues</h2>
            <p>{editorViewSummary[editorView]}</p>
          </div>
        </div>
        <div className="scheduler__review-grid">
          <div className="scheduler__control-card">
            <h3>Draft Status</h3>
            <ul className="scheduler__review-list">
              <li className="scheduler__review-list-item">
                <strong>Assigned shifts</strong>
                <span>{scheduledTotals}</span>
              </li>
              <li className="scheduler__review-list-item">
                <strong>Open slots</strong>
                <span>{totalOpenSlots}</span>
              </li>
              <li className="scheduler__review-list-item">
                <strong>Shift-cap alerts</strong>
                <span>{employeeLimitAlerts.length}</span>
              </li>
            </ul>
          </div>
          <div className="scheduler__control-card">
            <h3>Coverage Gaps</h3>
            {openShifts.length ? (
              <ul className="scheduler__review-list">
                {openShifts.map((shift) => (
                  <li key={`${shift.day}-${shift.shift}`} className="scheduler__review-list-item">
                    <strong>{shift.day} {shift.shift}</strong>
                    <span>{shift.open} open</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="scheduler__empty-review">No coverage gaps for the selected role.</p>
            )}
          </div>
          <div className="scheduler__control-card">
            <h3>Schedule Alerts</h3>
            {employeeLimitAlerts.length ? (
              <ul className="scheduler__review-list">
                {employeeLimitAlerts.map((employee) => (
                  <li key={employee.id} className="scheduler__review-list-item">
                    <strong>{employee.name}</strong>
                    <span>{employeeAssignmentTotals[employee.id] ?? 0}/{employee.shiftsPerWeek} assigned</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="scheduler__empty-review">No shift-cap alerts in the current draft.</p>
            )}
          </div>
        </div>
        <div className="scheduler__resolve-editor">
          <div className="scheduler__editor-toolbar">
            <div className="scheduler__view-switcher" role="tablist" aria-label="Weekly editor views">
              {editorViewOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={editorView === option.id}
                  aria-label={option.ariaLabel ?? option.label}
                  className={`scheduler__view-switch ${editorView === option.id ? 'is-active' : ''}`.trim()}
                  onClick={() => setEditorView(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          {openDays.length === 0 ? (
            <p>No operating days are enabled. Update business hours in Settings to build the weekly schedule.</p>
          ) : !hasWeekRange || !hasRoleSelected ? (
            <p>Choose the week and role in Phase 1 before editing the schedule.</p>
          ) : filteredEmployees.length ? (
            renderEditor()
          ) : (
            <p>No active employees are available for the selected role yet. Add or reactivate team members in Team.</p>
          )}
        </div>
      </ContentPanel>

      <ContentPanel>
        <div id="scheduler-publish-phase" className="scheduler__anchor" />
        <div className="scheduler__section-header">
          <div>
            <span className="scheduler__step-eyebrow">Phase 4</span>
            <h2>Publish Schedule</h2>
            <p>Confirm notes and publish once the current draft is ready for the team.</p>
          </div>
        </div>
        <div className="scheduler__review-grid">
          <div className="scheduler__control-card">
            <h3>Publish Readiness</h3>
            <div className={`scheduler__publish-readiness ${canPublish ? 'is-ready' : 'is-blocked'}`.trim()}>
              <strong>{canPublish ? 'Ready to publish active week' : 'Active week needs attention'}</strong>
              <p>{publishSummary}</p>
              {schedule.lastSavedAt && (
                <small>Last saved {formatLastSavedAt(schedule.lastSavedAt)}</small>
              )}
              {hasUnsavedChanges && schedule.lastSavedAt && (
                <small>Unsaved changes since the last draft save.</small>
              )}
              {schedule.lastPublishedAt && (
                <small>Last published {formatLastPublishedAt(schedule.lastPublishedAt)}</small>
              )}
            </div>
          </div>
          <div className="scheduler__control-card">
            <h3>Manager Notes</h3>
            <textarea
              className="scheduler__notes"
              value={schedule.notes}
              onChange={(e) => dispatch({ type: 'UPDATE_SCHEDULE_NOTES', payload: e.target.value })}
              placeholder="Schedule notes"
            />
          </div>
        </div>
        <div className="scheduler__review-actions">
          <button
            type="button"
            className="button button-outline"
            disabled={!canSaveDraft}
            onClick={() => dispatch({ type: 'SAVE_SCHEDULE_DRAFT' })}
          >
            Save draft
          </button>
          <button
            type="button"
            className="button"
            disabled={!canPublish}
            onClick={() => dispatch({ type: 'PUBLISH_SCHEDULE' })}
          >
            Publish
          </button>
        </div>
      </ContentPanel>
    </div>
  );
};