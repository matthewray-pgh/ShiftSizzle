export function EmployeeDayCalendarView({ days, shiftTypes, managers, assignments }) {
  // Color for each shift type
  const shiftColors = {
    Open: '#4a90e2',
    Mid: '#f5a623',
    Close: '#7ed321',
  };
  return (
    <div style={{overflowX: 'auto'}}>
      <table style={{borderCollapse: 'collapse', minWidth: 700}}>
        <thead>
          <tr>
            <th style={{background: '#fff', zIndex: 2}}>Manager</th>
            {days.map(day => (
              <th key={day} style={{padding: '0.25rem 0.5rem', fontSize: 12, background: '#f5f5f5', border: '1px solid #ddd'}}>{day.slice(0,3)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {managers.map(m => (
            <tr key={m.id}>
              <td style={{fontWeight: 600, border: '1px solid #ddd', background: '#f5f5f5'}}>{m.name}</td>
              {days.map(day => {
                const shifts = assignments[m.id][day] || [];
                return (
                  <td key={day+m.id} style={{border: '1px solid #ddd', minWidth: 100, textAlign: 'center', padding: 0}}>
                    {shifts.length > 0 ? (
                      <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: 4}}>
                        {shifts.map(shift => (
                          <span key={shift} style={{background: shiftColors[shift] || '#bbb', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 13, fontWeight: 500, margin: 1}}>{shift}</span>
                        ))}
                      </div>
                    ) : <span style={{color: '#bbb'}}>-</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}