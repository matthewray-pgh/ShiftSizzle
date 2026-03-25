
import React, { useRef, useEffect, useState, useMemo } from 'react';

import "./Scheduler.scss";

import { ContentPanel } from '../Components';
import { 
  BarChart,
  DailyTable,
  EmployeeDayCalendarView,
  VerticalStackedShifts
} from '../Components/Visuals';

// Example: requirements for each day (number of each shift type needed)
const shiftRequirements = {
  Sunday:    { Open: 1, Mid: 1, Close: 1 },
  Monday:    { Open: 1, Mid: 0, Close: 1 },
  Tuesday:   { Open: 1, Mid: 0, Close: 1 },
  Wednesday: { Open: 1, Mid: 1, Close: 1 },
  Thursday:  { Open: 1, Mid: 1, Close: 1 },
  Friday:    { Open: 1, Mid: 2, Close: 1 },
  Saturday:  { Open: 1, Mid: 1, Close: 1 },
};

// Define TEAM_ROLES and static employees for now
const TEAM_ROLES = Object.freeze({
  MANAGER : "Manager",
  SERVER : "Server",
  HOST : "Host",
  BARTENDER : "Bartender",
  COOK : "Cook",
});

const employees = [
  { id: 1, name: "Jen Ray", title: "General Manager", role: TEAM_ROLES.MANAGER },
  { id: 2, name: "Ryan Something", title: "Assistant General Manager", role: TEAM_ROLES.MANAGER },
  { id: 3, name: "Kayla Someone", title: "Bar Manager", role: TEAM_ROLES.MANAGER },
  { id: 4, name: "Kirk Brady", title: "Director", role: TEAM_ROLES.MANAGER },
  { id: 5, name: "Jackie CateringPerson", title: "Catering Manager", role: TEAM_ROLES.MANAGER },
];

export const Scheduler = () => {  
  // Days of the week
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  // Shifts per day
  const shiftTypes = ["Open", "Mid", "Close"];

  // State for selected role and editable shift requirements
  const [selectedRole, setSelectedRole] = useState(TEAM_ROLES.MANAGER);
  const [editableRequirements, setEditableRequirements] = useState(() => JSON.parse(JSON.stringify(shiftRequirements)));

  // Handler for changing required shifts
  const handleRequirementChange = (day, shift, value) => {
    setEditableRequirements(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        [shift]: Math.max(0, parseInt(value) || 0)
      }
    }));
  };

  // Handler for changing role
  const handleRoleChange = (e) => {
    setSelectedRole(e.target.value);
  };

  // Use selected role for filtering employees
  const filteredEmployees = employees.filter(e => e.role === selectedRole);

  // Use editable requirements for scheduling
  const managers = filteredEmployees;
  let managerIdx = 0;
  const assignments = {};
  managers.forEach(m => { assignments[m.id] = {}; });
  days.forEach(day => {
    shiftTypes.forEach(shift => {
      const needed = editableRequirements[day][shift] || 0;
      for (let i = 0; i < needed; i++) {
        const manager = managers[managerIdx % managers.length];
        if (!assignments[manager.id][day]) assignments[manager.id][day] = [];
        assignments[manager.id][day].push(shift);
        managerIdx++;
      }
    });
  });


  return (
    <div className="scheduler">
      {/* Control Panel */}
      <ContentPanel>
      <div >
        <h2 style={{marginTop: 0}}>Schedule Control Panel</h2>
        <div style={{display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start'}}>
          {/* Role Selector */}
          <div>
            <label htmlFor="role-select" style={{fontWeight: 600, display: 'block', marginBottom: 4}}>Role:</label>
            <select
              id="role-select"
              value={selectedRole}
              onChange={handleRoleChange}
              size={Object.values(TEAM_ROLES).length}
              className="scheduler__role-select"
            >
              {Object.values(TEAM_ROLES).map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </div>
          {/* Shift Requirements Table */}
          <div>
            <table style={{borderCollapse: 'collapse', background: '#fff', borderRadius: 6, boxShadow: '0 1px 2px #0001'}}>
              <thead>
                <tr>
                  <th style={{padding: '4px 8px', fontWeight: 600, background: '#f0f0f0'}}>Day</th>
                  {shiftTypes.map(shift => (
                    <th key={shift} style={{padding: '4px 8px', fontWeight: 600, background: '#f0f0f0'}}>{shift}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map(day => (
                  <tr key={day}>
                    <td style={{padding: '4px 8px', fontWeight: 500}}>{day}</td>
                    {shiftTypes.map(shift => (
                      <td key={shift} style={{padding: '2px 6px'}}>
                        <input
                          type="number"
                          min={0}
                          value={editableRequirements[day][shift]}
                          onChange={e => handleRequirementChange(day, shift, e.target.value)}
                          style={{width: 48, fontSize: 15, textAlign: 'center', border: '1px solid #bbb', borderRadius: 4, padding: '2px 4px'}}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      </ContentPanel>

      <ContentPanel>
        <h2>Weekly Schedule ({selectedRole}s)</h2>
        {/* <DailyTable days={days} managers={managers} assignments={assignments} /> */}

        {/* Calendar view: employees on y, days on x, color-coded shifts */}
        <div style={{margin: '2rem 0 1rem 0'}}>
          <h3 style={{fontSize: '1.1em', marginBottom: 8}}>Calendar View 2 (Employees by Day, Shifts Color Coded)</h3>
          <EmployeeDayCalendarView days={days} shiftTypes={shiftTypes} managers={managers} assignments={assignments} />
        </div>

        {/* Bar chart visualization for shift coverage per day */}
        <div style={{margin: '2rem 0 1rem 0', background: '#f9f9f9', padding: '1rem', borderRadius: 6}}>
          <h3 style={{fontSize: '1.1em', marginBottom: 8}}>Total Shifts Needed Per Day</h3>
          <BarChart days={days} shiftRequirements={editableRequirements} assignments={assignments} managers={managers} />
        </div>

        {/* Vertical Day/Shift Visualization */}
        <div style={{margin: '2rem 0 1rem 0', background: '#f9f9f9', padding: '1rem', borderRadius: 6}}>
          <h3 style={{fontSize: '1.1em', marginBottom: 8}}>Vertical Day/Shift Schedule</h3>
          <VerticalStackedShifts days={days} shiftTypes={shiftTypes} managers={managers} assignments={assignments} />
        </div>
       
      </ContentPanel>
    </div>
  );
};