export function VerticalStackedShifts({ days, shiftTypes, managers, assignments }) {
  // Bar colors for shifts
  const shiftColors = {
    Open: '#4a90e2',
    Mid: '#f5a623',
    Close: '#7ed321',
  };
  // Layout: each day is a row, each shift is a horizontal bar, overlapping as open-mid-close
  // For each day, for each shift, list employees assigned
  const barHeight = 36;
  const barGap = 12;
  const barWidth = 220;
  const overlap = 0; // no overlap
  return (
    <div style={{overflowX: 'auto'}}>
      <table style={{borderCollapse: 'collapse', minWidth: 500}}>
        <thead>
          <tr>
            <th style={{background: '#fff', fontWeight: 600, fontSize: 15, padding: '6px 12px'}}>Day</th>
            <th style={{background: '#fff', fontWeight: 600, fontSize: 15, padding: '6px 12px'}}>Shifts</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day, dayIdx) => {
            // For this day, build a flat list of {shift, employee} for all assignments
            const bars = [];
            shiftTypes.forEach((shift, idx) => {
              const assigned = managers.filter(m => (assignments[m.id][day] || []).includes(shift));
              assigned.forEach(m => {
                bars.push({ shift, employee: m.name, idx });
              });
            });
            const rowBg = dayIdx % 2 === 0 ? '#f5f5f5' : '#fafdff';
            return (
              <tr key={day} style={{background: rowBg}}>
                <td style={{fontWeight: 600, padding: '6px 12px', border: '1px solid #eee', background: rowBg}}>{day}</td>
                <td
                  style={{
                    position: 'relative',
                    height: (barHeight + barGap) * bars.length + barGap,
                    minWidth: barWidth + 2 * overlap,
                    border: '1px solid #eee',
                    background: rowBg
                  }}
                >
                  <div
                    style={{
                      position: 'relative',
                      height: (barHeight + barGap) * bars.length + barGap
                    }}
                  >
                    {bars.map((bar, i) => {
                      // Align: open left, mid center, close right
                      let align = 'left';
                      let left = 0;
                      if (bar.shift === 'Mid') {
                        align = 'center';
                        left = '50%';
                      } else if (bar.shift === 'Close') {
                        align = 'right';
                        left = '100%';
                      }
                      return (
                        <div
                          key={bar.shift + '-' + bar.employee}
                          style={{
                            position: 'absolute',
                            left: left,
                            transform:
                              bar.shift === 'Mid'
                                ? `translateX(-50%)`
                                : bar.shift === 'Close'
                                ? `translateX(-100%)`
                                : 'none',
                            top: (barHeight + barGap) * i + barGap,
                            marginTop: 0,
                            marginBottom: 0,
                            width: barWidth,
                            height: barHeight,
                            background: shiftColors[bar.shift] || '#bbb',
                            borderRadius: 8,
                            boxShadow: '0 1px 4px #0002',
                            display: 'flex',
                            alignItems: 'center',
                            paddingLeft: 14,
                            fontWeight: 600,
                            color: '#fff',
                            fontSize: 15,
                            border: '2px solid #fff',
                          }}
                        >
                          <span style={{marginRight: 8, fontWeight: 700}}>{bar.shift}:</span>
                          {bar.employee}
                        </div>
                      );
                    })}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}