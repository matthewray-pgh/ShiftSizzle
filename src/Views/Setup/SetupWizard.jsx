import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, ContentPanel, InputField } from '../../Components';
import {
  DAYS,
  getCurrentWeekStartDate,
  getOpenDays,
  getSchedulerReadiness,
  getShiftTypes,
  getTeamRoles,
  useAppState,
} from '../../state/AppState';
import {
  BusinessHoursFields,
  CoverageTargetsFields,
  ShiftTypesFields,
  TeamRolesFields,
  useSettingsForm,
} from '../Settings/SettingsFields';
import {
  SETUP_TEMPLATES,
  getSetupTemplate,
  settingsFromTemplate,
} from '../../state/setupTemplates';
import { AI_UNAVAILABLE, requestAiSetup, requestTunedCoverage } from '../../state/aiAssist';
import { supabase } from '../../lib/supabaseClient';

import './SetupWizard.scss';

// The guided walk (hours -> coverage) is literally the Settings page's
// own field components, one at a time, each step's Continue committing
// immediately — see multi-location-... no, see the Settings/setup-wizard
// review: reusing the same components is what keeps "edit hours" (etc.)
// from having two implementations that quietly drift apart.
const STEPS = ['template', 'hours', 'shiftTypes', 'teamRoles', 'coverage', 'team', 'build'];
const STEP_LABEL = {
  template: 'Business type',
  hours: 'Hours',
  shiftTypes: 'Shift types',
  teamRoles: 'Team roles',
  coverage: 'Coverage',
  team: 'Team',
  build: 'Build',
};

const fullAvailability = (shiftTypes) => Object.fromEntries(DAYS.map((day) => [day, [...shiftTypes]]));

// The first step whose requirement isn't met yet — so re-entering the
// wizard after finishing part of it resumes where it left off rather than
// starting over (and re-committing a template would clobber earlier edits).
// Shift types and team roles always have a usable default the moment a
// template is committed, so they're worth a review stop but never block
// resuming past them.
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
  const f = useSettingsForm(state);

  // Rendered inside <HydrationGate>, so `state` is already loaded here.
  const [step, setStep] = useState(() => firstIncompleteStep(getSchedulerReadiness(state)));
  const [templateId, setTemplateId] = useState('');
  const [teamDraft, setTeamDraft] = useState({ name: '', roles: [] });
  const [addedTeam, setAddedTeam] = useState([]);
  const [building, setBuilding] = useState(false);

  // "Describe your business" — the AI setup path, offered ahead of the
  // templates. `aiEnabled` flips off for the rest of the session once the
  // Edge Function answers "not deployed", leaving just the templates.
  const [aiEnabled, setAiEnabled] = useState(true);
  const [aiText, setAiText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiSummary, setAiSummary] = useState('');

  // Optional "adjust these for my location" on the coverage step — changes
  // only the headcounts, keeping the roles/shifts/hours.
  const [sizeHint, setSizeHint] = useState('');
  const [tuning, setTuning] = useState(false);
  const [tuneNote, setTuneNote] = useState('');

  const shiftTypes = getShiftTypes(settings);
  const teamRoles = getTeamRoles(settings, employees);
  const openDays = getOpenDays(settings);

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
  // Direction drives the per-step slide animation (forward from the right,
  // Back from the left).
  const [direction, setDirection] = useState('next');
  const goNext = () => {
    setDirection('next');
    setStep(STEPS[Math.min(stepIndex + 1, STEPS.length - 1)]);
  };
  const goBack = () => {
    setDirection('back');
    setStep(STEPS[Math.max(stepIndex - 1, 0)]);
  };
  const goToStep = (target) => {
    const targetIndex = STEPS.indexOf(target);

    if (targetIndex < 0 || targetIndex === stepIndex) {
      return;
    }

    setDirection(targetIndex > stepIndex ? 'next' : 'back');
    setStep(target);
  };

  // A guided-walk step (hours/shiftTypes/teamRoles/coverage) commits its
  // slice of the shared draft immediately on Continue, the same way the old
  // per-step dispatches did — so `state.settings` (and the outer
  // `teamRoles`/`shiftTypes`/`openDays` above) stay current for later steps.
  const commitAndAdvance = () => {
    dispatch({ type: 'UPDATE_SETTINGS', payload: f.form });
    goNext();
  };

  // ---- Step 1: describe the business, or pick a template ----
  // Either path commits a week start too (the current one, else Monday) so
  // the live canvas has a real week for autosave to write against; the
  // Hours step is where the manager confirms or changes it.
  const selectCurrentWeek = (weekStartsOn) => {
    const currentWeek = getCurrentWeekStartDate(weekStartsOn);

    if (currentWeek) {
      dispatch({ type: 'SELECT_WEEK', payload: { startDate: currentWeek } });
    }
  };

  const commitTemplate = () => {
    const weekStartsOn = settings.weekStartsOn || 'Monday';
    const base = settingsFromTemplate(templateId, { currentSettings: settings, weekStartsOn });

    if (!base) {
      return;
    }

    dispatch({ type: 'UPDATE_SETTINGS', payload: base });
    selectCurrentWeek(weekStartsOn);
    setAiSummary('');
    setTuneNote('');
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
      setAiError('');
      return;
    }

    if (result.error) {
      setAiError(result.error);
      return;
    }

    dispatch({ type: 'UPDATE_SETTINGS', payload: result.payload });
    selectCurrentWeek(result.payload.weekStartsOn);
    setTemplateId('');
    setAiSummary(result.summary);
    setTuneNote('');
    goNext();
  };

  // ---- Step: hours (shared with Settings > Business Hours) ----
  // Also where the week start is confirmed, so the week is re-selected in
  // case it moved.
  const commitHours = () => {
    dispatch({ type: 'UPDATE_SETTINGS', payload: f.form });
    selectCurrentWeek(f.form.weekStartsOn);
    goNext();
  };

  // ---- Step: coverage (shared with Settings > Coverage Targets) ----
  // Asks the AI for headcounts that fit the note and applies them to every
  // open day, leaving roles, shifts and hours alone.
  const tuneCoverage = async () => {
    const note = sizeHint.trim();

    if (!note) {
      return;
    }

    setTuning(true);
    setTuneNote('');

    const result = await requestTunedCoverage(supabase, {
      templateLabel: getSetupTemplate(templateId)?.label || settings.businessName || 'A small business',
      roles: f.form.teamRoles,
      shiftTypes: f.form.shiftTypes,
      note,
      currentSettings: settings,
    });

    setTuning(false);

    if (result.error === AI_UNAVAILABLE) {
      setAiEnabled(false);
      return;
    }

    if (result.error) {
      setTuneNote(`Couldn't adjust staffing — your numbers are unchanged. ${result.error}`);
      return;
    }

    const roleCoverage = { ...(f.form.roleCoverage ?? {}) };

    Object.entries(result.coverageByRole).forEach(([role, byShift]) => {
      roleCoverage[role] = Object.fromEntries(DAYS.map((day) => [
        day,
        { ...(roleCoverage[role]?.[day] ?? {}), ...(f.form.operatingHours?.[day]?.isOpen ? byShift : {}) },
      ]));
    });

    f.updateForm('roleCoverage', roleCoverage);
    setTuneNote(result.summary || 'Staffing adjusted for your location.');
  };

  const formOpenDays = getOpenDays(f.form);

  // ---- Step: team ----
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

  // ---- Step: build ----
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
    const currentWeek = getCurrentWeekStartDate(settings.weekStartsOn || 'Monday');

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
    <div className="setup" data-dir={direction}>
      <div className="setup__head">
        <h1>Set up your schedule</h1>
        <p>Pick your business type and we'll fill in the hours, roles, and coverage — you review and adjust.</p>
        <ol className="setup__progress" aria-label="Setup progress">
          {STEPS.map((entry, index) => {
            const isCurrent = index === stepIndex;
            // Every step but the first is unreachable until a template (or
            // the AI) has been committed — before that there are no settings
            // to review.
            const locked = index !== 0 && !settings.weekStartsOn;

            return (
              <li
                key={entry}
                className={`setup__progress-step ${isCurrent ? 'is-current' : ''} ${index < stepIndex ? 'is-done' : ''} ${locked ? 'is-locked' : ''}`.trim()}
              >
                <button
                  type="button"
                  className="setup__progress-button"
                  onClick={() => goToStep(entry)}
                  disabled={locked || isCurrent || tuning}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  <span className="setup__progress-dot" aria-hidden="true">{index < stepIndex ? '✓' : index + 1}</span>
                  {STEP_LABEL[entry]}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {step === 'template' && (
        <ContentPanel className="setup__card">
          <h2 ref={stepHeadingRef} tabIndex={-1} className="setup__step-heading">What kind of business is this?</h2>

          {aiEnabled && (
            <div className="setup__ai">
              <label className="setup__field-label" htmlFor="setup-ai-description">
                Tell us about your business
              </label>
              <textarea
                id="setup-ai-description"
                className="setup__ai-input"
                rows={3}
                value={aiText}
                onChange={(event) => setAiText(event.target.value)}
                placeholder="Ex. Coffee shop, open 6am–3pm weekdays and 7–2 weekends. Two baristas and a shift lead at open, one barista mid."
              />
              {aiError && <p className="setup__ai-error">{aiError}</p>}
              <div className="setup__actions">
                <Button type="button" onClick={generateFromDescription} disabled={aiBusy || aiText.trim().length < 8}>
                  {aiBusy ? 'Generating…' : 'Generate my setup'}
                </Button>
              </div>
            </div>
          )}

          <div className="setup__field">
            <span className="setup__field-label">
              {aiEnabled ? 'Or start from a common setup' : 'Start from a common setup'}
            </span>
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
            </div>
          </div>

          <div className="setup__actions">
            <Button type="button" onClick={commitTemplate} disabled={!templateId || aiBusy}>Continue</Button>
          </div>

          <p className="setup__manual">
            Prefer to enter everything yourself?{' '}
            <button type="button" className="setup__link" onClick={skipToSettings}>Set up manually</button>
          </p>
        </ContentPanel>
      )}

      {step === 'hours' && (
        <ContentPanel className="setup__card">
          <h2 ref={stepHeadingRef} tabIndex={-1} className="setup__step-heading">Confirm your hours</h2>
          <p className="setup__hint">
            {aiSummary || 'We filled these in from the template. Fix any that are off, and pick the day your week starts.'}
          </p>

          <div className="setup__field">
            <span className="setup__field-label">Which day does your scheduling week start?</span>
            <div className="setup__day-chips" role="group" aria-label="Week starts on">
              {DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  aria-pressed={f.form.weekStartsOn === day}
                  className={`setup__day-chip ${f.form.weekStartsOn === day ? 'is-active' : ''}`.trim()}
                  onClick={() => f.updateForm('weekStartsOn', day)}
                >
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          <BusinessHoursFields f={f} />

          <div className="setup__actions">
            <button type="button" className="button-outline" onClick={goBack}>Back</button>
            <Button type="button" onClick={commitHours} disabled={formOpenDays.length === 0 || !f.form.weekStartsOn}>Continue</Button>
          </div>
        </ContentPanel>
      )}

      {step === 'shiftTypes' && (
        <ContentPanel className="setup__card">
          <h2 ref={stepHeadingRef} tabIndex={-1} className="setup__step-heading">Confirm your shift types</h2>
          <p className="setup__hint">These came from the template too. Add, remove, or set times.</p>

          <ShiftTypesFields f={f} />

          <div className="setup__actions">
            <button type="button" className="button-outline" onClick={goBack}>Back</button>
            <Button type="button" onClick={commitAndAdvance} disabled={f.form.shiftTypes.length === 0}>Continue</Button>
          </div>
        </ContentPanel>
      )}

      {step === 'teamRoles' && (
        <ContentPanel className="setup__card">
          <h2 ref={stepHeadingRef} tabIndex={-1} className="setup__step-heading">Confirm your team roles</h2>
          <p className="setup__hint">Also from the template. Add any you're missing, or remove ones you don't use.</p>

          <TeamRolesFields f={f} />

          <div className="setup__actions">
            <button type="button" className="button-outline" onClick={goBack}>Back</button>
            <Button type="button" onClick={commitAndAdvance} disabled={f.form.teamRoles.length === 0}>Continue</Button>
          </div>
        </ContentPanel>
      )}

      {step === 'coverage' && (
        <ContentPanel className="setup__card">
          <h2 ref={stepHeadingRef} tabIndex={-1} className="setup__step-heading">Confirm coverage targets</h2>
          <p className="setup__hint">
            {tuneNote || 'How many people each shift needs. Tap a shift to change its roles.'}
          </p>

          <CoverageTargetsFields f={f} />

          {aiEnabled && (
            <details className="setup__tune">
              <summary>Adjust these for my location</summary>
              <label className="setup__field-label" htmlFor="setup-size-hint">
                What should we know about your location?
              </label>
              <textarea
                id="setup-size-hint"
                className="setup__ai-input"
                rows={2}
                value={sizeHint}
                onChange={(event) => setSizeHint(event.target.value)}
                placeholder="Ex. We seat about 60, dinner is our busy service, two turns on weekends."
              />
              <p className="setup__shift-times-hint">
                We'll change the headcounts on every open day to match. Roles, shifts, and hours stay as they are.
              </p>
              <div>
                <button type="button" className="button-outline" onClick={tuneCoverage} disabled={tuning || !sizeHint.trim()}>
                  {tuning ? 'Adjusting…' : 'Adjust staffing'}
                </button>
              </div>
            </details>
          )}

          <div className="setup__actions">
            <button type="button" className="button-outline" onClick={goBack}>Back</button>
            <Button type="button" onClick={commitAndAdvance}>Continue</Button>
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
          {activeEmployeeCount === 0 ? (
            <p className="setup__warning">
              <i className="fas fa-triangle-exclamation" aria-hidden="true" />
              You don't have any team members yet — add some before building a schedule.{' '}
              <button type="button" className="setup__link" onClick={() => goToStep('team')}>
                Go back to Team
              </button>
            </p>
          ) : rolesWithTargets.length === 0 ? (
            <p className="setup__warning">
              <i className="fas fa-triangle-exclamation" aria-hidden="true" />
              No coverage targets are set yet — add some before building a schedule.{' '}
              <button type="button" className="setup__link" onClick={() => goToStep('coverage')}>
                Go back to Coverage
              </button>
            </p>
          ) : (
            <p className="setup__hint">
              Build this week now and we’ll assign people automatically — you review and publish.
            </p>
          )}
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
