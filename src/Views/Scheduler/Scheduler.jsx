import React, { useMemo } from 'react';

import './Scheduler.scss';

import { ContentPanel } from '../../Components';
import {
  BarChart,
  EmployeeDayCalendarView,
  VerticalStackedShifts,
} from '../../Components/Visuals';
import { getOpenDays, getShiftTypes, getTeamRoles, useAppState } from '../../state/AppState';

const formatShiftsPerWeek = (shiftsPerWeek = 0) => `${shiftsPerWeek} ${shiftsPerWeek === 1 ? 'shift' : 'shifts'}/week`;

export const Scheduler = () => {
  const { state, dispatch } = useAppState();
  const { employees, schedule, settings } = state;
  const openDays = getOpenDays(settings);
  const shiftTypes = getShiftTypes(settings);
  const teamRoles = getTeamRoles(settings, employees);
  const selectedRole = schedule.selectedRole;

  const handleRequirementChange = (day, shift, value) => {
    dispatch({
      type: 'UPDATE_REQUIREMENTS',
      payload: {
        ...schedule.requirements,
        [day]: {
          ...schedule.requirements[day],
          [shift]: Math.max(0, parseInt(value, 10) || 0),
        },
      },
    });
  };

  const handleRoleChange = (e) => {
    dispatch({ type: 'SET_SELECTED_ROLE', payload: e.target.value });
  };

  const filteredEmployees = useMemo(
    () => employees.filter((employee) => employee.role === selectedRole && employee.status !== 'archived'),
    [employees, selectedRole]
  );

  const openShifts = useMemo(
    () =>
      openDays.flatMap((day) =>
        shiftTypes.flatMap((shift) => {
          const required = schedule.requirements[day]?.[shift] ?? 0;
          const assigned = filteredEmployees.reduce(
            (count, employee) => count + ((schedule.assignments[employee.id]?.[day] ?? []).includes(shift) ? 1 : 0),
            0
          );

          return assigned >= required ? [] : [{ day, shift, open: required - assigned }];
        })
      ),
    [filteredEmployees, openDays, schedule.assignments, schedule.requirements, shiftTypes]
  );

  const scheduledTotals = useMemo(
    () =>
      filteredEmployees.reduce(
        (count, employee) =>
          count + openDays.reduce((dayCount, day) => dayCount + (schedule.assignments[employee.id]?.[day] ?? []).length, 0),
        0
      ),
    [filteredEmployees, openDays, schedule.assignments]
  );

  return (
    <div className="scheduler">
      <ContentPanel>
        <div className="scheduler__hero">
          <div>
            <h2>Schedule Control Panel</h2>
            <p className="scheduler__subhead">
              Build, edit, and publish the {schedule.weekLabel} staffing plan for {selectedRole} coverage.
            </p>
          </div>
          <div className={`scheduler__status scheduler__status--${schedule.status}`}>
            {schedule.status}
          </div>
        </div>
        <div className="scheduler__control-grid">
          <div className="scheduler__control-card">
            <label htmlFor="role-select" className="scheduler__label">Role</label>
            <select
              id="role-select"
              value={selectedRole}
              onChange={handleRoleChange}
              className="scheduler__role-select"
            >
              {teamRoles.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
            <div className="scheduler__stats-row">
              <div>
                <span>{filteredEmployees.length}</span>
                <small>eligible employees</small>
              </div>
              <div>
                <span>{scheduledTotals}</span>
                <small>assigned shifts</small>
              </div>
              <div>
                <span>{openShifts.reduce((total, shift) => total + shift.open, 0)}</span>
                <small>open slots</small>
              </div>
            </div>
            <div className="scheduler__actions">
              <button type="button" className="button" onClick={() => dispatch({ type: 'AUTO_BUILD_SCHEDULE' })}>
                Auto-build
              </button>
              <button type="button" className="button" onClick={() => dispatch({ type: 'PUBLISH_SCHEDULE' })}>
                Publish
              </button>
            </div>
          </div>
          <div className="scheduler__control-card">
            <h3>Coverage Targets</h3>
            {openDays.length ? (
              <table className="scheduler__requirements-table">
                <thead>
                  <tr>
                    <th>Day</th>
                    {shiftTypes.map((shift) => (
                      <th key={shift}>{shift}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {openDays.map((day) => (
                    <tr key={day}>
                      <td>{day}</td>
                      {shiftTypes.map((shift) => (
                        <td key={shift}>
                          <input
                            type="number"
                            min={0}
                            value={schedule.requirements[day][shift]}
                            onChange={(e) => handleRequirementChange(day, shift, e.target.value)}
                            className="scheduler__requirements-input"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No operating days are enabled. Update business hours in Settings to plan coverage.</p>
            )}
          </div>
        </div>
      </ContentPanel>

      <ContentPanel>
        <div className="scheduler__section-header">
          <div>
            <h2>Weekly Schedule Editor</h2>
            <p>Toggle shifts directly for each employee. Unavailable shifts are disabled.</p>
          </div>
          <textarea
            className="scheduler__notes"
            value={schedule.notes}
            onChange={(e) => dispatch({ type: 'UPDATE_SCHEDULE_NOTES', payload: e.target.value })}
            placeholder="Schedule notes"
          />
        </div>
        {openDays.length === 0 ? (
          <p>No operating days are enabled. Update business hours in Settings to build the weekly schedule.</p>
        ) : filteredEmployees.length ? (
          <div className="scheduler__assignment-grid">
            {filteredEmployees.map((employee) => (
              <article key={employee.id} className="scheduler__employee-card">
                <div className="scheduler__employee-header">
                  <div>
                    <strong>{employee.name}</strong>
                    <span>{employee.title}</span>
                    <small className="scheduler__employee-cap">{formatShiftsPerWeek(employee.shiftsPerWeek)}</small>
                  </div>
                </div>
                <div className="scheduler__day-list">
                  {openDays.map((day) => (
                    <div key={`${employee.id}-${day}`} className="scheduler__day-row">
                      <span>{day.slice(0, 3)}</span>
                      <div className="scheduler__shift-buttons">
                        {shiftTypes.map((shift) => {
                          const isAssigned = (schedule.assignments[employee.id]?.[day] ?? []).includes(shift);
                          const isAvailable = (employee.availability?.[day] ?? []).includes(shift);

                          return (
                            <button
                              key={`${employee.id}-${day}-${shift}`}
                              type="button"
                              className={`scheduler__shift-toggle ${isAssigned ? 'is-active' : ''}`.trim()}
                              disabled={!isAvailable}
                              onClick={() => dispatch({
                                type: 'TOGGLE_ASSIGNMENT',
                                payload: { employeeId: employee.id, day, shift },
                              })}
                            >
                              {shift}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p>No active employees are available for the selected role yet. Add or reactivate team members in Team.</p>
        )}
        {openShifts.length > 0 && (
          <div className="scheduler__open-shifts">
            <h3>Coverage Gaps</h3>
            <ul>
              {openShifts.map((shift) => (
                <li key={`${shift.day}-${shift.shift}`}>{shift.day} {shift.shift}: {shift.open} open</li>
              ))}
            </ul>
          </div>
        )}
      </ContentPanel>

      <ContentPanel>
        <h2>Schedule Visualizations</h2>
        <div className="scheduler__visual-block">
          <h3>Calendar View</h3>
          <EmployeeDayCalendarView days={openDays} shiftTypes={shiftTypes} managers={filteredEmployees} assignments={schedule.assignments} />
        </div>
        <div className="scheduler__visual-grid">
          <div className="scheduler__visual-block">
            <h3>Total Shifts Needed Per Day</h3>
            <BarChart days={openDays} shiftRequirements={schedule.requirements} assignments={schedule.assignments} managers={filteredEmployees} />
          </div>
          <div className="scheduler__visual-block">
            <h3>Vertical Day / Shift View</h3>
            <VerticalStackedShifts days={openDays} shiftTypes={shiftTypes} managers={filteredEmployees} assignments={schedule.assignments} />
          </div>
        </div>
      </ContentPanel>
    </div>
  );
};