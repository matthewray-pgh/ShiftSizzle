import { formatShiftLabel } from '../../state/AppState';

import './CoverageDayRow.scss';

// One day's coverage targets for the selected role: a header line (day name
// left, "apply to all days" shortcut centered) with a headcount field per
// shift type below. Shared by Settings > Coverage Targets and the setup
// wizard's "Confirm coverage targets" step.
export const CoverageDayRow = ({ day, isClosed, settings, shiftTypes, values, onChange, onApplyToAll }) => (
  <div className={`coverage-day-row ${isClosed ? 'is-closed' : ''}`.trim()}>
    <div className="coverage-day-row__header">
      <strong className="coverage-day-row__name">
        {day}
        {isClosed && <span className="coverage-day-row__closed"> · closed</span>}
      </strong>
      {onApplyToAll && (
        <button
          type="button"
          className="coverage-day-row__apply"
          onClick={onApplyToAll}
          aria-label={`Apply ${day} coverage to all days`}
        >
          Apply to all days
        </button>
      )}
    </div>

    <div className="coverage-day-row__fields">
      {shiftTypes.map((shift) => (
        <label key={shift} className="coverage-day-row__field">
          <span>{formatShiftLabel(settings, shift, day)}</span>
          <input
            type="number"
            min={0}
            value={values[shift] ?? 0}
            onChange={(event) => onChange(shift, event.target.value)}
          />
        </label>
      ))}
    </div>
  </div>
);
