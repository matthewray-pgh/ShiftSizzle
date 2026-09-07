import { DayOpenToggle } from '../DayOpenToggle/DayOpenToggle';

import './DayHoursRow.scss';

// One day's operating-hours panel: a single header line — day name on the
// left, "apply to all days" shortcut centered, open/closed switch on the
// right — with the Open and Close time fields below. Shared by Settings >
// Business Hours and the setup wizard's "Confirm your hours" step.
export const DayHoursRow = ({ day, hours, onChangeTime, onToggle, onApplyToAll }) => (
  <div className={`day-hours-row ${hours.isOpen ? '' : 'is-closed'}`.trim()}>
    <div className="day-hours-row__header">
      <strong className="day-hours-row__name">{day}</strong>
      {onApplyToAll && (
        <button
          type="button"
          className="day-hours-row__apply"
          onClick={onApplyToAll}
          aria-label={`Apply ${day} hours to all days`}
        >
          Apply to all days
        </button>
      )}
      <div className="day-hours-row__toggle">
        <DayOpenToggle
          isOpen={hours.isOpen}
          onToggle={onToggle}
          label={`${day} is ${hours.isOpen ? 'open' : 'closed'}. Toggle operating day.`}
        />
      </div>
    </div>

    <div className="day-hours-row__fields">
      <label className="day-hours-row__field">
        <span>Open</span>
        <input
          type="time"
          min="00:00"
          max="23:59"
          value={hours.openTime}
          disabled={!hours.isOpen}
          onChange={(event) => onChangeTime('openTime', event.target.value)}
        />
      </label>

      <label className="day-hours-row__field">
        <span>Close</span>
        <input
          type="time"
          min="00:00"
          max="23:59"
          value={hours.closeTime}
          disabled={!hours.isOpen}
          onChange={(event) => onChangeTime('closeTime', event.target.value)}
        />
      </label>
    </div>
  </div>
);
