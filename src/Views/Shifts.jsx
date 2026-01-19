
import React, { useState, useEffect } from "react";

import { ContentPanel, ContentPanelHeader, ShiftCard } from "../Components";

import { managerSchedule1, managerSchedule2 } from "../../public/data";

import "./Shifts.scss";

export const Shifts = () => {

  const [selectedScheduleId, setSelectedScheduleId] = useState("");
  const [selectedManagerId, setSelectedManagerId] = useState("");

  // List of all available schedules
  const schedules = [managerSchedule1, managerSchedule2];

  // Get selected schedule object
  const selectedSchedule = selectedScheduleId !== "" ? schedules[parseInt(selectedScheduleId)] : null;

  // Get unique managers for selected schedule
  const uniqueManagers = selectedSchedule
    ? Array.from(
        selectedSchedule.shifts.reduce((map, shift) => {
          if (!map.has(shift.employeeId)) {
            map.set(shift.employeeId, shift.employeeName);
          }
          return map;
        }, new Map())
      ).map(([employeeId, employeeName]) => ({ employeeId, employeeName }))
    : [];

  // Reset manager selection when schedule changes
  useEffect(() => {
    setSelectedManagerId("");
  }, [selectedScheduleId]);

  const selectedManagerName = uniqueManagers.find(m => m.employeeId === selectedManagerId)?.employeeName || "";
  const managerShifts = selectedSchedule && selectedManagerId
    ? selectedSchedule.shifts.filter(shift => shift.employeeId === selectedManagerId)
    : [];

  return (
    <div className="shifts">

      <ContentPanelHeader title="Shifts" />

      <ContentPanel>
        <select className="shifts-select" value={selectedScheduleId} onChange={e => setSelectedScheduleId(e.target.value)}>
          <option value="" disabled>Select Schedule</option>
          {schedules.map((schedule, index) => (
            <option key={index} value={index}>{schedule.name || `Schedule ${index + 1}`}</option>
          ))}
        </select>

        <select className="shifts-select" value={selectedManagerId} onChange={e => setSelectedManagerId(e.target.value)} disabled={!selectedSchedule}>
          <option value="" disabled>Select Manager</option>
          {uniqueManagers.map(({ employeeId, employeeName }) => (
            <option key={employeeId} value={employeeId}>{employeeName}</option>
          ))}
        </select>

        <div className="manager-schedule">
          <h2>{selectedManagerName && `${selectedManagerName}'s Schedule`}</h2>
          {managerShifts.map(shift => (
            <ShiftCard 
              id={shift.date + shift.start}
              title={shift.date}
              details={shift.start ? `${shift.name}: ${shift.start} - ${shift.end}` : shift.name}
            />
          ))}
        </div>
      </ContentPanel>
    </div>
  );
}