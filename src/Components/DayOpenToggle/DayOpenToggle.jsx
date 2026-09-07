import './DayOpenToggle.scss';

// The open / closed switch for one day's operating hours. Shared by
// Settings > Business Hours and the setup wizard's "Confirm your hours"
// step so the control is identical in both.
export const DayOpenToggle = ({ isOpen, onToggle, label }) => (
  <button
    type="button"
    className={`day-open-toggle ${isOpen ? 'is-open' : ''}`.trim()}
    aria-pressed={isOpen}
    aria-label={label}
    onClick={onToggle}
  >
    <span className="day-open-toggle__track" aria-hidden="true">
      <span className="day-open-toggle__thumb" />
    </span>
    <span>{isOpen ? 'Open' : 'Closed'}</span>
  </button>
);
