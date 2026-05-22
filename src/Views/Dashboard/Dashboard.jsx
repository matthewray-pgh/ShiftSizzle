import React, { useMemo } from 'react';

import { ContentPanel } from '../../Components';
import { DAYS, SHIFT_TYPES, useAppState } from '../../state/AppState';

import './Dashboard.scss';

export const Dashboard = () => {
  const {
    state: { employees, messages, schedule, settings },
  } = useAppState();

  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.status !== 'archived'),
    [employees]
  );

  const assignedShiftCount = useMemo(
    () =>
      activeEmployees.reduce(
        (total, employee) =>
          total + DAYS.reduce((dayTotal, day) => dayTotal + (schedule.assignments[employee.id]?.[day] ?? []).length, 0),
        0
      ),
    [activeEmployees, schedule.assignments]
  );

  const openShiftCount = useMemo(
    () =>
      DAYS.reduce(
        (total, day) =>
          total +
          SHIFT_TYPES.reduce((shiftTotal, shift) => {
            const required = schedule.requirements[day]?.[shift] ?? 0;
            const assigned = activeEmployees
              .filter((employee) => employee.role === schedule.selectedRole)
              .reduce(
                (count, employee) => count + ((schedule.assignments[employee.id]?.[day] ?? []).includes(shift) ? 1 : 0),
                0
              );

            return shiftTotal + Math.max(required - assigned, 0);
          }, 0),
        0
      ),
    [activeEmployees, schedule.assignments, schedule.requirements, schedule.selectedRole]
  );

  const unreadMessages = messages.filter((message) => message.status === 'unread').length;

  const dashboardCards = [
    { label: 'Active employees', value: activeEmployees.length, accent: 'orange' },
    { label: 'Assigned shifts', value: assignedShiftCount, accent: 'blue' },
    { label: 'Open shifts', value: openShiftCount, accent: openShiftCount ? 'red' : 'green' },
    { label: 'Unread updates', value: unreadMessages, accent: 'slate' },
  ];

  return (
    <div className="dashboard">
      <ContentPanel>
        <div className="dashboard__hero">
          <div>
            <p className="dashboard__eyebrow">{settings.locationName}</p>
            <h1>Hello, {settings.currentUserName}</h1>
            <p className="dashboard__summary">
              {schedule.status === 'published' ? 'Published' : 'Draft'} schedule for {schedule.weekLabel} focused on {schedule.selectedRole} coverage.
            </p>
          </div>
          <div className={`dashboard__status-pill dashboard__status-pill--${schedule.status === 'published' ? 'published' : 'draft'}`}>
            {schedule.status}
          </div>
        </div>
        <div className="dashboard__card-grid">
          {dashboardCards.map((card) => (
            <article key={card.label} className={`dashboard__metric dashboard__metric--${card.accent}`}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </article>
          ))}
        </div>
      </ContentPanel>

      <ContentPanel>
        <div className="dashboard__section-heading">
          <h2>This Week</h2>
          <span>{schedule.weekLabel}</span>
        </div>
        <div className="dashboard__two-column">
          <div className="dashboard__panel dashboard__panel--highlight">
            <h3>Manager Notes</h3>
            <p>{schedule.notes}</p>
          </div>
          <div className="dashboard__panel">
            <h3>Latest Update</h3>
            <p>{messages[0]?.title ?? 'No updates yet.'}</p>
            <small>{messages[0]?.body ?? 'Publishing a schedule creates a team notification.'}</small>
          </div>
        </div>
      </ContentPanel>
    </div>
  );
};