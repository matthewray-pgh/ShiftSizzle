import { ContentPanel, ShiftCard } from '../../Components';
import { DAYS, useAppState } from '../../state/AppState';

import './Shifts.scss';

export const Shifts = () => {
  const {
    state: { employees, schedule },
  } = useAppState();

  const activeEmployees = employees.filter((employee) => employee.status !== 'archived');
  const assignedEmployees = activeEmployees.filter((employee) =>
    DAYS.some((day) => (schedule.assignments[employee.id]?.[day] ?? []).length > 0)
  );

  return (
    <div className="shifts">
      <ContentPanel>
        <div className="shifts__header">
          <div>
            <h2>{schedule.weekLabel}</h2>
            <p>{schedule.status === 'published' ? 'Published team view' : 'Draft team view'} for {schedule.selectedRole} scheduling.</p>
          </div>
          <div className={`shifts__status shifts__status--${schedule.status}`}>{schedule.status}</div>
        </div>
      </ContentPanel>

      <ContentPanel>
        <div className="shifts__cards">
          {assignedEmployees.map((employee) => (
            <ShiftCard
              key={employee.id}
              id={employee.id}
              title={employee.name}
              details={(
                <div className="shifts__details">
                  <p>{employee.role} • {employee.title}</p>
                  <ul>
                    {DAYS.map((day) => (
                      <li key={`${employee.id}-${day}`}>
                        <strong>{day}:</strong> {(schedule.assignments[employee.id]?.[day] ?? []).join(', ') || 'Off'}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            />
          ))}
        </div>
        {!assignedEmployees.length && <p>No scheduled shifts yet. Build the week in Scheduler first.</p>}
      </ContentPanel>
    </div>
  );
};