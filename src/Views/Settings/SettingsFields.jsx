import { useEffect, useMemo, useState } from 'react';

import { Button, CoverageDayRow, DayHoursRow, InputField, RolePills } from '../../Components';
import { DAYS } from '../../state/AppState';

const emptyCoverageRow = (shiftTypes) => Object.fromEntries(shiftTypes.map((shift) => [shift, 0]));
const WEEKEND = ['Saturday', 'Sunday'];

// Owns the draft-settings form and every mutator for it — shared by the
// Settings page (all sections visible, one big save bar) and the setup
// wizard (one section per step, each step's Continue commits immediately).
// Keeping this in one place is the whole point: there is exactly one
// implementation of "edit shift types" / "edit hours" / etc. in the app,
// not two that can quietly drift apart.
export const useSettingsForm = (state) => {
  const [form, setForm] = useState(state.settings);
  const [justSaved, setJustSaved] = useState(false);
  const [newShiftType, setNewShiftType] = useState('');
  const [newTeamRole, setNewTeamRole] = useState('');
  const [coverageRoleChoice, setCoverageRoleChoice] = useState(state.settings.teamRoles?.[0] ?? '');

  const derivedWeekEnd = form.weekStartsOn ? DAYS[(DAYS.indexOf(form.weekStartsOn) + 6) % DAYS.length] : '';
  const coverageRole = form.teamRoles.includes(coverageRoleChoice) ? coverageRoleChoice : (form.teamRoles[0] ?? '');
  const coverageRow = (day) => form.roleCoverage?.[coverageRole]?.[day] ?? emptyCoverageRow(form.shiftTypes);

  // One role's total headcount across the open week — shown on its pill.
  const coverageTotalFor = (role) =>
    DAYS.reduce((total, day) => (
      form.operatingHours?.[day]?.isOpen
        ? total + form.shiftTypes.reduce((dayTotal, shift) => dayTotal + (Number(form.roleCoverage?.[role]?.[day]?.[shift]) || 0), 0)
        : total
    ), 0);

  // A role can't be removed while an active employee still holds it.
  // Archived employees and past schedule history don't count — removing a
  // role from this list doesn't touch historical schedule records (they
  // keep their own `role` field regardless), so there's nothing to protect
  // there.
  const rolesInUse = useMemo(() => {
    const used = new Set();
    state.employees
      .filter((employee) => employee.status !== 'archived')
      .forEach((employee) => (employee.roles ?? []).forEach((role) => used.add(role)));
    return used;
  }, [state.employees]);

  useEffect(() => {
    setForm(state.settings);
    setNewShiftType('');
    setNewTeamRole('');
  }, [state.settings]);

  const workspaceDirty = ['businessName', 'locationName'].some((field) => form[field] !== state.settings[field]);
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

  // A per-day override for one shift's hours. The field starts from the
  // base time (not blank — see ShiftTypesFields, which pre-fills the same
  // way), so editing just one field keeps the other at whatever's currently
  // in effect. Once both fields match the base time again, the override is
  // dropped rather than kept as a no-op copy of it.
  const updateShiftDayTime = (label, day, field, value) => {
    setJustSaved(false);
    setForm((currentForm) => {
      const entry = currentForm.shiftTimes?.[label] ?? { startTime: '', endTime: '' };
      const byDay = { ...(entry.byDay ?? {}) };
      const current = byDay[day] ?? { startTime: entry.startTime ?? '', endTime: entry.endTime ?? '' };
      const nextDay = { ...current, [field]: value };

      if (nextDay.startTime === (entry.startTime ?? '') && nextDay.endTime === (entry.endTime ?? '')) {
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

  // A new org's operating hours start blank on purpose (we don't guess hours
  // it never confirmed). These one-tap presets are the fast way in — set a
  // common pattern, then adjust the days that differ.
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

  const discard = () => {
    setForm(state.settings);
    setJustSaved(false);
  };

  return {
    form,
    justSaved,
    setJustSaved,
    newShiftType,
    setNewShiftType,
    newTeamRole,
    setNewTeamRole,
    coverageRole,
    setCoverageRole: setCoverageRoleChoice,
    derivedWeekEnd,
    coverageRow,
    coverageTotalFor,
    rolesInUse,
    workspaceDirty,
    shiftsDirty,
    rolesDirty,
    coverageDirty,
    schedulingDirty,
    hoursDirty,
    isDirty,
    canSave,
    updateForm,
    addShiftType,
    removeShiftType,
    updateShiftTime,
    updateShiftDayTime,
    addTeamRole,
    removeTeamRole,
    updateCoverage,
    applyCoverageToAllDays,
    updateOperatingHours,
    applyHoursPreset,
    toggleOperatingDay,
    discard,
  };
};

export const WorkspaceDetailsFields = ({ f }) => (
  <>
    <InputField label="Organization Name" name="businessName" value={f.form.businessName} onChange={(value) => f.updateForm('businessName', value)} />
    <InputField label="Location Name" name="locationName" value={f.form.locationName} onChange={(value) => f.updateForm('locationName', value)} />
  </>
);

export const ShiftTypesFields = ({ f }) => (
  <>
    <div className="settings__shift-list">
      {f.form.shiftTypes.map((shiftType) => {
        const times = f.form.shiftTimes?.[shiftType] ?? { startTime: '', endTime: '' };

        return (
          <div key={shiftType} className="settings__shift-row">
            <div className="settings__shift-row-head">
              <strong>{shiftType}</strong>
              <button
                type="button"
                className="settings__shift-remove"
                onClick={() => f.removeShiftType(shiftType)}
                disabled={f.form.shiftTypes.length <= 1}
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
                  onChange={(event) => f.updateShiftTime(shiftType, 'startTime', event.target.value)}
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
                  onChange={(event) => f.updateShiftTime(shiftType, 'endTime', event.target.value)}
                />
              </div>
            </div>

            <details className="settings__shift-days">
              <summary>Vary by day</summary>
              <p className="settings__shift-days-hint">
                Starts from the times above — change only the days that differ.
              </p>
              <div className="settings__shift-days-grid">
                {DAYS.map((day) => {
                  const dayTimes = times.byDay?.[day] ?? { startTime: times.startTime ?? '', endTime: times.endTime ?? '' };

                  return (
                    <div key={day} className="settings__shift-days-row">
                      <strong>{day.slice(0, 3)}</strong>
                      <input
                        type="time"
                        min="00:00"
                        max="23:59"
                        aria-label={`${shiftType} ${day} start time`}
                        value={dayTimes.startTime ?? ''}
                        onChange={(event) => f.updateShiftDayTime(shiftType, day, 'startTime', event.target.value)}
                      />
                      <input
                        type="time"
                        min="00:00"
                        max="23:59"
                        aria-label={`${shiftType} ${day} end time`}
                        value={dayTimes.endTime ?? ''}
                        onChange={(event) => f.updateShiftDayTime(shiftType, day, 'endTime', event.target.value)}
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
      <InputField label="Add Shift Type" name="newShiftType" value={f.newShiftType} onChange={f.setNewShiftType} placeholder="Ex. Prep" />
      <Button type="button" className="settings__inline-button button-outline" onClick={f.addShiftType}>
        <span className="settings__action-icon" aria-hidden="true">
          <i className="fas fa-plus" />
        </span>
        Add Shift
      </Button>
    </div>
  </>
);

export const TeamRolesFields = ({ f }) => (
  <>
    <div className="settings__token-row settings__token-row--stacked">
      {f.form.teamRoles.map((role) => {
        const locked = f.form.teamRoles.length <= 1 || f.rolesInUse.has(role);

        return (
          <span key={role} className={`settings__token ${locked ? 'settings__token--base' : ''}`.trim()}>
            <span>{role}</span>
            <button
              type="button"
              onClick={() => f.removeTeamRole(role)}
              disabled={locked}
              title={f.rolesInUse.has(role) ? 'Assigned to an active team member' : undefined}
              aria-label={`Remove ${role} team role`}
            >
              <i className="fas fa-xmark" aria-hidden="true" />
            </button>
          </span>
        );
      })}
    </div>
    <div className="settings__inline-form">
      <InputField label="Add Role" name="newTeamRole" value={f.newTeamRole} onChange={f.setNewTeamRole} placeholder="Ex. Dishwasher" />
      <Button type="button" className="settings__inline-button button-outline" onClick={f.addTeamRole}>
        <span className="settings__action-icon" aria-hidden="true">
          <i className="fas fa-plus" />
        </span>
        Add Role
      </Button>
    </div>
  </>
);

// `onSelectRole`/`reviewed` let a caller (the setup wizard) layer its own
// role-review tracking on top of the same grid, without this component
// needing to know that concept exists.
export const CoverageTargetsFields = ({ f, onSelectRole, reviewed }) => (
  <>
    <span className="settings__field-label">Role</span>
    <RolePills
      roles={f.form.teamRoles}
      active={f.coverageRole}
      onSelect={onSelectRole ?? f.setCoverageRole}
      totalFor={f.coverageTotalFor}
      reviewed={reviewed}
    />

    <div className="settings__coverage-grid" aria-label={`Coverage targets for ${f.coverageRole}`}>
      {DAYS.map((day) => (
        <CoverageDayRow
          key={day}
          day={day}
          isClosed={!f.form.operatingHours?.[day]?.isOpen}
          settings={f.form}
          shiftTypes={f.form.shiftTypes}
          values={f.coverageRow(day)}
          onChange={(shift, value) => f.updateCoverage(f.coverageRole, day, shift, value)}
          onApplyToAll={() => f.applyCoverageToAllDays(f.coverageRole, day)}
        />
      ))}
    </div>
  </>
);

export const SchedulingWeekFields = ({ f }) => (
  <>
    <label className="settings__field-label" htmlFor="week-starts-on">Week Starts On</label>
    <select
      id="week-starts-on"
      className="settings__select"
      value={f.form.weekStartsOn ?? ''}
      onChange={(event) => f.updateForm('weekStartsOn', event.target.value)}
    >
      <option value="">Select week start</option>
      {DAYS.map((day) => (
        <option key={day} value={day}>{day}</option>
      ))}
    </select>
    {f.schedulingDirty && !f.form.weekStartsOn && (
      <p className="settings__field-warning">Select a day to save this change.</p>
    )}
    <div className="settings__week-preview" aria-label="Scheduling week preview">
      <div className="settings__week-preview-item">
        <span>Week start</span>
        <strong>{f.form.weekStartsOn || 'Not set'}</strong>
      </div>
      <div className="settings__week-preview-item">
        <span>Week end</span>
        <strong>{f.derivedWeekEnd || 'Not set'}</strong>
      </div>
    </div>
  </>
);

export const BusinessHoursFields = ({ f }) => (
  <>
    <div className="settings__hours-presets">
      <span className="settings__field-label">Quick fill</span>
      <div className="settings__hours-preset-buttons">
        <button type="button" className="button-outline" onClick={() => f.applyHoursPreset('weekdays')}>
          Weekdays 9–5
        </button>
        <button type="button" className="button-outline" onClick={() => f.applyHoursPreset('everyday')}>
          Every day 9–5
        </button>
        <button type="button" className="button-outline" onClick={() => f.applyHoursPreset('closed')}>
          All closed
        </button>
      </div>
    </div>
    <div className="settings__hours-table" aria-label="Business hours table">
      {DAYS.map((day) => (
        <DayHoursRow
          key={day}
          day={day}
          hours={f.form.operatingHours[day]}
          onChangeTime={(field, value) => f.updateOperatingHours(day, field, value)}
          onToggle={() => f.toggleOperatingDay(day)}
        />
      ))}
    </div>
  </>
);
