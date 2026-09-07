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
            // `text` + inputMode rather than `type="number"`: it still shows
            // the numeric keypad, but `.select()` on focus works reliably
            // (Safari ignores it on number inputs) so the next keystroke
            // replaces the current value instead of appending to it. Blank
            // rather than a literal "0" so an empty target reads as "none";
            // the parent handler coerces anything non-numeric back to 0.
            type="text"
            inputMode="numeric"
            placeholder="0"
            value={Number(values[shift]) ? values[shift] : ''}
            onFocus={(event) => event.target.select()}
            onChange={(event) => onChange(shift, event.target.value)}
          />
        </label>
      ))}
    </div>
  </div>
);
