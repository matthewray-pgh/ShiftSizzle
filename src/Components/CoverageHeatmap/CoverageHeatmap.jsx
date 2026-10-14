import { DAYS, formatShiftLabel, formatShiftTimeRange, getShiftTime } from '../../state/AppState';

import './CoverageHeatmap.scss';

const countFor = (coverage, role, day, shift) => Number(coverage?.[role]?.[day]?.[shift]) || 0;

// Coverage targets as a week-at-a-glance grid: days across, shift types
// down, each tile showing the total headcount for that shift and shaded by
// how it compares with the busiest shift of the week. Selecting a tile opens
// its per-role breakdown underneath, which is where the numbers are edited.
// Shared by Settings > Coverage Targets and the setup wizard's "Confirm
// coverage targets" step.
export const CoverageHeatmap = ({ settings, shiftTypes, roles, operatingHours, coverage, selected, onSelect, onChange, onApplyDayToAll }) => {
  const isOpen = (day) => Boolean(operatingHours?.[day]?.isOpen);
  const totalFor = (day, shift) => roles.reduce((sum, role) => sum + countFor(coverage, role, day, shift), 0);
  const busiest = Math.max(
    1,
    ...DAYS.filter(isOpen).flatMap((day) => shiftTypes.map((shift) => totalFor(day, shift))),
  );
  const hasSelection = Boolean(selected) && isOpen(selected.day) && shiftTypes.includes(selected.shift);

  return (
    <div className="coverage-heatmap">
      <div className="coverage-heatmap__grid" role="group" aria-label="Coverage targets by day and shift">
        <span />
        {DAYS.map((day) => (
          <span key={day} className="coverage-heatmap__day">{day.slice(0, 3)}</span>
        ))}

        {shiftTypes.map((shift) => {
          const range = formatShiftTimeRange(getShiftTime(settings, shift));

          return [
            <span key={`${shift}-label`} className="coverage-heatmap__shift">
              <strong>{shift}</strong>
              {range && <span>{range}</span>}
            </span>,
            ...DAYS.map((day) => {
              if (!isOpen(day)) {
                return <span key={`${shift}-${day}`} className="coverage-heatmap__tile is-closed" aria-label={`${day} closed`}>—</span>;
              }

              const total = totalFor(day, shift);

              return (
                <button
                  key={`${shift}-${day}`}
                  type="button"
                  className={`coverage-heatmap__tile ${total === 0 ? 'is-empty' : ''}`.trim()}
                  style={{ '--strength': total === 0 ? 0 : 0.18 + 0.6 * (total / busiest) }}
                  aria-pressed={hasSelection && selected.day === day && selected.shift === shift}
                  aria-label={`${day} ${shift}: ${total} needed`}
                  onClick={() => onSelect({ day, shift })}
                >
                  {total}
                </button>
              );
            }),
          ];
        })}
      </div>

      <div className="coverage-heatmap__legend" aria-hidden="true">
        <span>Fewer</span>
        <i style={{ '--strength': 0.25 }} />
        <i style={{ '--strength': 0.5 }} />
        <i style={{ '--strength': 0.78 }} />
        <span>More people</span>
      </div>

      {hasSelection ? (
        <div className="coverage-heatmap__detail" aria-label={`${selected.day} ${selected.shift} coverage`}>
          <div className="coverage-heatmap__detail-head">
            <strong>{selected.day} · {formatShiftLabel(settings, selected.shift, selected.day)}</strong>
            {onApplyDayToAll && (
              <button
                type="button"
                className="coverage-heatmap__apply"
                onClick={() => onApplyDayToAll(selected.day)}
                aria-label={`Apply ${selected.day} coverage to all days`}
              >
                Apply {selected.day} to all days
              </button>
            )}
          </div>

          {roles.map((role) => {
            const count = countFor(coverage, role, selected.day, selected.shift);

            return (
              <div key={role} className="coverage-heatmap__role">
                <span className="coverage-heatmap__role-name">{role}</span>
                <button
                  type="button"
                  onClick={() => onChange(role, selected.day, selected.shift, count - 1)}
                  disabled={count === 0}
                  aria-label={`Remove one ${role}`}
                >
                  <i className="fas fa-minus" aria-hidden="true" />
                </button>
                <span className="coverage-heatmap__count" aria-label={`${role} needed`}>{count}</span>
                <button
                  type="button"
                  onClick={() => onChange(role, selected.day, selected.shift, count + 1)}
                  aria-label={`Add one ${role}`}
                >
                  <i className="fas fa-plus" aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="coverage-heatmap__empty">Pick a shift above to set how many of each role it needs.</p>
      )}
    </div>
  );
};
