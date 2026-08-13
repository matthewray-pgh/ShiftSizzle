import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, CircleAlert, Sparkles, Users } from 'lucide-react';

// ---------------------------------------------------------------------------
// Mock data — mirrors ShiftSizzle's real shape closely enough to validate
// the interaction pattern: role becomes a FILTER over one shared week,
// instead of each role being its own restart of the whole flow.
// ---------------------------------------------------------------------------

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHIFTS = ['Open', 'Mid', 'Close'];
const ROLES = ['Manager', 'Bartender', 'Server'];

const EMPLOYEES = [
  { id: 1, name: 'Jen Ray', role: 'Manager', shiftsPerWeek: 5 },
  { id: 2, name: 'Ryan Sutton', role: 'Manager', shiftsPerWeek: 5 },
  { id: 3, name: 'Kayla Brooks', role: 'Bartender', shiftsPerWeek: 4 },
  { id: 4, name: 'Marcus Webb', role: 'Bartender', shiftsPerWeek: 4 },
  { id: 5, name: 'Ariana Cole', role: 'Server', shiftsPerWeek: 4 },
  { id: 6, name: 'Devon Price', role: 'Server', shiftsPerWeek: 3 },
];

const emptyGrid = () =>
  Object.fromEntries(DAYS.map((d) => [d, Object.fromEntries(SHIFTS.map((s) => [s, 0]))]));

const emptyAssignments = () =>
  Object.fromEntries(EMPLOYEES.map((e) => [e.id, Object.fromEntries(DAYS.map((d) => [d, []]))]));

// ---------------------------------------------------------------------------
// Mobile-first CSS. Base rules target a phone-width screen with no
// horizontal layout, stacked cards, and full-width tap targets. Wider
// layouts are added on top via min-width queries, not the other way
// around — nothing here assumes desktop space by default.
// ---------------------------------------------------------------------------

const CSS = `
.wc-app {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #f6f7fb;
  color: #0f1729;
  padding: 14px 12px 60px;
  max-width: 880px;
  margin: 0 auto;
  position: relative;
}
.wc-toast {
  position: fixed;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  background: #0f1729;
  color: #fff;
  padding: 9px 14px;
  border-radius: 10px;
  font-size: 12.5px;
  font-weight: 600;
  z-index: 50;
  box-shadow: 0 8px 24px rgba(15,23,41,0.25);
  max-width: 90vw;
  text-align: center;
}

/* ---- header: stacked on mobile, side-by-side from 640px up ---- */
.wc-header { margin-bottom: 14px; }
.wc-eyebrow { font-size: 10.5px; font-weight: 800; letter-spacing: .06em; color: #ea580c; margin-bottom: 4px; }
.wc-h1 { font-size: 22px; margin: 0; font-weight: 800; }
.wc-subhead { font-size: 13px; color: #5b6472; margin: 6px 0 12px; }
.wc-stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.wc-stat-card {
  background: #fff; border-radius: 12px; padding: 8px 6px;
  display: flex; flex-direction: column; gap: 2px; border: 1px solid #e6e8ef;
  align-items: center; text-align: center;
}
.wc-stat-label { font-size: 10.5px; color: #8a92a3; font-weight: 600; }
.wc-stat-value { font-size: 19px; font-weight: 800; }
@media (min-width: 640px) {
  .wc-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; }
  .wc-subhead { max-width: 340px; margin-bottom: 0; }
  .wc-stat-grid { display: flex; gap: 10px; }
  .wc-stat-card { min-width: 74px; padding: 10px 14px; }
}

/* ---- checklist: pills wrap, actions become a full-width 2-up row on mobile ---- */
.wc-checklist {
  background: #fff; border: 1px solid #e6e8ef; border-radius: 14px;
  padding: 10px; margin-bottom: 14px; position: sticky; top: 6px; z-index: 10;
  box-shadow: 0 2px 10px rgba(15,23,41,0.05);
}
.wc-checklist-pills { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.wc-checklist-item {
  display: flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 700;
  color: #8a92a3; background: #f3f4f8; padding: 5px 9px; border-radius: 999px;
}
.wc-checklist-item.done { color: #166534; background: #ecfdf3; }
.wc-checklist-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.wc-btn-secondary, .wc-btn-primary {
  border: none; font-weight: 700; font-size: 13px; padding: 10px 14px;
  border-radius: 10px; cursor: pointer; width: 100%;
}
.wc-btn-secondary { border: 1px solid #d7dae2; background: #fff; color: #0f1729; }
.wc-btn-primary { background: #ea580c; color: #fff; }
.wc-btn-primary:disabled { opacity: .45; cursor: not-allowed; }
@media (min-width: 640px) {
  .wc-checklist { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .wc-checklist-pills { margin-bottom: 0; }
  .wc-checklist-actions { display: flex; gap: 8px; margin-left: auto; }
  .wc-btn-secondary, .wc-btn-primary { width: auto; }
}

/* ---- role tabs: horizontal scroll strip on mobile, no wrapping/crowding ---- */
.wc-role-tabs {
  display: flex; gap: 8px; margin-bottom: 14px;
  overflow-x: auto; -webkit-overflow-scrolling: touch; padding-bottom: 2px;
}
.wc-role-tab {
  border: 1px solid #e6e8ef; background: #fff; color: #5b6472; font-weight: 700;
  font-size: 13px; padding: 8px 14px; border-radius: 999px; cursor: pointer;
  display: flex; align-items: center; gap: 6px; white-space: nowrap; flex: 0 0 auto;
}
.wc-role-tab.active { background: #0f1729; color: #fff; border-color: #0f1729; }
.wc-role-tab-badge { background: #fee2e2; color: #dc2626; font-size: 10px; font-weight: 800; padding: 1px 6px; border-radius: 999px; }

/* ---- role card ---- */
.wc-role-card { background: #fff; border: 1px solid #e6e8ef; border-radius: 16px; margin-bottom: 14px; overflow: hidden; }
.wc-role-card-header {
  width: 100%; display: flex; justify-content: space-between; align-items: center;
  padding: 13px 14px; background: none; border: none; cursor: pointer; text-align: left; gap: 8px;
}
.wc-role-card-header-left { display: flex; align-items: center; gap: 8px; font-size: 14.5px; min-width: 0; }
.wc-role-card-header-left strong { white-space: nowrap; }
.wc-muted-small { font-size: 11.5px; color: #8a92a3; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wc-role-card-header-right { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
.wc-gap-pill { background: #fef2f2; color: #dc2626; font-size: 11px; font-weight: 800; padding: 4px 9px; border-radius: 999px; white-space: nowrap; }
.wc-ok-pill { background: #ecfdf3; color: #16a34a; font-size: 11px; font-weight: 800; padding: 4px 9px; border-radius: 999px; white-space: nowrap; }
.wc-role-card-body { padding: 2px 14px 16px; border-top: 1px solid #eef0f4; }
.wc-section-row { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
.wc-h3 { font-size: 14px; margin: 0; font-weight: 800; }
.wc-ghost-btn {
  display: flex; align-items: center; justify-content: center; border: 1px solid #ea580c;
  background: #fff7ed; color: #ea580c; font-weight: 700; font-size: 12.5px;
  padding: 9px 12px; border-radius: 10px; cursor: pointer; width: 100%;
}
@media (min-width: 640px) {
  .wc-section-row { flex-direction: row; justify-content: space-between; align-items: center; }
  .wc-ghost-btn { width: auto; white-space: nowrap; }
}

/* ---- coverage targets: stacked day-cards on mobile (matches the pattern
   that already worked in the real Team availability editor), collapses
   into a compact table once there's room ---- */
.wc-coverage-list { margin-top: 10px; display: grid; gap: 8px; }
.wc-coverage-day-card { border: 1px solid #eef0f4; border-radius: 12px; padding: 10px 12px; }
.wc-coverage-day-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.wc-coverage-day-name { font-size: 13px; font-weight: 800; }
.wc-apply-link { border: none; background: none; color: #ea580c; font-size: 11.5px; font-weight: 700; cursor: pointer; padding: 4px 0; }
.wc-coverage-shift-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.wc-coverage-shift { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.wc-coverage-shift-label { font-size: 10.5px; color: #8a92a3; font-weight: 700; }
.wc-number-input {
  width: 100%; text-align: center; border: 1px solid #dfe2ea; border-radius: 8px;
  padding: 8px 2px; font-size: 14px;
}
@media (min-width: 720px) {
  .wc-coverage-list { grid-template-columns: 1fr; }
  .wc-coverage-day-card { display: grid; grid-template-columns: 90px repeat(3, 1fr) 90px; align-items: center; gap: 8px; padding: 8px 10px; }
  .wc-coverage-day-head { margin-bottom: 0; }
  .wc-coverage-shift-row { display: contents; }
  .wc-coverage-shift { flex-direction: row; }
  .wc-coverage-shift-label { display: none; }
  .wc-apply-link { text-align: right; }
}

/* ---- assignments: already-good stacked pattern, kept as the base case ---- */
.wc-assign-grid { display: grid; gap: 10px; margin-top: 10px; }
.wc-emp-card { border: 1px solid #eef0f4; border-radius: 12px; padding: 12px; }
.wc-emp-header { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; gap: 8px; }
.wc-emp-days { display: grid; gap: 6px; }
.wc-emp-day-row { display: flex; align-items: center; gap: 10px; }
.wc-emp-day-label { width: 30px; font-size: 11px; color: #8a92a3; font-weight: 700; flex: 0 0 auto; }
.wc-emp-day-shifts { display: flex; gap: 6px; flex: 1; }
.wc-shift-toggle {
  flex: 1; border: 1px solid #dfe2ea; background: #fff; color: #5b6472; font-size: 11px;
  font-weight: 700; padding: 8px 0; border-radius: 8px; cursor: pointer;
}
.wc-shift-toggle.active { background: #ea580c; border-color: #ea580c; color: #fff; }
@media (min-width: 560px) {
  .wc-assign-grid { grid-template-columns: repeat(2, 1fr); }
}
`;

// ---------------------------------------------------------------------------

export default function WeeklyCanvasPOC() {
  const [requirements, setRequirements] = useState(() =>
    Object.fromEntries(ROLES.map((r) => [r, emptyGrid()]))
  );
  const [assignments, setAssignments] = useState(() =>
    Object.fromEntries(ROLES.map((r) => [r, emptyAssignments()]))
  );
  const [saved, setSaved] = useState(false);
  const [published, setPublished] = useState(false);
  const [activeRole, setActiveRole] = useState('All');
  const [toast, setToast] = useState(null);

  const flash = (msg) => {
    setToast(msg);
    window.clearTimeout(flash._t);
    flash._t = window.setTimeout(() => setToast(null), 1800);
  };

  const markDirty = () => {
    setSaved(false);
    setPublished(false);
  };

  const roleStats = useMemo(() => {
    return Object.fromEntries(
      ROLES.map((role) => {
        const req = requirements[role];
        const asg = assignments[role];
        const roleEmployees = EMPLOYEES.filter((e) => e.role === role);
        let required = 0;
        let filled = 0;
        DAYS.forEach((day) => {
          SHIFTS.forEach((shift) => {
            const need = req[day][shift] || 0;
            required += need;
            const have = roleEmployees.reduce(
              (n, e) => n + (asg[e.id][day].includes(shift) ? 1 : 0),
              0
            );
            filled += Math.min(have, need);
          });
        });
        return [role, { required, filled, open: Math.max(required - filled, 0) }];
      })
    );
  }, [requirements, assignments]);

  const totals = useMemo(
    () =>
      Object.values(roleStats).reduce(
        (acc, s) => ({
          required: acc.required + s.required,
          filled: acc.filled + s.filled,
          open: acc.open + s.open,
        }),
        { required: 0, filled: 0, open: 0 }
      ),
    [roleStats]
  );

  const demandSet = totals.required > 0;
  const coverageComplete = demandSet && totals.open === 0;

  const setReq = (role, day, shift, value) => {
    const n = Math.max(0, Number(value) || 0);
    setRequirements((prev) => ({
      ...prev,
      [role]: { ...prev[role], [day]: { ...prev[role][day], [shift]: n } },
    }));
    markDirty();
  };

  const applyToAllDays = (role, sourceDay) => {
    setRequirements((prev) => ({
      ...prev,
      [role]: Object.fromEntries(DAYS.map((d) => [d, { ...prev[role][sourceDay] }])),
    }));
    markDirty();
    flash(`Applied ${sourceDay}'s targets to every day`);
  };

  const toggleAssignment = (role, employeeId, day, shift) => {
    setAssignments((prev) => {
      const current = prev[role][employeeId][day];
      const next = current.includes(shift)
        ? current.filter((s) => s !== shift)
        : [...current, shift];
      return {
        ...prev,
        [role]: {
          ...prev[role],
          [employeeId]: { ...prev[role][employeeId], [day]: next },
        },
      };
    });
    markDirty();
  };

  const autoBuild = (role) => {
    setAssignments((prev) => {
      const roleEmployees = EMPLOYEES.filter((e) => e.role === role);
      const next = { ...prev[role] };
      const loadCount = Object.fromEntries(roleEmployees.map((e) => [e.id, 0]));

      const gaps = [];
      DAYS.forEach((day) => {
        SHIFTS.forEach((shift) => {
          const need = requirements[role][day][shift] || 0;
          const have = roleEmployees.filter((e) => next[e.id][day].includes(shift)).length;
          if (need > have) gaps.push({ day, shift, remaining: need - have });
        });
      });
      gaps.sort((a, b) => b.remaining - a.remaining);

      gaps.forEach(({ day, shift, remaining }) => {
        let toFill = remaining;
        const candidates = [...roleEmployees].sort((a, b) => loadCount[a.id] - loadCount[b.id]);
        for (const emp of candidates) {
          if (toFill <= 0) break;
          const already = next[emp.id][day];
          const totalAssigned = DAYS.reduce((n, d) => n + next[emp.id][d].length, 0);
          if (already.includes(shift) || totalAssigned >= emp.shiftsPerWeek) continue;
          next[emp.id] = { ...next[emp.id], [day]: [...already, shift] };
          loadCount[emp.id] += 1;
          toFill -= 1;
        }
      });

      return { ...prev, [role]: next };
    });
    markDirty();
    flash(`Generated a balanced draft for ${role}`);
  };

  const saveDraft = () => {
    setSaved(true);
    flash('Draft saved for the whole week');
  };

  const publishWeek = () => {
    setPublished(true);
    flash('Published — every role is live for the team');
  };

  const rolesToShow = activeRole === 'All' ? ROLES : [activeRole];

  return (
    <div className="wc-app">
      <style>{CSS}</style>
      {toast && <div className="wc-toast">{toast}</div>}

      <div className="wc-header">
        <div>
          <div className="wc-eyebrow">WEEKLY CANVAS — PROTOTYPE</div>
          <h1 className="wc-h1">Jul 5 – Jul 11, 2026</h1>
          <p className="wc-subhead">
            One week, every role. Switching roles below just filters this view — nothing resets.
          </p>
        </div>
        <div className="wc-stat-grid">
          <Stat label="Required" value={totals.required} tone="neutral" />
          <Stat label="Filled" value={totals.filled} tone="good" />
          <Stat label="Open" value={totals.open} tone={totals.open ? 'bad' : 'good'} />
        </div>
      </div>

      <div className="wc-checklist">
        <div className="wc-checklist-pills">
          <ChecklistItem done={demandSet} label="Demand set" />
          <ChecklistItem
            done={coverageComplete}
            label={
              coverageComplete
                ? 'Coverage complete'
                : `Coverage: ${totals.open} open ${totals.open === 1 ? 'slot' : 'slots'}`
            }
          />
          <ChecklistItem done={saved} label={saved ? 'Draft saved' : 'Unsaved changes'} />
          <ChecklistItem done={published} label={published ? 'Published' : 'Not published'} />
        </div>
        <div className="wc-checklist-actions">
          <button className="wc-btn-secondary" onClick={saveDraft}>
            Save draft
          </button>
          <button
            className="wc-btn-primary"
            disabled={!coverageComplete}
            onClick={publishWeek}
            title={coverageComplete ? 'Publish this week' : 'Resolve open slots first'}
          >
            Publish week
          </button>
        </div>
      </div>

      <div className="wc-role-tabs">
        <RoleTab
          label="All roles"
          active={activeRole === 'All'}
          onClick={() => setActiveRole('All')}
          badge={totals.open > 0 ? totals.open : null}
        />
        {ROLES.map((role) => (
          <RoleTab
            key={role}
            label={role}
            active={activeRole === role}
            onClick={() => setActiveRole(role)}
            badge={roleStats[role].open > 0 ? roleStats[role].open : null}
          />
        ))}
      </div>

      {rolesToShow.map((role) => (
        <RoleSection
          key={role}
          role={role}
          expanded={activeRole !== 'All'}
          stats={roleStats[role]}
          requirements={requirements[role]}
          assignments={assignments[role]}
          employees={EMPLOYEES.filter((e) => e.role === role)}
          onSetReq={(day, shift, val) => setReq(role, day, shift, val)}
          onApplyAllDays={(day) => applyToAllDays(role, day)}
          onToggleAssignment={(empId, day, shift) => toggleAssignment(role, empId, day, shift)}
          onAutoBuild={() => autoBuild(role)}
        />
      ))}
    </div>
  );
}

function Stat({ label, value, tone }) {
  const color = tone === 'bad' ? '#dc2626' : tone === 'good' ? '#16a34a' : '#0f1729';
  return (
    <div className="wc-stat-card">
      <span className="wc-stat-label">{label}</span>
      <strong className="wc-stat-value" style={{ color }}>
        {value}
      </strong>
    </div>
  );
}

function ChecklistItem({ done, label }) {
  return (
    <div className={`wc-checklist-item${done ? ' done' : ''}`}>
      <span style={{ display: 'inline-flex' }}>
        {done ? <Check size={12} strokeWidth={3} /> : <CircleAlert size={12} strokeWidth={2.4} />}
      </span>
      {label}
    </div>
  );
}

function RoleTab({ label, active, onClick, badge }) {
  return (
    <button className={`wc-role-tab${active ? ' active' : ''}`} onClick={onClick}>
      {label}
      {badge ? <span className="wc-role-tab-badge">{badge}</span> : null}
    </button>
  );
}

function RoleSection({
  role,
  expanded,
  stats,
  requirements,
  assignments,
  employees,
  onSetReq,
  onApplyAllDays,
  onToggleAssignment,
  onAutoBuild,
}) {
  const [open, setOpen] = useState(expanded);
  React.useEffect(() => setOpen(expanded), [expanded]);

  return (
    <div className="wc-role-card">
      <button
        className="wc-role-card-header"
        onClick={() => (expanded ? null : setOpen((o) => !o))}
      >
        <div className="wc-role-card-header-left">
          <Users size={16} color="#ea580c" />
          <strong>{role}</strong>
          <span className="wc-muted-small">
            {stats.filled}/{stats.required} filled · {employees.length}{' '}
            {employees.length === 1 ? 'person' : 'people'}
          </span>
        </div>
        <div className="wc-role-card-header-right">
          {stats.open > 0 ? (
            <span className="wc-gap-pill">{stats.open} open</span>
          ) : (
            <span className="wc-ok-pill">Covered</span>
          )}
          {!expanded && (
            <ChevronDown
              size={16}
              style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
            />
          )}
        </div>
      </button>

      {open && (
        <div className="wc-role-card-body">
          <div className="wc-section-row">
            <div>
              <h3 className="wc-h3">Coverage targets</h3>
              <p className="wc-muted-small">Set one day, then apply it everywhere.</p>
            </div>
            <button className="wc-ghost-btn" onClick={onAutoBuild}>
              <Sparkles size={14} style={{ marginRight: 6 }} />
              Generate draft
            </button>
          </div>

          <div className="wc-coverage-list">
            {DAYS.map((day) => (
              <div key={day} className="wc-coverage-day-card">
                <div className="wc-coverage-day-head">
                  <span className="wc-coverage-day-name">{day}</span>
                </div>
                <div className="wc-coverage-shift-row">
                  {SHIFTS.map((shift) => (
                    <div key={shift} className="wc-coverage-shift">
                      <span className="wc-coverage-shift-label">{shift}</span>
                      <input
                        type="number"
                        min={0}
                        value={requirements[day][shift]}
                        onChange={(e) => onSetReq(day, shift, e.target.value)}
                        className="wc-number-input"
                      />
                    </div>
                  ))}
                </div>
                <button className="wc-apply-link" onClick={() => onApplyAllDays(day)}>
                  Apply to all days
                </button>
              </div>
            ))}
          </div>

          <h3 className="wc-h3" style={{ marginTop: 20, marginBottom: 4 }}>
            Assignments
          </h3>
          <div className="wc-assign-grid">
            {employees.map((emp) => {
              const totalAssigned = DAYS.reduce((n, d) => n + assignments[emp.id][d].length, 0);
              const overCap = totalAssigned > emp.shiftsPerWeek;
              return (
                <div key={emp.id} className="wc-emp-card">
                  <div className="wc-emp-header">
                    <strong>{emp.name}</strong>
                    <span
                      className="wc-muted-small"
                      style={{ color: overCap ? '#dc2626' : undefined }}
                    >
                      {totalAssigned}/{emp.shiftsPerWeek} shifts
                    </span>
                  </div>
                  <div className="wc-emp-days">
                    {DAYS.map((day) => (
                      <div key={day} className="wc-emp-day-row">
                        <span className="wc-emp-day-label">{day.slice(0, 3)}</span>
                        <div className="wc-emp-day-shifts">
                          {SHIFTS.map((shift) => {
                            const active = assignments[emp.id][day].includes(shift);
                            return (
                              <button
                                key={shift}
                                onClick={() => onToggleAssignment(emp.id, day, shift)}
                                className={`wc-shift-toggle${active ? ' active' : ''}`}
                              >
                                {shift}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
