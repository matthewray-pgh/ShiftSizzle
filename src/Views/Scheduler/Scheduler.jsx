import React, { useEffect, useRef, useState } from 'react';

import './Scheduler.scss';

import { ContentPanel } from '../../Components';
import {
  DAYS,
  addWeeks,
  calculateScheduleReview,
  computeDayCards,
  computeWeekGrid,
  getCurrentWeekStartDate,
  getEligibleCandidates,
  getLiveCopyConflicts,
  getOpenDays,
  getPriorScheduledWeekStart,
  getRolesWithSignal,
  getShiftTypes,
  getTeamRoles,
  getWeekChoices,
  getWeekDayDates,
  normalizeOperatingHours,
  useAppState,
} from '../../state/AppState';

const formatTimestamp = (value) => new Date(value).toLocaleString([], {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const WEEK_STATUS_LABEL = { published: 'Published', draft: 'Draft', none: 'Not started' };

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

const OVERVIEW_STATUS_LABEL = {
  full: 'Fully covered',
  partial: 'Short-staffed',
  none: 'No one assigned',
  empty: 'No coverage target',
};

const BLOCKED_LABEL = {
  unavailable: 'Not available',
  'double-booked': 'Already on another shift',
  'at-cap': 'At weekly shift limit',
};

// Read-only week grid (§3). Days across the top; rows are either roles or,
// when a single role is filtered, that role's shift types. Tapping a cell
// hands the day + role (+ shift) back so the Day builder can open on it.
const WeekOverviewGrid = ({ grid, onSelectCell }) => (
  <ContentPanel className="scheduler__overview">
    <div className="scheduler__overview-scroll">
      <table className="scheduler__overview-grid">
        <thead>
          <tr>
            <th scope="col" className="scheduler__overview-rowhead">
              {grid.mode === 'roles' ? 'Role' : 'Shift'}
            </th>
            {grid.days.map((day) => (
              <th key={day} scope="col">{day.slice(0, 3)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((row) => (
            <tr key={row.key}>
              <th scope="row" className="scheduler__overview-rowhead">{row.label}</th>
              {row.cells.map((cell) => (
                <td key={cell.day}>
                  <button
                    type="button"
                    className={`scheduler__overview-cell is-${cell.status} ${cell.needsCoverage ? 'needs-coverage' : ''}`.trim()}
                    onClick={() => onSelectCell(row, cell)}
                    disabled={cell.status === 'empty' && !cell.needsCoverage}
                    aria-label={`${row.label}, ${cell.day}: ${cell.filled} of ${cell.needed} filled — ${cell.needsCoverage ? 'needs coverage after a call-out' : OVERVIEW_STATUS_LABEL[cell.status]}`}
                  >
                    {cell.needsCoverage && <i className="fas fa-fire" aria-hidden="true" />}
                    {cell.status === 'empty' ? (cell.needsCoverage ? '' : '—') : `${cell.filled}/${cell.needed}`}
                  </button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <ul className="scheduler__overview-legend" aria-label="Coverage legend">
      <li><span className="scheduler__overview-swatch is-full" aria-hidden="true" /> Full</li>
      <li><span className="scheduler__overview-swatch is-partial" aria-hidden="true" /> Partial</li>
      <li><span className="scheduler__overview-swatch is-none" aria-hidden="true" /> None</li>
    </ul>
  </ContentPanel>
);

// The list a manager picks a name from to fill a slot. Every eligible
// employee is a tap; blocked ones stay visible with the reason so the
// manager isn't left wondering where someone went.
const CandidatePanel = ({ candidates, onAssign, onClose, slotLabel }) => (
  <div className="scheduler__candidates" aria-label={`Add someone to ${slotLabel}`}>
    <div className="scheduler__candidates-head">
      <span>Add someone</span>
      <button
        type="button"
        className="scheduler__candidates-close"
        onClick={onClose}
        aria-label="Close add panel"
      >
        <i className="fas fa-xmark" aria-hidden="true" />
      </button>
    </div>
    {candidates.length === 0 ? (
      <p className="scheduler__candidates-empty">No one on the team can take this shift.</p>
    ) : (
      <ul className="scheduler__candidate-list">
        {candidates.map(({ employee, blockedReason, eligible, assignedThisWeek, cap }) => (
          <li key={employee.id}>
            <button
              type="button"
              className="scheduler__candidate"
              disabled={!eligible}
              onClick={() => onAssign(employee.id)}
              title={blockedReason ? BLOCKED_LABEL[blockedReason] : `Assign ${employee.name}`}
            >
              <span className="scheduler__candidate-name">{employee.name}</span>
              <span className="scheduler__candidate-meta">
                {eligible ? `${assignedThisWeek}/${cap} shifts` : BLOCKED_LABEL[blockedReason]}
              </span>
            </button>
          </li>
        ))}
      </ul>
    )}
  </div>
);

// Day-first editing surface (§1): a day tab strip, then the shift cards for
// just the selected day, each with its assigned chips and an add
// affordance. Coverage targets are not edited here — they come from the
// Settings template.
const DayBuilder = ({
  openDays,
  weekDayDates,
  selectedDay,
  onSelectDay,
  dayHasGap,
  roleLabel,
  cards,
  addingFor,
  candidates,
  onOpenAdd,
  onCloseAdd,
  onAssign,
  onRemove,
  onAutoFill,
  canAutoFill,
  conflictFor,
  onReplaceConflict,
  onKeepConflict,
  chipMenuFor,
  onOpenChipMenu,
  onCloseChipMenu,
  onMarkCalledOut,
}) => (
  <>
    <div className="scheduler__day-tabs" role="tablist" aria-label="Day">
      {openDays.map((day) => {
        const date = weekDayDates[day];

        return (
          <button
            key={day}
            type="button"
            role="tab"
            aria-selected={selectedDay === day}
            aria-label={date ? `${day} ${date.getDate()}` : day}
            className={`scheduler__day-tab ${selectedDay === day ? 'is-active' : ''}`.trim()}
            onClick={() => onSelectDay(day)}
          >
            <span className="scheduler__day-tab-name">{day.slice(0, 3)}</span>
            {date ? <span className="scheduler__day-tab-date">{date.getDate()}</span> : null}
            {dayHasGap(day) ? (
              <span className="scheduler__day-tab-dot" aria-hidden="true" />
            ) : null}
          </button>
        );
      })}
    </div>

    <ContentPanel className="scheduler__day-panel" aria-label={`Shifts for ${selectedDay}`}>
      <div className="scheduler__day-panel-head">
        <h3>{selectedDay}</h3>
        <button type="button" className="button-outline" disabled={!canAutoFill} onClick={onAutoFill}>
          <i className="fas fa-wand-magic-sparkles" aria-hidden="true" /> Auto-fill
        </button>
      </div>

      {cards.length === 0 ? (
        <p className="scheduler__day-empty">
          {`No ${roleLabel === 'All roles' ? '' : `${roleLabel} `}shifts to staff on ${selectedDay}. `}
          Coverage targets live in Settings › Coverage Targets.
        </p>
      ) : (
        <ul className="scheduler__shift-cards">
          {cards.map((card) => {
            const isAdding = addingFor && addingFor.role === card.role && addingFor.shift === card.shift;
            const needsCoverage = card.calledOut.length > 0;

            return (
              <li
                key={card.key}
                className={`scheduler__shift-card is-${card.status} ${needsCoverage ? 'needs-coverage' : ''}`.trim()}
              >
                <div className="scheduler__shift-card-head">
                  <div className="scheduler__shift-card-title">
                    <strong>{card.role}</strong>
                    <span>{card.label}</span>
                  </div>
                  <span className="scheduler__shift-card-count">{`${card.assigned.length}/${card.needed}`}</span>
                </div>

                {needsCoverage && (
                  <p className="scheduler__callout-notice">
                    <i className="fas fa-fire" aria-hidden="true" />{' '}
                    {card.calledOut.map((entry) => entry.employeeName).join(', ')} called out — needs coverage
                  </p>
                )}

                <div className="scheduler__shift-chips">
                  {card.assigned.length === 0 ? (
                    <span className="scheduler__chip-empty">No one assigned</span>
                  ) : (
                    card.assigned.map((employee) => {
                      const conflict = conflictFor(card.role, employee.id, card.shift);
                      const menuOpen = chipMenuFor
                        && chipMenuFor.role === card.role
                        && chipMenuFor.employeeId === employee.id
                        && chipMenuFor.shift === card.shift;

                      if (conflict) {
                        return (
                          <span
                            key={employee.id}
                            className={`scheduler__chip scheduler__chip--conflict is-${conflict.severity}`}
                          >
                            <span className="scheduler__chip-reason">{conflict.reason}</span>
                            <span className="scheduler__chip-conflict-actions">
                              <button
                                type="button"
                                onClick={() => onReplaceConflict(card.role, employee.id, card.shift)}
                              >
                                Replace
                              </button>
                              {conflict.severity === 'soft' && (
                                <button
                                  type="button"
                                  className="scheduler__chip-keep"
                                  onClick={() => onKeepConflict(card.role, employee.id, card.shift)}
                                >
                                  Keep anyway
                                </button>
                              )}
                            </span>
                          </span>
                        );
                      }

                      return (
                        <span key={employee.id} className="scheduler__chip">
                          {employee.name}
                          <button
                            type="button"
                            className="scheduler__chip-menu-toggle"
                            aria-label={`Actions for ${employee.name} on ${card.role} ${card.label}`}
                            aria-expanded={Boolean(menuOpen)}
                            onClick={() => (menuOpen
                              ? onCloseChipMenu()
                              : onOpenChipMenu(card.role, employee.id, card.shift))}
                          >
                            <i className="fas fa-ellipsis" aria-hidden="true" />
                          </button>
                          {menuOpen && (
                            <span className="scheduler__chip-menu" role="menu">
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => onMarkCalledOut(employee.id, card.role, card.shift)}
                              >
                                Mark called out
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => onRemove(employee.id, card.role, card.shift)}
                              >
                                Remove
                              </button>
                            </span>
                          )}
                        </span>
                      );
                    })
                  )}
                </div>

                {isAdding ? (
                  <CandidatePanel
                    candidates={candidates}
                    onAssign={(employeeId) => onAssign(employeeId, card.role, card.shift)}
                    onClose={onCloseAdd}
                    slotLabel={`${card.role} · ${card.label} · ${selectedDay}`}
                  />
                ) : (
                  <button
                    type="button"
                    className="scheduler__shift-add"
                    onClick={() => onOpenAdd(card.role, card.shift)}
                  >
                    <i className={`fas ${needsCoverage ? 'fa-user-plus' : 'fa-plus'}`} aria-hidden="true" />{' '}
                    {needsCoverage ? 'Find replacement' : 'Add person'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </ContentPanel>
  </>
);

// First run only: no scheduling week configured yet. One calm card —
// pick the week-start weekday, pick the first date — replaces the old
// full-width Week panel and its stacked helper text.
const FirstRunSetup = ({ weekStartsOn, startDate, onSetDay, onSetDate }) => (
  <div className="scheduler__setup">
    <div className="scheduler__setup-head">
      <h2>Build Schedule</h2>
      <p>Two quick choices, then you're building.</p>
    </div>
    <ContentPanel className="scheduler__setup-card">
      <div className="scheduler__setup-step">
        <span className="scheduler__setup-num">1</span>
        <div className="scheduler__setup-step-body">
          <h3>Which day does your week start?</h3>
          <p className="scheduler__helper-copy">Every schedule runs the same seven days — set it once.</p>
          <div className="scheduler__day-choice" role="group" aria-label="Week starts on">
            {DAYS.map((day) => (
              <button
                key={day}
                type="button"
                aria-pressed={weekStartsOn === day}
                className={`scheduler__day-choice-chip ${weekStartsOn === day ? 'is-active' : ''}`.trim()}
                onClick={() => onSetDay(day)}
              >
                {day.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="scheduler__setup-step">
        <span className="scheduler__setup-num">2</span>
        <div className="scheduler__setup-step-body">
          <h3>First week to plan</h3>
          <input
            type="date"
            className="scheduler__date-input"
            value={startDate}
            disabled={!weekStartsOn}
            onChange={onSetDate}
            aria-label="Week start date"
          />
          <p className="scheduler__helper-copy">
            {weekStartsOn ? `Snaps to a ${weekStartsOn}.` : 'Pick a start day first.'}
          </p>
        </div>
      </div>
    </ContentPanel>
    <p className="scheduler__setup-foot">
      After this, Build Schedule opens straight onto the current week.
    </p>
  </div>
);

// The "Jump to a week" sheet, opened from the action-bar week label —
// replaces the old always-present Week panel.
const WeekSheet = ({ choices, startDate, onPick, onSetDate, onClose }) => (
  <div className="scheduler__modal-overlay" role="dialog" aria-modal="true" aria-label="Jump to a week">
    <div className="scheduler__modal scheduler__week-sheet">
      <div className="scheduler__week-sheet-head">
        <h2>Jump to a week</h2>
        <button type="button" className="scheduler__icon-btn" aria-label="Close" onClick={onClose}>
          <i className="fas fa-xmark" aria-hidden="true" />
        </button>
      </div>
      <ul className="scheduler__week-list">
        {choices.map((choice) => (
          <li key={choice.startDate}>
            <button
              type="button"
              className={`scheduler__week-choice ${choice.startDate === startDate ? 'is-active' : ''}`.trim()}
              onClick={() => onPick(choice.startDate)}
            >
              <span className="scheduler__week-choice-main">
                <strong>{choice.label}</strong>
                {choice.relative ? <span>{choice.relative}</span> : null}
              </span>
              <span className={`scheduler__week-choice-status is-${choice.status}`}>
                {WEEK_STATUS_LABEL[choice.status]}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="scheduler__week-sheet-foot">
        <span className="scheduler__label">Pick another date</span>
        <input
          type="date"
          className="scheduler__date-input"
          value={startDate}
          onChange={onSetDate}
          aria-label="Week start date"
        />
      </div>
    </div>
  </div>
);

const pickInitialDay = (openDays) => {
  if (!openDays.length) {
    return null;
  }

  const today = DAYS[new Date().getDay()];

  return openDays.includes(today) ? today : openDays[0];
};

export const Scheduler = () => {
  const appState = useAppState();
  const { state, dispatch, syncStatus } = appState;
  const { employees, schedule, settings } = state;

  const [activeRoleFilter, setActiveRoleFilter] = useState('All');
  const [pendingReset, setPendingReset] = useState(false);
  const [viewMode, setViewMode] = useState('builder');
  const [selectedDay, setSelectedDay] = useState(null);
  const [addingFor, setAddingFor] = useState(null);
  const [pendingFocus, setPendingFocus] = useState(null);
  const [dismissedCopyPrompt, setDismissedCopyPrompt] = useState(false);
  const [chipMenuFor, setChipMenuFor] = useState(null);
  const [publishSheet, setPublishSheet] = useState(null);
  const [undo, setUndo] = useState(null);
  const [weekSheetOpen, setWeekSheetOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const undoTimerRef = useRef(null);

  useEffect(() => () => window.clearTimeout(undoTimerRef.current), []);

  // On phones the builder paints the app background to match the header, so
  // the white panels float on it — same treatment as the Dashboard.
  useEffect(() => {
    document.body.classList.add('scheduler-view');
    return () => document.body.classList.remove('scheduler-view');
  }, []);

  const openDays = getOpenDays(settings);
  const shiftTypes = getShiftTypes(settings);
  const teamRoles = getTeamRoles(settings, employees);
  const operatingHours = normalizeOperatingHours(settings.operatingHours);
  const configuredWeekStart = settings.weekStartsOn;
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
    const linkedDay = queryParams.get('day');

    if (!linkedWeekStart && !linkedRole && !linkedDay) {
      return;
    }

    if (linkedWeekStart && linkedWeekStart !== schedule.startDate) {
      selectWeek(linkedWeekStart);
    }

    if (linkedRole && teamRoles.includes(linkedRole)) {
      setActiveRoleFilter(linkedRole);
    }

    if (linkedDay && DAYS.includes(linkedDay)) {
      setSelectedDay(linkedDay);
    }

    queryParams.delete('weekStart');
    queryParams.delete('role');
    queryParams.delete('day');
    const nextSearch = queryParams.toString();

    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the selected day pointed at an actual operating day.
  useEffect(() => {
    if (openDays.length && (!selectedDay || !openDays.includes(selectedDay))) {
      setSelectedDay(pickInitialDay(openDays));
    }
  }, [openDays, selectedDay]);

  // The "Copy last week / Start fresh" choice is per week.
  useEffect(() => {
    setDismissedCopyPrompt(false);
    setWeekSheetOpen(false);
    setOverflowOpen(false);
  }, [schedule.startDate]);

  // Consume a Week overview cell tap: jump to that day and, when the cell
  // had a gap, open the candidate panel straight on the shift being fixed.
  useEffect(() => {
    if (viewMode !== 'builder' || !pendingFocus) {
      return;
    }

    if (openDays.includes(pendingFocus.day)) {
      setSelectedDay(pendingFocus.day);
    }

    if (pendingFocus.needsFix && pendingFocus.role && pendingFocus.shift) {
      setAddingFor({ role: pendingFocus.role, shift: pendingFocus.shift });
    }

    setPendingFocus(null);
  }, [viewMode, pendingFocus, openDays]);

  const handleSetWeekStartDay = (day) => {
    dispatch({ type: 'UPDATE_SETTINGS', payload: { weekStartsOn: day } });

    const current = getCurrentWeekStartDate(day);

    if (current) {
      dispatch({ type: 'SELECT_WEEK', payload: { startDate: current } });
    }
  };

  const handleWeekStartDate = (e) => {
    const nextWeekStart = e.target.value;

    if (nextWeekStart && nextWeekStart !== schedule.startDate) {
      selectWeek(nextWeekStart);
    }

    setWeekSheetOpen(false);
  };

  const stepWeek = (direction) => {
    const next = addWeeks(schedule.startDate, direction);

    if (next) {
      selectWeek(next);
    }
  };

  const handleResetWeek = () => {
    dispatch({ type: 'RESET_WEEK_DRAFT' });
    setPendingReset(false);
  };

  const handleSelectRole = (role) => {
    setActiveRoleFilter(role);
    setAddingFor(null);
    setChipMenuFor(null);
  };

  const handleSelectDay = (day) => {
    setSelectedDay(day);
    setAddingFor(null);
    setChipMenuFor(null);
  };

  const handleAssign = (employeeId, role, shift) => {
    dispatch({ type: 'TOGGLE_ASSIGNMENT', payload: { employeeId, role, day: selectedDay, shift } });
    dispatch({ type: 'RESOLVE_CALL_OUT', payload: { role, day: selectedDay, shift, coveredBy: employeeId } });
  };

  const handleRemoveAssignment = (employeeId, role, shift) => {
    dispatch({ type: 'TOGGLE_ASSIGNMENT', payload: { employeeId, role, day: selectedDay, shift } });
    setChipMenuFor(null);
  };

  const handleMarkCalledOut = (employeeId, role, shift) => {
    dispatch({ type: 'MARK_CALLED_OUT', payload: { employeeId, role, day: selectedDay, shift } });
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
  const hasUnsavedChanges = Boolean(schedule.hasUnsavedChanges);

  // Passive sync state (§5) — informational, never a control.
  const syncLine = syncStatus === 'offline'
    ? 'Saved locally · will sync'
    : syncStatus === 'error'
      ? 'Save failed — retrying'
      : (syncStatus === 'saving' || hasUnsavedChanges)
        ? 'Saving…'
        : schedule.lastSavedAt
          ? 'Saved'
          : 'Not saved yet';

  const filterRole = activeRoleFilter === 'All' ? null : activeRoleFilter;
  const rolesToShow = filterRole ? [filterRole] : teamRoles;

  const filterGrid = hasWeekRange && openDays.length
    ? computeWeekGrid({
        schedule, employees, settings, teamRoles, role: filterRole,
        callOuts: state.callOuts ?? [], weekStartDate: schedule.startDate,
      })
    : null;

  const dayHasGap = (day) => Boolean(filterGrid?.rows.some((row) => {
    const cell = row.cells.find((entry) => entry.day === day);

    return cell && (cell.status === 'partial' || cell.status === 'none' || cell.needsCoverage);
  }));

  const weekDayDates = getWeekDayDates(schedule.startDate, configuredWeekStart);
  const callOuts = state.callOuts ?? [];

  const dayCards = selectedDay
    ? computeDayCards({
        schedule, employees, settings, teamRoles, role: filterRole, day: selectedDay,
        callOuts, weekStartDate: schedule.startDate,
      })
    : [];

  const candidates = addingFor && selectedDay
    ? getEligibleCandidates({
        schedule,
        employees,
        settings,
        role: addingFor.role,
        day: selectedDay,
        shift: addingFor.shift,
      })
    : [];

  const handleAutoFillVisible = () => {
    rolesToShow.forEach((role) => dispatch({ type: 'AUTO_BUILD_SCHEDULE', payload: { role } }));
  };

  // ---- Copy last week (§7) ----
  const priorWeekStart = getPriorScheduledWeekStart(state.schedules, schedule.startDate);
  const liveConflicts = getLiveCopyConflicts(schedule);
  const weekHasRecords = state.schedules.some((entry) => entry.startDate === schedule.startDate);
  const weekHasAssignments = teamRoles.some((role) =>
    Object.values(schedule.assignments[role] ?? {}).some((byDay) =>
      Object.values(byDay ?? {}).some((shifts) => (shifts ?? []).length > 0)));
  const showCopyPrompt = hasWeekRange
    && Boolean(priorWeekStart)
    && !weekHasRecords
    && !weekHasAssignments
    && !schedule.copiedFrom
    && !hasUnsavedChanges
    && !dismissedCopyPrompt;

  const conflictFor = (role, employeeId, shift) =>
    liveConflicts.find((conflict) =>
      conflict.role === role
      && conflict.employeeId === employeeId
      && conflict.shift === shift
      && conflict.day === selectedDay) ?? null;

  const handleReplaceConflict = (role, employeeId, shift) => {
    dispatch({ type: 'TOGGLE_ASSIGNMENT', payload: { employeeId, role, day: selectedDay, shift } });
    setAddingFor({ role, shift });
  };

  const handleKeepConflict = (role, employeeId, shift) => {
    dispatch({ type: 'RESOLVE_COPY_CONFLICT', payload: { role, employeeId, day: selectedDay, shift } });
  };

  const handleSelectCell = (row, cell) => {
    if (row.role) {
      setActiveRoleFilter(row.role);
    }

    setPendingFocus({ day: cell.day, role: row.role, shift: row.shift, needsFix: cell.status !== 'full' });
    setViewMode('builder');
  };

  const runPublish = (roles) => {
    const preRecords = state.schedules.filter((entry) => entry.startDate === schedule.startDate);

    dispatch({ type: 'PUBLISH_SCHEDULE', payload: { roles } });
    setPublishSheet(null);
    setUndo({ startDate: schedule.startDate, records: preRecords });
    window.clearTimeout(undoTimerRef.current);
    undoTimerRef.current = window.setTimeout(() => setUndo(null), 6000);
  };

  const handlePublishClick = () => {
    const filterActive = activeRoleFilter !== 'All';
    const needsSheet = totals.open > 0 || filterActive;

    if (!needsSheet) {
      runPublish(rolesWithSignal);
      return;
    }

    const selections = Object.fromEntries(rolesWithSignal.map((role) => [
      role,
      filterActive
        ? role === activeRoleFilter
        : roleStats[role].metrics.openSlots === 0,
    ]));

    setPublishSheet(selections);
  };

  const handleUndoPublish = () => {
    if (undo) {
      dispatch({ type: 'UNDO_PUBLISH', payload: undo });
    }

    window.clearTimeout(undoTimerRef.current);
    setUndo(null);
  };

  // --- first run: no scheduling week configured yet ---
  if (!hasWeekSettings || !hasWeekRange) {
    return (
      <div className="scheduler scheduler--setup">
        <FirstRunSetup
          weekStartsOn={configuredWeekStart}
          startDate={schedule.startDate}
          onSetDay={handleSetWeekStartDay}
          onSetDate={handleWeekStartDate}
        />
      </div>
    );
  }

  const statusLabel = schedule.status === 'published' ? 'Published' : 'Draft';
  const filledSummary = demandSet
    ? `${totals.required - totals.open} / ${totals.required} filled`
    : 'No coverage targets';

  return (
    <div className="scheduler">
      <header className="scheduler__bar">
        <div className="scheduler__bar-row">
          <button
            type="button"
            className="scheduler__icon-btn"
            aria-label="Previous week"
            onClick={() => stepWeek(-1)}
          >
            <i className="fas fa-chevron-left" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="scheduler__week-label"
            aria-label={`Change week — ${schedule.weekLabel}`}
            onClick={() => setWeekSheetOpen(true)}
          >
            <i className="fas fa-calendar" aria-hidden="true" />
            {schedule.weekLabel}
          </button>
          <button
            type="button"
            className="scheduler__icon-btn"
            aria-label="Next week"
            onClick={() => stepWeek(1)}
          >
            <i className="fas fa-chevron-right" aria-hidden="true" />
          </button>
          <div className="scheduler__overflow">
            <button
              type="button"
              className="scheduler__icon-btn"
              aria-label="More actions"
              aria-expanded={overflowOpen}
              onClick={() => setOverflowOpen((open) => !open)}
            >
              <i className="fas fa-ellipsis" aria-hidden="true" />
            </button>
            {overflowOpen && (
              <div className="scheduler__overflow-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => { setNotesOpen(true); setOverflowOpen(false); }}>
                  Manager notes
                </button>
                <button type="button" role="menuitem" onClick={() => { setPendingReset(true); setOverflowOpen(false); }}>
                  Reset week
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="scheduler__bar-row scheduler__bar-row--status">
          <span className={`scheduler__status-pill is-${schedule.status}`}>
            <span className="scheduler__status-dot" aria-hidden="true" />
            {statusLabel.toUpperCase()}
          </span>
          <span className="scheduler__bar-meta" role="status">{filledSummary}&nbsp;·&nbsp;{syncLine}</span>
          <span className="scheduler__bar-spacer" />
          <button
            type="button"
            className="button"
            disabled={rolesWithSignal.length === 0}
            onClick={handlePublishClick}
            title={rolesWithSignal.length === 0 ? 'Nothing to publish yet' : 'Publish this week'}
          >
            Publish week
          </button>
        </div>
      </header>

      {showCopyPrompt ? (
        <div className="scheduler__copy-takeover">
          <div className="scheduler__copy-takeover-inner">
            <i className="fas fa-calendar-plus" aria-hidden="true" />
            <h2>Start {schedule.weekLabel}</h2>
            <p>
              Bring last week's assignments over — anything that no longer works gets flagged for you
              to fix — or begin from an empty week.
            </p>
            <button type="button" className="button" onClick={() => dispatch({ type: 'COPY_LAST_WEEK' })}>
              Copy last week
            </button>
            <button type="button" className="button-outline" onClick={() => setDismissedCopyPrompt(true)}>
              Start fresh
            </button>
          </div>
        </div>
      ) : (
        <>
          {schedule.copiedFrom && (
            <div
              className={`scheduler__copied-banner ${liveConflicts.length > 0 ? 'has-conflicts' : ''}`.trim()}
              role="status"
            >
              {liveConflicts.length === 0
                ? 'Copied from last week'
                : `Copied last week · ${liveConflicts.length} ${liveConflicts.length === 1 ? 'conflict' : 'conflicts'} to review`}
            </div>
          )}

          <div className="scheduler__controls">
            <div className="scheduler__role-tabs" role="tablist" aria-label="Role filter">
              <RoleTab
                label="All roles"
                active={activeRoleFilter === 'All'}
                onClick={() => handleSelectRole('All')}
                badge={totals.open > 0 ? totals.open : null}
              />
              {teamRoles.map((role) => (
                <RoleTab
                  key={role}
                  label={role}
                  active={activeRoleFilter === role}
                  onClick={() => handleSelectRole(role)}
                  badge={roleStats[role].metrics.openSlots > 0 ? roleStats[role].metrics.openSlots : null}
                />
              ))}
            </div>

            <div className="scheduler__view-toggle" role="tablist" aria-label="Scheduler view">
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'builder'}
                className={`scheduler__view-toggle-button ${viewMode === 'builder' ? 'is-active' : ''}`.trim()}
                onClick={() => setViewMode('builder')}
              >
                Day builder
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'overview'}
                className={`scheduler__view-toggle-button ${viewMode === 'overview' ? 'is-active' : ''}`.trim()}
                onClick={() => setViewMode('overview')}
              >
                Week overview
              </button>
            </div>
          </div>

          {openDays.length === 0 ? (
            <ContentPanel className="scheduler__setup-hint">
              <p>
                <strong>No operating days yet.</strong> Set your business hours in Settings › Business
                Hours to plan coverage for this week.
              </p>
            </ContentPanel>
          ) : viewMode === 'overview' ? (
            <WeekOverviewGrid grid={filterGrid} onSelectCell={handleSelectCell} />
          ) : (
            <DayBuilder
              openDays={openDays}
              weekDayDates={weekDayDates}
              selectedDay={selectedDay}
              onSelectDay={handleSelectDay}
              dayHasGap={dayHasGap}
              roleLabel={activeRoleFilter === 'All' ? 'All roles' : activeRoleFilter}
              cards={dayCards}
              addingFor={addingFor}
              candidates={candidates}
              onOpenAdd={(role, shift) => setAddingFor({ role, shift })}
              onCloseAdd={() => setAddingFor(null)}
              onAssign={handleAssign}
              onRemove={handleRemoveAssignment}
              onAutoFill={handleAutoFillVisible}
              canAutoFill={demandSet && employees.length > 0}
              conflictFor={conflictFor}
              onReplaceConflict={handleReplaceConflict}
              onKeepConflict={handleKeepConflict}
              chipMenuFor={chipMenuFor}
              onOpenChipMenu={(role, employeeId, shift) => setChipMenuFor({ role, employeeId, shift })}
              onCloseChipMenu={() => setChipMenuFor(null)}
              onMarkCalledOut={(employeeId, role, shift) => {
                handleMarkCalledOut(employeeId, role, shift);
                setChipMenuFor(null);
              }}
            />
          )}
        </>
      )}

      {weekSheetOpen && (
        <WeekSheet
          choices={getWeekChoices(state)}
          startDate={schedule.startDate}
          onPick={(next) => { selectWeek(next); setWeekSheetOpen(false); }}
          onSetDate={handleWeekStartDate}
          onClose={() => setWeekSheetOpen(false)}
        />
      )}

      {notesOpen && (
        <div className="scheduler__modal-overlay" role="dialog" aria-modal="true" aria-labelledby="notes-modal-title">
          <div className="scheduler__modal">
            <div className="scheduler__week-sheet-head">
              <h2 id="notes-modal-title">Manager notes</h2>
              <button type="button" className="scheduler__icon-btn" aria-label="Close" onClick={() => setNotesOpen(false)}>
                <i className="fas fa-xmark" aria-hidden="true" />
              </button>
            </div>
            <label htmlFor="scheduler-notes" className="scheduler__visually-hidden">Manager notes</label>
            <textarea
              id="scheduler-notes"
              className="scheduler__notes"
              value={schedule.notes}
              onChange={(e) => dispatch({ type: 'UPDATE_SCHEDULE_NOTES', payload: e.target.value })}
              placeholder="Notes for this week's schedule"
            />
            <div className="scheduler__publish-meta">
              {schedule.lastSavedAt && <small>Last saved {formatTimestamp(schedule.lastSavedAt)}</small>}
              {schedule.lastPublishedAt && <small>Last published {formatTimestamp(schedule.lastPublishedAt)}</small>}
            </div>
          </div>
        </div>
      )}

      {pendingReset && (
        <div className="scheduler__modal-overlay" role="dialog" aria-modal="true" aria-labelledby="reset-week-modal-title">
          <div className="scheduler__modal">
            <h2 id="reset-week-modal-title">Reset this week?</h2>
            <p>
              Clears assignments and notes for every role in {schedule.weekLabel || 'this week'}.
              Coverage targets and saved or published schedules aren't affected.
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

      {publishSheet && (
        <div className="scheduler__modal-overlay" role="dialog" aria-modal="true" aria-labelledby="publish-sheet-title">
          <div className="scheduler__modal scheduler__publish-sheet">
            <h2 id="publish-sheet-title">Publish this week?</h2>
            <p>
              {`${totals.required - totals.open} of ${totals.required} shifts filled. `}
              {totals.open === 0
                ? 'Every shift has someone assigned.'
                : `${totals.open} ${totals.open === 1 ? "shift won't" : "shifts won't"} have anyone assigned if published now.`}
            </p>
            <ul className="scheduler__publish-roles">
              {rolesWithSignal.map((role) => {
                const open = roleStats[role].metrics.openSlots;

                return (
                  <li key={role}>
                    <label className="scheduler__publish-role">
                      <input
                        type="checkbox"
                        checked={Boolean(publishSheet[role])}
                        onChange={(e) => setPublishSheet((prev) => ({ ...prev, [role]: e.target.checked }))}
                      />
                      <span className="scheduler__publish-role-name">{role}</span>
                      <span className={`scheduler__publish-role-status ${open === 0 ? 'is-complete' : ''}`.trim()}>
                        {open === 0 ? 'Complete' : `${open} open`}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className="scheduler__modal-actions">
              <button type="button" className="button-outline" onClick={() => setPublishSheet(null)}>
                Go back and fix
              </button>
              <button
                type="button"
                className="button"
                disabled={!Object.values(publishSheet).some(Boolean)}
                onClick={() => runPublish(rolesWithSignal.filter((role) => publishSheet[role]))}
              >
                Publish selected
              </button>
            </div>
          </div>
        </div>
      )}

      {undo && (
        <div className="scheduler__toast" role="status">
          <span>Published</span>
          <button type="button" className="scheduler__toast-undo" onClick={handleUndoPublish}>
            Undo
          </button>
        </div>
      )}
    </div>
  );
};
