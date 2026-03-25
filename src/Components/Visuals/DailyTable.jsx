export const DailyTable = ({ days, managers, assignments }) => {
  return (
    <table className="week-schedule">
      <thead>
        <tr>
          <th>Manager</th>
          {days.map(day => (
            <th key={day}>{day}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {managers.map(manager => (
          <tr key={manager.id}>
            <td>{manager.name}</td>
            {days.map(day => (
              <td key={day} style={{ minWidth: 100 }}>
                {assignments[manager.id][day] && assignments[manager.id][day].length > 0
                  ? assignments[manager.id][day].join(", ")
                  : <span style={{ color: '#aaa' }}>-</span>}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
};