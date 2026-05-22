import { useEffect, useState } from 'react';

import {
  Button,
  ContentPanel,
  InputField,
} from '../../Components';
import { BASE_TEAM_ROLES, DAYS, useAppState } from '../../state/AppState';

import './Settings.scss';

export const Settings = () => {
  const { state, dispatch } = useAppState();
  const [form, setForm] = useState(state.settings);
  const [savedSection, setSavedSection] = useState('');
  const [newShiftType, setNewShiftType] = useState('');
  const [newTeamRole, setNewTeamRole] = useState('');
  const baseTeamRoles = Object.values(BASE_TEAM_ROLES);

  useEffect(() => {
    setForm(state.settings);
    setNewShiftType('');
    setNewTeamRole('');
  }, [state.settings]);

  const workspaceDirty = [
    'locationName',
    'currentUserName',
    'schedulerName',
  ].some((field) => form[field] !== state.settings[field]);
  const shiftsDirty = JSON.stringify(form.shiftTypes) !== JSON.stringify(state.settings.shiftTypes);
  const rolesDirty = JSON.stringify(form.additionalTeamRoles) !== JSON.stringify(state.settings.additionalTeamRoles);
  const hoursDirty = JSON.stringify(form.operatingHours) !== JSON.stringify(state.settings.operatingHours);

  const updateForm = (field, value) => {
    setSavedSection('');
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  };

  const addShiftType = () => {
    const nextShiftType = newShiftType.trim();

    if (!nextShiftType || form.shiftTypes.includes(nextShiftType)) {
      return;
    }

    updateForm('shiftTypes', [...form.shiftTypes, nextShiftType]);
    setNewShiftType('');
  };

  const removeShiftType = (shiftTypeToRemove) => {
    if (form.shiftTypes.length <= 1) {
      return;
    }

    updateForm('shiftTypes', form.shiftTypes.filter((shiftType) => shiftType !== shiftTypeToRemove));
  };

  const addTeamRole = () => {
    const nextTeamRole = newTeamRole.trim();

    if (!nextTeamRole || baseTeamRoles.includes(nextTeamRole) || form.additionalTeamRoles.includes(nextTeamRole)) {
      return;
    }

    updateForm('additionalTeamRoles', [...form.additionalTeamRoles, nextTeamRole]);
    setNewTeamRole('');
  };

  const removeTeamRole = (roleToRemove) => {
    updateForm('additionalTeamRoles', form.additionalTeamRoles.filter((role) => role !== roleToRemove));
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

  const handleSaveSection = (sectionName, payload) => (event) => {
    event.preventDefault();
    dispatch({ type: 'UPDATE_SETTINGS', payload });
    setSavedSection(sectionName);
  };

  return (
    <div className="settings">
      <ContentPanel>
        <div className="settings__page-header">
          <div className="settings__page-copy">
            <span className="settings__page-eyebrow">Workspace settings</span>
            <h2>Manage business defaults and scheduling rules</h2>
            <p>Update the shared configuration that shapes staffing, roles, and operating hours across the app.</p>
          </div>
        </div>
        <div className="settings__form">
          <form
            className="settings__group settings__section-form"
            aria-label="Workspace details settings"
            onSubmit={handleSaveSection('workspace', {
              locationName: form.locationName,
              currentUserName: form.currentUserName,
              schedulerName: form.schedulerName,
            })}
          >
            <div className="settings__group-copy">
                <div className="settings__group-heading">
                  <h3>Workspace Details</h3>
                  {workspaceDirty && <span className="settings__dirty-indicator">Unsaved changes</span>}
                </div>
              <p>Update the saved location and manager defaults used across the workspace.</p>
            </div>
            <InputField label="Location Name" name="locationName" value={form.locationName} onChange={(value) => updateForm('locationName', value)} />
            <InputField label="Current User" name="currentUserName" value={form.currentUserName} onChange={(value) => updateForm('currentUserName', value)} />
            <InputField label="Scheduler Name" name="schedulerName" value={form.schedulerName} onChange={(value) => updateForm('schedulerName', value)} />
            <div className="settings__actions">
              <Button type="submit" className="settings__section-button" disabled={!workspaceDirty}>
                <span className="settings__action-icon" aria-hidden="true">
                  <i className="fas fa-building" />
                </span>
                Save Workspace Details
              </Button>
              {savedSection === 'workspace' && <p className="settings__saved">Workspace details saved locally for this device.</p>}
            </div>
          </form>

          <form
            className="settings__group settings__section-form"
            aria-label="Shift type settings"
            onSubmit={handleSaveSection('shifts', { shiftTypes: form.shiftTypes })}
          >
            <div className="settings__group-copy">
              <div className="settings__group-heading">
                <h3>Shift Types</h3>
                {shiftsDirty && <span className="settings__dirty-indicator">Unsaved changes</span>}
              </div>
              <p>These drive scheduler coverage, availability editing, and roster planning across the app.</p>
            </div>
            <div className="settings__token-row">
              {form.shiftTypes.map((shiftType) => (
                <span key={shiftType} className="settings__token">
                  <span>{shiftType}</span>
                  <button type="button" onClick={() => removeShiftType(shiftType)} disabled={form.shiftTypes.length <= 1} aria-label={`Remove ${shiftType} shift type`}>
                    <i className="fas fa-xmark" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
            <div className="settings__inline-form">
              <InputField label="Add Shift Type" name="newShiftType" value={newShiftType} onChange={setNewShiftType} placeholder="Ex. Prep" />
              <Button type="button" className="settings__inline-button" onClick={addShiftType}>
                <span className="settings__action-icon" aria-hidden="true">
                  <i className="fas fa-plus" />
                </span>
                Add Shift
              </Button>
            </div>
            <div className="settings__actions">
              <Button type="submit" className="settings__section-button" disabled={!shiftsDirty}>
                <span className="settings__action-icon" aria-hidden="true">
                  <i className="fas fa-layer-group" />
                </span>
                Save Shift Types
              </Button>
              {savedSection === 'shifts' && <p className="settings__saved">Shift types saved locally for this device.</p>}
            </div>
          </form>

          <form
            className="settings__group settings__section-form"
            aria-label="Team role settings"
            onSubmit={handleSaveSection('roles', { additionalTeamRoles: form.additionalTeamRoles })}
          >
            <div className="settings__group-copy">
              <div className="settings__group-heading">
                <h3>Team Roles</h3>
                {rolesDirty && <span className="settings__dirty-indicator">Unsaved changes</span>}
              </div>
              <p>Base roles stay available. Add custom roles here for business-specific staffing needs.</p>
            </div>
            <div className="settings__token-row settings__token-row--stacked">
              {baseTeamRoles.map((role) => (
                <span key={role} className="settings__token settings__token--base">{role}</span>
              ))}
              {form.additionalTeamRoles.map((role) => (
                <span key={role} className="settings__token">
                  <span>{role}</span>
                  <button type="button" onClick={() => removeTeamRole(role)} aria-label={`Remove ${role} team role`}>
                    <i className="fas fa-xmark" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
            <div className="settings__inline-form">
              <InputField label="Add Custom Role" name="newTeamRole" value={newTeamRole} onChange={setNewTeamRole} placeholder="Ex. Dishwasher" />
              <Button type="button" className="settings__inline-button" onClick={addTeamRole}>
                <span className="settings__action-icon" aria-hidden="true">
                  <i className="fas fa-plus" />
                </span>
                Add Role
              </Button>
            </div>
            <div className="settings__actions">
              <Button type="submit" className="settings__section-button" disabled={!rolesDirty}>
                <span className="settings__action-icon" aria-hidden="true">
                  <i className="fas fa-user-tag" />
                </span>
                Save Team Roles
              </Button>
              {savedSection === 'roles' && <p className="settings__saved">Team roles saved locally for this device.</p>}
            </div>
          </form>

          <form
            className="settings__group settings__section-form"
            aria-label="Operating hours settings"
            onSubmit={handleSaveSection('hours', { operatingHours: form.operatingHours })}
          >
            <div className="settings__group-copy">
              <div className="settings__group-heading">
                <h3>Business Hours</h3>
                {hoursDirty && <span className="settings__dirty-indicator">Unsaved changes</span>}
              </div>
              <p>Set which days you operate and the opening and closing hours for each day.</p>
            </div>
            <div className="settings__hours-grid">
              {DAYS.map((day) => {
                const hours = form.operatingHours[day];

                return (
                  <div key={day} className="settings__hours-card">
                    <div className="settings__hours-header">
                      <strong>{day}</strong>
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
                    <div className="settings__hours-fields">
                      <InputField
                        label="Open"
                        name={`${day}-open-time`}
                        type="time"
                        value={hours.openTime}
                        onChange={(value) => updateOperatingHours(day, 'openTime', value)}
                        disabled={!hours.isOpen}
                      />
                      <InputField
                        label="Close"
                        name={`${day}-close-time`}
                        type="time"
                        value={hours.closeTime}
                        onChange={(value) => updateOperatingHours(day, 'closeTime', value)}
                        disabled={!hours.isOpen}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="settings__actions">
              <Button type="submit" className="settings__section-button settings__submit-button" disabled={!hoursDirty}>
                <span className="settings__action-icon" aria-hidden="true">
                  <i className="fas fa-clock" />
                </span>
                Save Business Hours
              </Button>
              {savedSection === 'hours' && <p className="settings__saved">Business hours saved locally for this device.</p>}
            </div>
          </form>
        </div>
      </ContentPanel>
    </div>
  );
};