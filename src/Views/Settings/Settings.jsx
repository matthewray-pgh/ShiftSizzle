import { useEffect, useState } from 'react';

import { Button } from '../../Components';
import { useAppState } from '../../state/AppState';
import {
  BusinessHoursFields,
  CoverageTargetsFields,
  SchedulingWeekFields,
  ShiftTypesFields,
  TeamRolesFields,
  WorkspaceDetailsFields,
  useSettingsForm,
} from './SettingsFields';

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
  const f = useSettingsForm(state);

  // On phones, paint the app background to match the header so the settings
  // panel floats on it — same treatment as the Dashboard.
  useEffect(() => {
    document.body.classList.add('settings-view');
    return () => document.body.classList.remove('settings-view');
  }, []);

  const handleSaveAll = (event) => {
    event.preventDefault();

    if (!f.canSave) {
      return;
    }

    dispatch({ type: 'UPDATE_SETTINGS', payload: f.form });
    f.setJustSaved(true);
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
          dirty={f.workspaceDirty}
          ariaLabel="Workspace details settings"
        >
          <WorkspaceDetailsFields f={f} />
        </SettingsSection>

        <SettingsSection
          title="Shift Types"
          hint="Used across scheduling and availability. Times are optional."
          dirty={f.shiftsDirty}
          ariaLabel="Shift type settings"
        >
          <ShiftTypesFields f={f} />
        </SettingsSection>

        <SettingsSection
          title="Team Roles"
          hint="Roles used for scheduling and coverage. Remove any you don't use."
          dirty={f.rolesDirty}
          ariaLabel="Team role settings"
        >
          <TeamRolesFields f={f} />
        </SettingsSection>

        <SettingsSection
          title="Business Hours"
          hint="Which days you're open, and your hours."
          dirty={f.hoursDirty}
          ariaLabel="Operating hours settings"
          wide
        >
          <BusinessHoursFields f={f} />
        </SettingsSection>

        <SettingsSection
          title="Coverage Targets"
          hint="How many of each role each shift needs. Set once here — schedules start from this, so weekly work is just assigning people."
          dirty={f.coverageDirty}
          ariaLabel="Coverage target settings"
          wide
        >
          <CoverageTargetsFields f={f} />
        </SettingsSection>

        <SettingsSection
          title="Scheduling Week"
          hint="The day your scheduling week starts."
          dirty={f.schedulingDirty}
          ariaLabel="Scheduling week settings"
        >
          <SchedulingWeekFields f={f} />
        </SettingsSection>

        <div className="settings__save-bar" role="status">
          <div className="settings__save-bar-copy">
            {f.isDirty ? (
              <span className="settings__dirty-indicator">Unsaved changes</span>
            ) : f.justSaved ? (
              <span className="settings__saved">All changes saved</span>
            ) : (
              <span className="settings__save-bar-hint">No changes to save</span>
            )}
          </div>
          <div className="settings__save-bar-actions">
            <button type="button" className="button-outline" onClick={f.discard} disabled={!f.isDirty}>
              <span className="settings__action-icon" aria-hidden="true">
                <i className="fas fa-rotate-left" />
              </span>
              Discard
            </button>
            <Button type="submit" className="settings__save-bar-button" disabled={!f.canSave}>
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
