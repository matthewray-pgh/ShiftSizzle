import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, ContentPanel, CoverageDayRow, DayHoursRow, InputField } from '../../Components';
import {
  DAYS,
  getCurrentWeekStartDate,
  getOpenDays,
  getSchedulerReadiness,
  getShiftTypes,
  getTeamRoles,
  useAppState,
} from '../../state/AppState';
import { SETUP_TEMPLATES, settingsFromTemplate } from '../../state/setupTemplates';
import { AI_UNAVAILABLE, requestAiSetup } from '../../state/aiAssist';
import { supabase } from '../../lib/supabaseClient';

import './SetupWizard.scss';

const STEPS = ['template', 'hours', 'coverage', 'team', 'build'];
const STEP_LABEL = {
  template: 'Business type',
  hours: 'Hours',
  coverage: 'Coverage',
  team: 'Team',
  build: 'Build',
};

const fullAvailability = (shiftTypes) => Object.fromEntries(DAYS.map((day) => [day, [...shiftTypes]]));

const emptyCoverageRow = (shiftTypes) => Object.fromEntries(shiftTypes.map((shift) => [shift, 0]));

// The first step whose requirement isn't met yet — so re-entering the
// wizard after finishing part of it resumes where it left off rather than
// starting over (and re-committing a template would clobber earlier edits).
const firstIncompleteStep = (readiness) => {
  if (!readiness.hasWeek) return 'template';
  if (!readiness.hasHours) return 'hours';
  if (!readiness.hasCoverage) return 'coverage';
  if (!readiness.hasTeam) return 'team';
  return 'build';
};

// One guided flow that stands up everything a schedule needs — business
// hours, roles, and a coverage template — from a business-type starter,
// then hands off to the builder with the current week ready to auto-fill.
// Replaces the Settings scavenger hunt for a brand-new org (§ fast-start).
export const SetupWizard = () => {
  const { state, dispatch } = useAppState();
  const { settings, employees } = state;
  const navigate = useNavigate();

  // Rendered inside <HydrationGate>, so `state` is already loaded here.
  const [step, setStep] = useState(() => firstIncompleteStep(getSchedulerReadiness(state)));
  const [templateId, setTemplateId] = useState('full-service-restaurant');
  const [weekStartsOn, setWeekStartsOn] = useState(settings.weekStartsOn || 'Monday');
  const [coverageRole, setCoverageRole] = useState('');
  const [teamDraft, setTeamDraft] = useState({ name: '', roles: [] });
  const [addedTeam, setAddedTeam] = useState([]);
  const [building, setBuilding] = useState(false);

  // "Describe it instead" — the AI setup path. `aiEnabled` flips off for the
  // rest of the session once the Edge Function answers "not deployed".
  const [aiMode, setAiMode] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [aiText, setAiText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiSummary, setAiSummary] = useState('');

  const shiftTypes = getShiftTypes(settings);
  const teamRoles = getTeamRoles(settings, employees);
  const openDays = getOpenDays(settings);

  useEffect(() => {
    if (!coverageRole && teamRoles.length) {
      setCoverageRole(teamRoles[0]);
    }
  }, [coverageRole, teamRoles]);

  // On each step change, jump the viewport to the top and move focus to the
  // new step's heading so keyboard and screen-reader users land at the start
  // of it, not on the (now-gone) Continue button lower down.
  const stepHeadingRef = useRef(null);
  const isFirstRenderRef = useRef(true);

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }

    stepHeadingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [step]);

  const stepIndex = STEPS.indexOf(step);
  const goNext = () => setStep(STEPS[Math.min(stepIndex + 1, STEPS.length - 1)]);
  const goBack = () => setStep(STEPS[Math.max(stepIndex - 1, 0)]);

  // ---- Step 1: template + week start ----
  const commitTemplate = () => {
    const payload = settingsFromTemplate(templateId, { currentSettings: settings, weekStartsOn });

    if (!payload) {
      return;
    }

    dispatch({ type: 'UPDATE_SETTINGS', payload });
    // Put the live canvas on the real current week straight away so the
    // silent autosave has a valid week to write against, not "".
    const currentWeek = getCurrentWeekStartDate(weekStartsOn);

    if (currentWeek) {
      dispatch({ type: 'SELECT_WEEK', payload: { startDate: currentWeek } });
    }

    setCoverageRole('');
    goNext();
  };

  const generateFromDescription = async () => {
    const description = aiText.trim();

    if (description.length < 8) {
      setAiError('Add a sentence or two about your business first.');
      return;
    }

    setAiBusy(true);
    setAiError('');

    const result = await requestAiSetup(supabase, description, settings);

    setAiBusy(false);

    if (result.error === AI_UNAVAILABLE) {
      setAiEnabled(false);
      setAiMode(false);
      setAiError('');
      return;
    }

    if (result.error) {
      setAiError(result.error);
      return;
    }

    dispatch({ type: 'UPDATE_SETTINGS', payload: { ...result.payload, weekStartsOn: weekStartsOn || result.payload.weekStartsOn } });

    const currentWeek = getCurrentWeekStartDate(weekStartsOn || result.payload.weekStartsOn);

    if (currentWeek) {
      dispatch({ type: 'SELECT_WEEK', payload: { startDate: currentWeek } });
    }

    setWeekStartsOn(weekStartsOn || result.payload.weekStartsOn);
    setAiSummary(result.summary);
    setCoverageRole('');
    goNext();
  };

  // ---- Step 2: hours ----
  const updateHours = (day, field, value) => {
    dispatch({
      type: 'UPDATE_SETTINGS',
      payload: {
        operatingHours: {
          ...settings.operatingHours,
          [day]: { ...settings.operatingHours[day], [field]: value },
        },
      },
    });
  };

  const toggleDay = (day) => updateHours(day, 'isOpen', !settings.operatingHours[day]?.isOpen);

  const applyHoursToAll = (sourceDay) => {
    const source = settings.operatingHours[sourceDay];

    dispatch({
      type: 'UPDATE_SETTINGS',
      payload: { operatingHours: Object.fromEntries(DAYS.map((day) => [day, { ...source }])) },
    });
  };

  // ---- Step 3: coverage ----
  const activeCoverageRole = teamRoles.includes(coverageRole) ? coverageRole : (teamRoles[0] ?? '');
  const coverageRow = (day) =>
    settings.roleCoverage?.[activeCoverageRole]?.[day] ?? emptyCoverageRow(shiftTypes);

  const updateCoverage = (day, shift, rawValue) => {
    const value = Math.max(0, parseInt(rawValue, 10) || 0);
    const currentGrid = settings.roleCoverage?.[activeCoverageRole] ?? {};

    dispatch({
      type: 'UPDATE_SETTINGS',
      payload: {
        roleCoverage: {
          ...(settings.roleCoverage ?? {}),
          [activeCoverageRole]: {
            ...currentGrid,
            [day]: { ...emptyCoverageRow(shiftTypes), ...(currentGrid[day] ?? {}), [shift]: value },
          },
        },
      },
    });
  };

  // Optional per-shift time range — same additive metadata Settings edits;
  // an empty field just means "no time set". Send the whole map since
  // UPDATE_SETTINGS replaces `shiftTimes` wholesale.
  const updateShiftTime = (label, field, value) => {
    dispatch({
      type: 'UPDATE_SETTINGS',
      payload: {
        shiftTimes: {
          ...(settings.shiftTimes ?? {}),
          [label]: {
            startTime: '',
            endTime: '',
            ...(settings.shiftTimes?.[label] ?? {}),
            [field]: value,
          },
        },
      },
    });
  };

  const applyCoverageToAll = (sourceDay) => {
    const currentGrid = settings.roleCoverage?.[activeCoverageRole] ?? {};
    const sourceRow = { ...emptyCoverageRow(shiftTypes), ...(currentGrid[sourceDay] ?? {}) };

    dispatch({
      type: 'UPDATE_SETTINGS',
      payload: {
        roleCoverage: {
          ...(settings.roleCoverage ?? {}),
          [activeCoverageRole]: Object.fromEntries(DAYS.map((day) => [day, { ...sourceRow }])),
        },
      },
    });
  };

  // ---- Step 4: team ----
  const toggleDraftRole = (role) => {
    setTeamDraft((draft) => ({
      ...draft,
      roles: draft.roles.includes(role)
        ? draft.roles.filter((entry) => entry !== role)
        : [...draft.roles, role],
    }));
  };

  const addTeamMember = () => {
    const name = teamDraft.name.trim();

    if (!name || teamDraft.roles.length === 0) {
      return;
    }

    const employee = {
      id: crypto.randomUUID(),
      name,
      title: '',
      roles: [...teamDraft.roles],
      contact: '',
      email: '',
      shiftsPerWeek: 5,
      status: 'active',
      availability: fullAvailability(shiftTypes),
    };

    dispatch({ type: 'UPSERT_EMPLOYEE', payload: employee });
    setAddedTeam((current) => [...current, { id: employee.id, name, roles: employee.roles }]);
    setTeamDraft({ name: '', roles: [] });
  };

  // ---- Step 5: build ----
  const activeEmployeeCount = useMemo(
    () => employees.filter((employee) => employee.status !== 'archived').length,
    [employees],
  );

  const rolesWithTargets = useMemo(
    () =>
      teamRoles.filter((role) =>
        DAYS.some((day) =>
          shiftTypes.some((shift) => Number(settings.roleCoverage?.[role]?.[day]?.[shift]) > 0),
        ),
      ),
    [teamRoles, shiftTypes, settings.roleCoverage],
  );

  const finishToBuilder = ({ autoBuild }) => {
    setBuilding(true);
    const currentWeek = getCurrentWeekStartDate(settings.weekStartsOn || weekStartsOn);

    if (currentWeek) {
      dispatch({ type: 'SELECT_WEEK', payload: { startDate: currentWeek } });
    }

    if (autoBuild) {
      rolesWithTargets.forEach((role) => dispatch({ type: 'AUTO_BUILD_SCHEDULE', payload: { role } }));
    }

    navigate('/schedule/build');
  };

  const skipToSettings = () => navigate('/settings');

  return (
    <div className="setup">
      <div className="setup__head">
        <h1>Set up your schedule</h1>
        <p>Pick your business type and we'll fill in the hours, roles, and coverage — you review and adjust.</p>
        <ol className="setup__progress" aria-label="Setup progress">
          {STEPS.map((entry, index) => (
            <li
              key={entry}
              className={`setup__progress-step ${index === stepIndex ? 'is-current' : ''} ${index < stepIndex ? 'is-done' : ''}`.trim()}
            >
              <span className="setup__progress-dot" aria-hidden="true">{index < stepIndex ? '✓' : index + 1}</span>
              {STEP_LABEL[entry]}
            </li>
          ))}
        </ol>
      </div>

      {step === 'template' && (
        <ContentPanel className="setup__card">
          <h2 ref={stepHeadingRef} tabIndex={-1} className="setup__step-heading">What kind of business is this?</h2>

          {aiMode ? (
            <div className="setup__ai">
              <label className="setup__field-label" htmlFor="setup-ai-description">
                Tell us about your business
              </label>
              <textarea
                id="setup-ai-description"
                className="setup__ai-input"
                rows={4}
                value={aiText}
                onChange={(event) => setAiText(event.target.value)}
                placeholder="Ex. Coffee shop, open 6am–3pm weekdays and 7–2 weekends. Two baristas and a shift lead at open, one barista mid."
              />
              {aiError && <p className="setup__ai-error">{aiError}</p>}
              <div className="setup__actions">
                <button type="button" className="button-outline" onClick={() => { setAiMode(false); setAiError(''); }}>
                  Pick from the list
                </button>
                <Button type="button" onClick={generateFromDescription} disabled={aiBusy || aiText.trim().length < 8}>
                  {aiBusy ? 'Generating…' : 'Generate my setup'}
                </Button>
              </div>
            </div>
          ) : (
          <>
          <div className="setup__templates" role="radiogroup" aria-label="Business type">
            {SETUP_TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                role="radio"
                aria-checked={templateId === template.id}
                className={`setup__template ${templateId === template.id ? 'is-active' : ''}`.trim()}
                onClick={() => setTemplateId(template.id)}
              >
                <strong>{template.label}</strong>
                <span>{template.description}</span>
                <span className="setup__template-meta">
                  {template.roles.join(' · ')}
                </span>
              </button>
            ))}
            {aiEnabled && (
              <button
                type="button"
                role="radio"
                aria-checked={false}
                className="setup__template setup__template--other"
                onClick={() => { setAiMode(true); setAiError(''); }}
              >
                <strong>Something else</strong>
                <span>Describe your business and we'll build the setup for you.</span>
              </button>
            )}
          </div>

          <div className="setup__field">
            <span className="setup__field-label">Which day does your scheduling week start?</span>
            <div className="setup__day-chips" role="group" aria-label="Week starts on">
              {DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  aria-pressed={weekStartsOn === day}
                  className={`setup__day-chip ${weekStartsOn === day ? 'is-active' : ''}`.trim()}
                  onClick={() => setWeekStartsOn(day)}
                >
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          <div className="setup__actions">
            <button type="button" className="button-outline" onClick={skipToSettings}>
              Set up manually
            </button>
            <Button type="button" onClick={commitTemplate} disabled={!templateId || !weekStartsOn}>
              Continue
            </Button>
          </div>
          </>
          )}
        </ContentPanel>
      )}

      {step === 'hours' && (
        <ContentPanel className="setup__card">
          <h2 ref={stepHeadingRef} tabIndex={-1} className="setup__step-heading">Confirm your hours</h2>
          <p className="setup__hint">
            {aiSummary || 'We filled these in from the template. Fix any that are off.'}
          </p>
          <div className="setup__hours">
            {DAYS.map((day) => (
              <DayHoursRow
                key={day}
                day={day}
                hours={settings.operatingHours[day] ?? { isOpen: false, openTime: '', closeTime: '' }}
                onChangeTime={(field, value) => updateHours(day, field, value)}
                onToggle={() => toggleDay(day)}
                onApplyToAll={() => applyHoursToAll(day)}
              />
            ))}
          </div>
          <div className="setup__actions">
            <button type="button" className="button-outline" onClick={goBack}>Back</button>
            <Button type="button" onClick={goNext} disabled={openDays.length === 0}>Continue</Button>
          </div>
        </ContentPanel>
      )}

      {step === 'coverage' && (
        <ContentPanel className="setup__card">
          <h2 ref={stepHeadingRef} tabIndex={-1} className="setup__step-heading">Confirm coverage targets</h2>
          <p className="setup__hint">
            How many of each role you need per shift. The template's a starting point — tune it or move on.
          </p>
          <label className="setup__field-label" htmlFor="setup-coverage-role">Role</label>
          <select
            id="setup-coverage-role"
            className="setup__select"
            value={activeCoverageRole}
            onChange={(event) => setCoverageRole(event.target.value)}
          >
            {teamRoles.map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>

          <details className="setup__shift-times">
            <summary>Adjust shift times</summary>
            <p className="setup__shift-times-hint">
              Optional. Shift labels and times can also be changed later in Settings.
            </p>
            <div className="setup__shift-times-grid">
              {shiftTypes.map((shift) => {
                const times = settings.shiftTimes?.[shift] ?? { startTime: '', endTime: '' };

                return (
                  <div key={shift} className="setup__shift-times-row">
                    <strong>{shift}</strong>
                    <label>
                      <span>Start</span>
                      <input
                        type="time"
                        min="00:00"
                        max="23:59"
                        value={times.startTime ?? ''}
                        onChange={(event) => updateShiftTime(shift, 'startTime', event.target.value)}
                      />
                    </label>
                    <label>
                      <span>End</span>
                      <input
                        type="time"
                        min="00:00"
                        max="23:59"
                        value={times.endTime ?? ''}
                        onChange={(event) => updateShiftTime(shift, 'endTime', event.target.value)}
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          </details>

          <div className="setup__coverage">
            {DAYS.map((day) => (
              <CoverageDayRow
                key={day}
                day={day}
                isClosed={!settings.operatingHours?.[day]?.isOpen}
                settings={settings}
                shiftTypes={shiftTypes}
                values={coverageRow(day)}
                onChange={(shift, value) => updateCoverage(day, shift, value)}
                onApplyToAll={() => applyCoverageToAll(day)}
              />
            ))}
          </div>
          <div className="setup__actions">
            <button type="button" className="button-outline" onClick={goBack}>Back</button>
            <Button type="button" onClick={goNext}>Continue</Button>
          </div>
        </ContentPanel>
      )}

      {step === 'team' && (
        <ContentPanel className="setup__card">
          <h2 ref={stepHeadingRef} tabIndex={-1} className="setup__step-heading">Add your team</h2>
          <p className="setup__hint">Just names and roles for now — availability defaults to fully open and can be set later.</p>

          {addedTeam.length > 0 && (
            <ul className="setup__team-list">
              {addedTeam.map((member) => (
                <li key={member.id}>
                  <strong>{member.name}</strong>
                  <span>{member.roles.join(' · ')}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="setup__team-form">
            <InputField
              label="Name"
              name="setup-team-name"
              value={teamDraft.name}
              onChange={(value) => setTeamDraft((draft) => ({ ...draft, name: value }))}
              placeholder="Ex. Sam Rivera"
            />
            <div className="setup__field">
              <span className="setup__field-label">Roles</span>
              <div className="setup__day-chips">
                {teamRoles.map((role) => (
                  <button
                    key={role}
                    type="button"
                    aria-pressed={teamDraft.roles.includes(role)}
                    className={`setup__day-chip ${teamDraft.roles.includes(role) ? 'is-active' : ''}`.trim()}
                    onClick={() => toggleDraftRole(role)}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              className="button-outline"
              onClick={addTeamMember}
              disabled={!teamDraft.name.trim() || teamDraft.roles.length === 0}
            >
              <i className="fas fa-plus" aria-hidden="true" /> Add to team
            </button>
          </div>

          <p className="setup__team-bulk">
            Got a whole roster?{' '}
            <button type="button" className="setup__link" onClick={() => navigate('/team')}>
              Import a CSV or scan IDs on the Team page
            </button>
            . You can come back here to finish.
          </p>

          <div className="setup__actions">
            <button type="button" className="button-outline" onClick={goBack}>Back</button>
            <Button type="button" onClick={goNext}>
              {addedTeam.length > 0 ? 'Continue' : 'Skip for now'}
            </Button>
          </div>
        </ContentPanel>
      )}

      {step === 'build' && (
        <ContentPanel className="setup__card">
          <h2 ref={stepHeadingRef} tabIndex={-1} className="setup__step-heading">You're set up</h2>
          <ul className="setup__summary">
            <li><strong>{openDays.length}</strong> open {openDays.length === 1 ? 'day' : 'days'} a week</li>
            <li><strong>{rolesWithTargets.length}</strong> {rolesWithTargets.length === 1 ? 'role' : 'roles'} with coverage targets</li>
            <li><strong>{activeEmployeeCount}</strong> team {activeEmployeeCount === 1 ? 'member' : 'members'}</li>
          </ul>
          <p className="setup__hint">
            {activeEmployeeCount > 0 && rolesWithTargets.length > 0
              ? 'Build this week now and we’ll assign people automatically — you review and publish.'
              : 'Open the builder to start assigning shifts for this week.'}
          </p>
          <div className="setup__actions setup__actions--stack">
            <Button
              type="button"
              onClick={() => finishToBuilder({ autoBuild: true })}
              disabled={building || activeEmployeeCount === 0 || rolesWithTargets.length === 0}
            >
              Build my first week
            </Button>
            <button
              type="button"
              className="button-outline"
              onClick={() => finishToBuilder({ autoBuild: false })}
              disabled={building}
            >
              Open the builder
            </button>
          </div>
        </ContentPanel>
      )}
    </div>
  );
};
