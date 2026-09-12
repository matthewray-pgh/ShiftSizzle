import './Toggle.scss';

// A sliding on/off switch. `label` is the accessible name; `onText` /
// `offText` are the words shown next to the track for the current state.
export const Toggle = ({ on, onChange, label, onText = 'On', offText = 'Off', className = '' }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    className={`toggle ${on ? 'is-on' : ''} ${className}`.trim()}
    onClick={() => onChange(!on)}
  >
    <span className="toggle__track" aria-hidden="true">
      <span className="toggle__thumb" />
    </span>
    <span className="toggle__text">{on ? onText : offText}</span>
  </button>
);
