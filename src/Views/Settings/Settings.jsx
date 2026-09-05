import { useEffect, useMemo, useState } from 'react';

import {
  Button,
  InputField,
} from '../../Components';
import { DAYS, formatShiftLabel, useAppState } from '../../state/AppState';

const emptyCoverageRow = (shiftTypes) => Object.fromEntries(shiftTypes.map((shift) => [shift, 0]));

import './Settings.scss';

export const Settings = () => {
  const { state, dispatch } = useAppState();
  const [form, setForm] = useState(state.settings);
  const [justSaved, setJustSaved] = useState(false);
  const [newShiftType, setNewShiftType] = useState('');
  const [newTeamRole, setNewTeamRole] = useState('');
  const [coverageRole, setCoverageRole] = useState(state.settings.teamRoles?.[0] ?? '');
  const derivedWeekEnd = form.weekStartsOn ? DAYS[(DAYS.indexOf(form.weekStartsOn) + 6) % DAYS.length] : '';
  const activeCoverageRole = form.teamRoles.includes(coverageRole) ? coverageRole : (form.teamRoles[0] ?? '');
  const coverageRow = (day) => form.roleCoverage?.[activeCoverageRole]?.[day] ?? emptyCoverageRow(form.shiftTypes);

  // A role can't be removed while an employee still holds it or a saved
  // schedule was built for it.
  const rolesInUse = useMemo(() => {
    const used = new Set();
    state.employees.forEach((employee) => (employee.roles ?? []).forEach((role) => used.add(role)));
    state.schedules.forEach((entry) => entry.role && used.add(entry.role));
    return used;
  }, [state.employees, state.schedules]);

  useEffect(() => {
    setForm(state.settings);
    setNewShiftType('');
    setNewTeamRole('');
  }, [state.settings]);

  // On phones, paint the app background to match the header so the settings
  // panel floats on it — same treatment as the Dashboard.
  useEffect(() => {
    document.body.classList.add('settings-view');
    return () => document.body.classList.remove('settings-view');
  }, []);

  const workspaceDirty = [
    'businessName',
    'locationName',
    'schedulerName',
  ].some((field) => form[field] !== state.settings[field]);
  const shiftsDirty = JSON.stringify(form.shiftTypes) !== JSON.stringify(state.settings.shiftTypes)
    || JSON.stringify(form.shiftTimes ?? {}) !== JSON.stringify(state.settings.shiftTimes ?? {});
  const rolesDirty = JSON.stringify(form.teamRoles) !== JSON.stringify(state.settings.teamRoles);
  const coverageDirty = JSON.stringify(form.roleCoverage ?? {}) !== JSON.stringify(state.settings.roleCoverage ?? {});
  const schedulingDirty = form.weekStartsOn !== state.settings.weekStartsOn;
  const hoursDirty = JSON.stringify(form.operatingHours) !== JSON.stringify(state.settings.operatingHours);
  const isDirty = workspaceDirty || shiftsDirty || rolesDirty || coverageDirty || schedulingDirty || hoursDirty;
  const canSave = isDirty && !(schedulingDirty && !form.weekStartsOn);

  const updateForm = (field, value) => {
    setJustSaved(false);
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  };

  const addShiftType = () => {
    const nextShiftType = newShiftType.trim();

    if (!nextShiftType || form.shiftTypes.includes(nextShiftType)) {
      return;
    }

    setJustSaved(false);
    setForm((currentForm) => ({
      ...currentForm,
      shiftTypes: [...currentForm.shiftTypes, nextShiftType],
      shiftTimes: { ...(currentForm.shiftTimes ?? {}), [nextShiftType]: { startTime: '', endTime: '' } },
    }));
    setNewShiftType('');
  };

  const removeShiftType = (shiftTypeToRemove) => {
    if (form.shiftTypes.length <= 1) {
      return;
    }

    setJustSaved(false);
    setForm((currentForm) => {
      const { [shiftTypeToRemove]: _removed, ...remainingTimes } = currentForm.shiftTimes ?? {};

      return {
        ...currentForm,
        shiftTypes: currentForm.shiftTypes.filter((shiftType) => shiftType !== shiftTypeToRemove),
        shiftTimes: remainingTimes,
      };
    });
  };

  // Optional per-label time range — an empty field just means "no time set".
  const updateShiftTime = (label, field, value) => {
    setJustSaved(false);
    setForm((currentForm) => ({
      ...currentForm,
      shiftTimes: {
        ...(currentForm.shiftTimes ?? {}),
        [label]: {
          startTime: '',
          endTime: '',
          ...(currentForm.shiftTimes?.[label] ?? {}),
          [field]: value,
        },
      },
    }));
  };

  const addTeamRole = () => {
    const nextTeamRole = newTeamRole.trim();

    if (!nextTeamRole || form.teamRoles.includes(nextTeamRole)) {
      return;
    }

    updateForm('teamRoles', [...form.teamRoles, nextTeamRole]);
    setNewTeamRole('');
  };

  const removeTeamRole = (roleToRemove) => {
    if (form.teamRoles.length <= 1 || rolesInUse.has(roleToRemove)) {
      return;
    }

    updateForm('teamRoles', form.teamRoles.filter((role) => role !== roleToRemove));
  };

  const setCoverageGrid = (role, nextGrid) => {
    updateForm('roleCoverage', {
      ...(form.roleCoverage ?? {}),
      [role]: nextGrid,
    });
  };

  const updateCoverage = (role, day, shift, rawValue) => {
    const value = Math.max(0, parseInt(rawValue, 10) || 0);
    const currentGrid = form.roleCoverage?.[role] ?? {};

    setCoverageGrid(role, {
      ...currentGrid,
      [day]: { ...emptyCoverageRow(form.shiftTypes), ...(currentGrid[day] ?? {}), [shift]: value },
    });
  };

  const applyCoverageToAllDays = (role, sourceDay) => {
    const sourceRow = { ...emptyCoverageRow(form.shiftTypes), ...(form.roleCoverage?.[role]?.[sourceDay] ?? {}) };

    setCoverageGrid(role, Object.fromEntries(DAYS.map((day) => [day, { ...sourceRow }])));
  };

  const updateOperatingHours = (day, field, value) => {
    updateForm('operatingHours', {
      ...form.operatingHours,
      [day]: {
        ...form.operatingHours[day],
        [field]: value,
      },
    });
  };

  const toggleOperatingDay = (day) => {
    updateOperatingHours(day, 'isOpen', !form.operatingHours[day].isOpen);
  };

  const handleSaveAll = (event) => {
    event.preventDefault();

    if (!canSave) {
      return;
    }

    dispatch({ type: 'UPDATE_SETTINGS', payload: form });
    setJustSaved(true);
  };

  const handleDiscardAll = () => {
    setForm(state.settings);
    setJustSaved(false);
  };

  return (
    <div className="settings">
      <div className="settings__page-header">
        <div className="settings__page-copy">
          <h2>Workspace settings</h2>
          <p>Defaults for staffing, roles, and hours.</p>
        </div>
      </div>
      <form className="settings__form" aria-label="Workspace settings" onSubmit={handleSaveAll}>
        <div className="settings__group" aria-label="Workspace details settings">
          <div className="settings__group-copy">
              <div className="settings__group-heading">
                <h3>Workspace Details</h3>
                {workspaceDirty && <span className="settings__dirty-indicator">Unsaved changes</span>}
              </div>
            <p>Names shown across the app.</p>
          </div>
          <div className="settings__group-body">
            <InputField label="Organization Name" name="businessName" value={form.businessName} onChange={(value) => updateForm('businessName', value)} />
            <InputField label="Location Name" name="locationName" value={form.locationName} onChange={(value) => updateForm('locationName', value)} />
            <InputField label="Scheduler Name" name="schedulerName" value={form.schedulerName} onChange={(value) => updateForm('schedulerName', value)} />
          </div>
        </div>

        <div className="settings__group" aria-label="Shift type settings">
          <div className="settings__group-copy">
            <div className="settings__group-heading">
              <h3>Shift Types</h3>
              {shiftsDirty && <span className="settings__dirty-indicator">Unsaved changes</span>}
            </div>
            <p>Used across scheduling and availability. Times are optional.</p>
          </div>
          <div className="settings__group-body">
            <div className="settings__shift-list">
              {form.shiftTypes.map((shiftType) => {
                const times = form.shiftTimes?.[shiftType] ?? { startTime: '', endTime: '' };

                return (
                  <div key={shiftType} className="settings__shift-row">
                    <div className="settings__shift-row-head">
                      <strong>{shiftType}</strong>
                      <button
                        type="button"
                        className="settings__shift-remove"
                        onClick={() => removeShiftType(shiftType)}
                        disabled={form.shiftTypes.length <= 1}
                        aria-label={`Remove ${shiftType} shift type`}
                      >
                        <i className="fas fa-xmark" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="settings__shift-row-times">
                      <div className="settings__shift-time">
                        <label htmlFor={`${shiftType}-shift-start`} className="settings__hours-label">Start</label>
                        <input
                          id={`${shiftType}-shift-start`}
                          type="time"
                          min="00:00"
                          max="23:59"
                          className="settings__hours-input"
                          value={times.startTime ?? ''}
                          onChange={(event) => updateShiftTime(shiftType, 'startTime', event.target.value)}
                        />
                      </div>
                      <div className="settings__shift-time">
                        <label htmlFor={`${shiftType}-shift-end`} className="settings__hours-label">End</label>
                        <input
                          id={`${shiftType}-shift-end`}
                          type="time"
                          min="00:00"
                          max="23:59"
                          className="settings__hours-input"
                          value={times.endTime ?? ''}
                          onChange={(event) => updateShiftTime(shiftType, 'endTime', event.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="settings__inline-form">
              <InputField label="Add Shift Type" name="newShiftType" value={newShiftType} onChange={setNewShiftType} placeholder="Ex. Prep" />
              <Button type="button" className="settings__inline-button button-outline" onClick={addShiftType}>
                <span className="settings__action-icon" aria-hidden="true">
                  <i className="fas fa-plus" />
                </span>
                Add Shift
              </Button>
            </div>
          </div>
        </div>

        <div className="settings__group" aria-label="Team role settings">
          <div className="settings__group-copy">
            <div className="settings__group-heading">
              <h3>Team Roles</h3>
              {rolesDirty && <span className="settings__dirty-indicator">Unsaved changes</span>}
            </div>
            <p>Roles used for scheduling and coverage. Remove any you don't use.</p>
          </div>
          <div className="settings__group-body">
            <div className="settings__token-row settings__token-row--stacked">
              {form.teamRoles.map((role) => {
                const locked = form.teamRoles.length <= 1 || rolesInUse.has(role);

                return (
                  <span key={role} className={`settings__token ${locked ? 'settings__token--base' : ''}`.trim()}>
                    <span>{role}</span>
                    <button
                      type="button"
                      onClick={() => removeTeamRole(role)}
                      disabled={locked}
                      title={rolesInUse.has(role) ? 'In use by the roster or a saved schedule' : undefined}
                      aria-label={`Remove ${role} team role`}
                    >
                      <i className="fas fa-xmark" aria-hidden="true" />
                    </button>
                  </span>
                );
              })}
            </div>
            <div className="settings__inline-form">
              <InputField label="Add Role" name="newTeamRole" value={newTeamRole} onChange={setNewTeamRole} placeholder="Ex. Dishwasher" />
              <Button type="button" className="settings__inline-button button-outline" onClick={addTeamRole}>
                <span className="settings__action-icon" aria-hidden="true">
                  <i className="fas fa-plus" />
                </span>
                Add Role
              </Button>
            </div>
          </div>
        </div>

        <div className="settings__group settings__group--wide" aria-label="Coverage target settings">
          <div className="settings__group-copy">
            <div className="settings__group-heading">
              <h3>Coverage Targets</h3>
              {coverageDirty && <span className="settings__dirty-indicator">Unsaved changes</span>}
            </div>
            <p>How many of each role each shift needs. Set once here — schedules start from this, so weekly work is just assigning people.</p>
          </div>
          <div className="settings__group-body">
            <label className="settings__field-label" htmlFor="coverage-role">Role</label>
            <select
              id="coverage-role"
              className="settings__select"
              value={activeCoverageRole}
              onChange={(event) => setCoverageRole(event.target.value)}
            >
              {form.teamRoles.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>

            <div className="settings__coverage-grid" aria-label={`Coverage targets for ${activeCoverageRole}`}>
              {DAYS.map((day) => {
                const isClosed = !form.operatingHours?.[day]?.isOpen;

                return (
                  <div key={day} className={`settings__coverage-row ${isClosed ? 'is-closed' : ''}`.trim()}>
                    <div className="settings__coverage-row-head">
                      <strong>{day}{isClosed ? <span className="settings__coverage-closed"> · closed</span> : null}</strong>
                      <button
                        type="button"
                        className="settings__inline-link"
                        onClick={() => applyCoverageToAllDays(activeCoverageRole, day)}
                      >
                        Apply to all days
                      </button>
                    </div>
                    <div className="settings__coverage-fields">
                      {form.shiftTypes.map((shift) => (
                        <label key={shift} className="settings__coverage-field">
                          <span>{formatShiftLabel(form, shift)}</span>
                          <input
                            type="number"
                            min={0}
                            className="settings__coverage-input"
                            value={coverageRow(day)[shift] ?? 0}
                            onChange={(event) => updateCoverage(activeCoverageRole, day, shift, event.target.value)}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="settings__group" aria-label="Scheduling week settings">
          <div className="settings__group-copy">
            <div className="settings__group-heading">
              <h3>Scheduling Week</h3>
              {schedulingDirty && <span className="settings__dirty-indicator">Unsaved changes</span>}
            </div>
            <p>The day your scheduling week starts.</p>
          </div>
          <div className="settings__group-body">
            <label className="settings__field-label" htmlFor="week-starts-on">Week Starts On</label>
            <select
              id="week-starts-on"
              className="settings__select"
              value={form.weekStartsOn ?? ''}
              onChange={(event) => updateForm('weekStartsOn', event.target.value)}
            >
              <option value="">Select week start</option>
              {DAYS.map((day) => (
                <option key={day} value={day}>{day}</option>
              ))}
            </select>
            {schedulingDirty && !form.weekStartsOn && (
              <p className="settings__field-warning">Select a day to save this change.</p>
            )}
            <div className="settings__week-preview" aria-label="Scheduling week preview">
              <div className="settings__week-preview-item">
                <span>Week start</span>
                <strong>{form.weekStartsOn || 'Not set'}</strong>
              </div>
              <div className="settings__week-preview-item">
                <span>Week end</span>
                <strong>{derivedWeekEnd || 'Not set'}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="settings__group settings__group--wide" aria-label="Operating hours settings">
          <div className="settings__group-copy">
            <div className="settings__group-heading">
              <h3>Business Hours</h3>
              {hoursDirty && <span className="settings__dirty-indicator">Unsaved changes</span>}
            </div>
            <p>Which days you're open, and your hours.</p>
          </div>
          <div className="settings__group-body">
            <div className="settings__hours-table" aria-label="Business hours table">
              {DAYS.map((day) => {
                const hours = form.operatingHours[day];

                return (
                  <div key={day} className="settings__hours-row">
                    <div className="settings__hours-day">
                      <strong>{day}</strong>
                    </div>
                    <div className="settings__hours-time settings__hours-time--open">
                      <label htmlFor={`${day}-open-time`} className="settings__hours-label">Open</label>
                      <input
                        id={`${day}-open-time`}
                        name={`${day}-open-time`}
                        type="time"
                        min="00:00"
                        max="23:59"
                        className="settings__hours-input"
                        value={hours.openTime}
                        onChange={(event) => updateOperatingHours(day, 'openTime', event.target.value)}
                        disabled={!hours.isOpen}
                      />
                    </div>
                    <div className="settings__hours-time settings__hours-time--close">
                      <label htmlFor={`${day}-close-time`} className="settings__hours-label">Close</label>
                      <input
                        id={`${day}-close-time`}
                        name={`${day}-close-time`}
                        type="time"
                        min="00:00"
                        max="23:59"
                        className="settings__hours-input"
                        value={hours.closeTime}
                        onChange={(event) => updateOperatingHours(day, 'closeTime', event.target.value)}
                        disabled={!hours.isOpen}
                      />
                    </div>
                    <div className="settings__hours-toggle-cell">
                      <button
                        type="button"
                        className={`settings__toggle ${hours.isOpen ? 'is-active' : ''}`.trim()}
                        aria-pressed={hours.isOpen}
                        aria-label={`${day} is ${hours.isOpen ? 'open' : 'closed'}. Toggle operating day.`}
                        onClick={() => toggleOperatingDay(day)}
                      >
                        <span className="settings__toggle-track" aria-hidden="true">
                          <span className="settings__toggle-thumb" />
                        </span>
                        <span>{hours.isOpen ? 'Open' : 'Closed'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="settings__save-bar" role="status">
          <div className="settings__save-bar-copy">
            {isDirty ? (
              <span className="settings__dirty-indicator">Unsaved changes</span>
            ) : justSaved ? (
              <span className="settings__saved">All changes saved</span>
            ) : (
              <span className="settings__save-bar-hint">No changes to save</span>
            )}
          </div>
          <div className="settings__save-bar-actions">
            <button type="button" className="button-outline" onClick={handleDiscardAll} disabled={!isDirty}>
              <span className="settings__action-icon" aria-hidden="true">
                <i className="fas fa-rotate-left" />
              </span>
              Discard
            </button>
            <Button type="submit" className="settings__save-bar-button" disabled={!canSave}>
              <span className="settings__action-icon" aria-hidden="true">
                <i className="fas fa-floppy-disk" />
              </span>
              Save
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};