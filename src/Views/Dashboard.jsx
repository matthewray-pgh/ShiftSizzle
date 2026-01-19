import React, { useState } from 'react';

import { 
  ContentPanelHeader,
  ContentPanel,
  ShiftCard 
} from '../Components';

import { managerSchedule2 } from '../../public/data';

import "./Dashboard.scss";

export const Dashboard = () => {

  const [ currentSchedule, setCurrentSchedule ] = useState(managerSchedule2);
  const [ userEmployeeId, setUserEmployeeId ] = useState("1");

  // Filter shifts for the current user
  const myShifts = currentSchedule.shifts.filter(shift => shift.employeeId === userEmployeeId);

  return (
    <div className="dashboard">
      <ContentPanelHeader title="Dashboard" />
      <ContentPanel>
        
        <section className="dashboard__current-schedule">
          <h3 className="dashboard__section-title">Current Schedule</h3>
          {myShifts.map(shift => (
            <ShiftCard 
              id={shift.date + shift.start}
              title={shift.date}
              details={shift.start ? `${shift.name}: ${shift.start} - ${shift.end}` : shift.name}
            />
          ))}
        </section>

      </ContentPanel>
    </div>
  );
};