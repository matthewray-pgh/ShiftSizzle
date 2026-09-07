import { useEffect, useMemo, useState } from 'react';

import {
  Button,
  CoverageDayRow,
  DayHoursRow,
  InputField,
} from '../../Components';
import { DAYS, useAppState } from '../../state/AppState';

const emptyCoverageRow = (shiftTypes) => Object.fromEntries(shiftTypes.map((shift) => [shift, 0]));

import './Settings.scss';

// Each settings block can collapse to a single header row (the full form is
// several screens of scrolling on a phone). Every section starts expanded;
// collapsing is opt-in and animates via a grid-rows transition. The body
// stays in the DOM either way, and at the tablet breakpoint and up it's
// forced open so desktop always shows everything.
const SettingsSection = ({ title, hint, dirty, wide, ariaLabel, children }) => {
  const [open, setOpen] = useState(true);

  return (
    <section
      className={`settings__group${wide ? ' settings__group--wide' : ''}${open ? ' is-open' : ''}`}
      aria-label={ariaLabel}
    >
      <h3 className="settings__group-summary">
        <button
          type="button"
          className="settings__group-toggle"
          aria-expanded={open}
          aria-label={title}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="settings__group-copy">
            <span className="settings__group-heading">
              <span className="settings__group-title">{title}</span>
              {dirty && <span className="settings__dirty-indicator">Unsaved changes</span>}
            </span>
            {hint && <span className="settings__group-hint">{hint}</span>}
          </span>
          <i className="fas fa-chevron-down settings__group-chevron" aria-hidden="true" />
        </button>
      </h3>
      <div className="settings__group-collapse">
        <div className="settings__group-body">
          {children}
        </div>
      </div>
    </section>
  );
};

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

  // A per-day override for one shift's hours. Clearing both fields for a day
  // drops the override (that day falls back to the base time).
  const updateShiftDayTime = (label, day, field, value) => {
    setJustSaved(false);
    setForm((currentForm) => {
      const entry = currentForm.shiftTimes?.[label] ?? { startTime: '', endTime: '' };
      const byDay = { ...(entry.byDay ?? {}) };
      const nextDay = { startTime: '', endTime: '', ...(byDay[day] ?? {}), [field]: value };

      if (!nextDay.startTime && !nextDay.endTime) {
        delete byDay[day];
      } else {
        byDay[day] = nextDay;
      }

      return {
        ...currentForm,
        shiftTimes: {
          ...(currentForm.shiftTimes ?? {}),
          [label]: { startTime: '', endTime: '', ...entry, byDay },
        },
      };
    });
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

  // Copy one day's open/close/is-open state onto every day — the same
  // "set it once" affordance Coverage Targets has, so Business Hours isn't
  // seven separate toggles plus fourteen time entries.
  const applyHoursToAllDays = (sourceDay) => {
    const source = form.operatingHours[sourceDay];

    updateForm(
      'operatingHours',
      Object.fromEntries(DAYS.map((day) => [day, { ...source }])),
    );
  };

  // A new org's operating hours start blank on purpose (we don't guess hours
  // it never confirmed). These one-tap presets are the fast way in — set a
  // common pattern, then adjust the days that differ.
  const WEEKEND = ['Saturday', 'Sunday'];
  const applyHoursPreset = (preset) => {
    const open = { isOpen: true, openTime: '09:00', closeTime: '17:00' };
    const closed = { isOpen: false, openTime: '', closeTime: '' };
    const byPreset = {
      weekdays: (day) => (WEEKEND.includes(day) ? { ...closed } : { ...open }),
      everyday: () => ({ ...open }),
      closed: () => ({ ...closed }),
    };

    updateForm('operatingHours', Object.fromEntries(DAYS.map((day) => [day, byPreset[preset](day)])));
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
        <SettingsSection
          title="Workspace Details"
          hint="Names shown across the app."
          dirty={workspaceDirty}
          ariaLabel="Workspace details settings"
        >
          <InputField label="Organization Name" name="businessName" value={form.businessName} onChange={(value) => updateForm('businessName', value)} />
          <InputField label="Location Name" name="locationName" value={form.locationName} onChange={(value) => updateForm('locationName', value)} />
        </SettingsSection>

        <SettingsSection
          title="Shift Types"
          hint="Used across scheduling and availability. Times are optional."
          dirty={shiftsDirty}
          ariaLabel="Shift type settings"
        >
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
                        <label htmlFor={`${shiftType}-shift-start`}>Start</label>
                        <input
                          id={`${shiftType}-shift-start`}
                          type="time"
                          min="00:00"
                          max="23:59"
                          value={times.startTime ?? ''}
                          onChange={(event) => updateShiftTime(shiftType, 'startTime', event.target.value)}
                        />
                      </div>
                      <div className="settings__shift-time">
                        <label htmlFor={`${shiftType}-shift-end`}>End</label>
                        <input
                          id={`${shiftType}-shift-end`}
                          type="time"
                          min="00:00"
                          max="23:59"
                          value={times.endTime ?? ''}
                          onChange={(event) => updateShiftTime(shiftType, 'endTime', event.target.value)}
                        />
                      </div>
                    </div>

                    <details className="settings__shift-days">
                      <summary>Different hours on some days</summary>
                      <p className="settings__shift-days-hint">
                        Set only the days that differ — blank days use the times above.
                      </p>
                      <div className="settings__shift-days-grid">
                        {DAYS.map((day) => {
                          const dayTimes = times.byDay?.[day] ?? { startTime: '', endTime: '' };

                          return (
                            <div key={day} className="settings__shift-days-row">
                              <strong>{day.slice(0, 3)}</strong>
                              <input
                                type="time"
                                min="00:00"
                                max="23:59"
                                aria-label={`${shiftType} ${day} start time`}
                                value={dayTimes.startTime ?? ''}
                                onChange={(event) => updateShiftDayTime(shiftType, day, 'startTime', event.target.value)}
                              />
                              <input
                                type="time"
                                min="00:00"
                                max="23:59"
                                aria-label={`${shiftType} ${day} end time`}
                                value={dayTimes.endTime ?? ''}
                                onChange={(event) => updateShiftDayTime(shiftType, day, 'endTime', event.target.value)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </details>
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
        </SettingsSection>

        <SettingsSection
          title="Team Roles"
          hint="Roles used for scheduling and coverage. Remove any you don't use."
          dirty={rolesDirty}
          ariaLabel="Team role settings"
        >
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
        </SettingsSection>

        <SettingsSection
          title="Coverage Targets"
          hint="How many of each role each shift needs. Set once here — schedules start from this, so weekly work is just assigning people."
          dirty={coverageDirty}
          ariaLabel="Coverage target settings"
          wide
        >
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
              {DAYS.map((day) => (
                <CoverageDayRow
                  key={day}
                  day={day}
                  isClosed={!form.operatingHours?.[day]?.isOpen}
                  settings={form}
                  shiftTypes={form.shiftTypes}
                  values={coverageRow(day)}
                  onChange={(shift, value) => updateCoverage(activeCoverageRole, day, shift, value)}
                  onApplyToAll={() => applyCoverageToAllDays(activeCoverageRole, day)}
                />
              ))}
            </div>
        </SettingsSection>

        <SettingsSection
          title="Scheduling Week"
          hint="The day your scheduling week starts."
          dirty={schedulingDirty}
          ariaLabel="Scheduling week settings"
        >
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
        </SettingsSection>

        <SettingsSection
          title="Business Hours"
          hint="Which days you're open, and your hours."
          dirty={hoursDirty}
          ariaLabel="Operating hours settings"
          wide
        >
            <div className="settings__hours-presets">
              <span className="settings__field-label">Quick fill</span>
              <div className="settings__hours-preset-buttons">
                <button type="button" className="button-outline" onClick={() => applyHoursPreset('weekdays')}>
                  Weekdays 9–5
                </button>
                <button type="button" className="button-outline" onClick={() => applyHoursPreset('everyday')}>
                  Every day 9–5
                </button>
                <button type="button" className="button-outline" onClick={() => applyHoursPreset('closed')}>
                  All closed
                </button>
              </div>
            </div>
            <div className="settings__hours-table" aria-label="Business hours table">
              {DAYS.map((day) => (
                <DayHoursRow
                  key={day}
                  day={day}
                  hours={form.operatingHours[day]}
                  onChangeTime={(field, value) => updateOperatingHours(day, field, value)}
                  onToggle={() => toggleOperatingDay(day)}
                  onApplyToAll={() => applyHoursToAllDays(day)}
                />
              ))}
            </div>
        </SettingsSection>

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