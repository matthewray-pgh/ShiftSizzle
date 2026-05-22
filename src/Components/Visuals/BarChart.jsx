export function BarChart({ days, shiftRequirements, assignments, managers }) {
  // Calculate total required and scheduled shifts per day
  const requiredTotals = days.map(day => {
    const req = shiftRequirements[day];
    return Object.values(req).reduce((a, b) => a + b, 0);
  });
  // Scheduled: count all assigned shifts for all managers for that day
  const scheduledTotals = days.map(day => {
    return managers.reduce((sum, m) => sum + ((assignments[m.id][day] || []).length), 0);
  });
  const max = Math.max(1, ...requiredTotals, ...scheduledTotals);
  const barWidth = 40;
  const chartHeight = 100;
  return (
    <svg width={days.length * (barWidth + 20)} height={chartHeight + 50}>
      {days.map((day, i) => {
        const req = requiredTotals[i];
        const sched = scheduledTotals[i];
        const reqHeight = (req / max) * chartHeight;
        const schedHeight = (sched / max) * chartHeight;
        const schedColor = sched > req ? '#e94f4f' : '#4a90e2';
        return (
          <g key={day}>
            {/* Required bar (gray, black outline) */}
            <rect
              x={i * (barWidth + 20) + 8}
              y={chartHeight - reqHeight + 20}
              width={barWidth}
              height={reqHeight}
              fill="#e0e0e0"
              stroke="#fff"
              strokeWidth={2}
              rx={6}
              style={{ filter: 'drop-shadow(0 1px 2px #0002)' }}
            />
            {/* Scheduled bar (blue or red if over) */}
            <rect
              x={i * (barWidth + 20) + 8}
              y={chartHeight - schedHeight + 20}
              width={barWidth}
              height={schedHeight}
              fill={schedColor}
              opacity={0.95}
              rx={6}
            />
            {/* Required value label (above required bar) */}
            <text
              x={i * (barWidth + 20) + barWidth / 2 + 8}
              y={chartHeight - reqHeight + 15}
              textAnchor="middle"
              fontSize="12"
              fill="#222"
              fontWeight="bold"
            >
              {req}
            </text>
            {/* Scheduled value label (bottom of scheduled bar) */}
            <text
              x={i * (barWidth + 20) + barWidth / 2 + 8}
              y={chartHeight + 12}
              textAnchor="middle"
              fontSize="12"
              fill='#fff'
              fontWeight='bold'
            >
              {sched}
            </text>
            {/* Day label */}
            <text
              x={i * (barWidth + 20) + barWidth / 2 + 8}
              y={chartHeight + 35}
              textAnchor="middle"
              fontSize="12"
              fontWeight="bold"
              fill="#333"
            >
              {day.slice(0,3)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}