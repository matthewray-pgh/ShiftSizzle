import { Toggle } from '../Toggle/Toggle';

// The open / closed switch for one day's operating hours — a thin wrapper
// over the shared <Toggle>. Used by Settings > Business Hours and the setup
// wizard's "Confirm your hours" step.
export const DayOpenToggle = ({ isOpen, onToggle, label }) => (
  <Toggle on={isOpen} onChange={onToggle} label={label} onText="Open" offText="Closed" />
);
