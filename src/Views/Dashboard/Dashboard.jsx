import React, { useMemo } from 'react';

import { ContentPanel } from '../../Components';
import { DAYS, getShiftTypes, useAppState } from '../../state/AppState';

import './Dashboard.scss';

const formatTime = (timeValue) => {
  if (!timeValue) {
    return '';
  }

  const [hoursText = '0', minutesText = '00'] = timeValue.split(':');
  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return timeValue;
  }

  const period = hours >= 12 ? 'PM' : 'AM';
  const normalizedHours = hours % 12 || 12;

  return `${normalizedHours}:${`${minutes}`.padStart(2, '0')} ${period}`;
};

const formatDayRange = (days) => {
  if (days.length === 1) {
    return days[0].slice(0, 3);
  }

  return `${days[0].slice(0, 3)}-${days[days.length - 1].slice(0, 3)}`;
};

const buildOperatingHoursSummary = (operatingHours = {}) => {
  const summaries = [];

  DAYS.forEach((day) => {
    const hours = operatingHours[day] ?? { isOpen: false, openTime: '', closeTime: '' };
    const label = hours.isOpen
      ? `${formatTime(hours.openTime)} - ${formatTime(hours.closeTime)}`
      : 'Closed';
    const previousSummary = summaries[summaries.length - 1];

    if (previousSummary?.label === label) {
      previousSummary.days.push(day);
      return;
    }

    summaries.push({
      label,
      days: [day],
    });
  });

  return summaries.map(({ label, days }) => ({
    dayRange: formatDayRange(days),
    label,
  }));
};

export const Dashboard = () => {
  const {
    state: { employees, schedule, settings },
  } = useAppState();
  const shiftTypes = getShiftTypes(settings);
  const operatingHoursSummary = useMemo(
    () => buildOperatingHoursSummary(settings.operatingHours),
    [settings.operatingHours]
  );

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
          shiftTypes.reduce((shiftTotal, shift) => {
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
    [activeEmployees, schedule.assignments, schedule.requirements, schedule.selectedRole, shiftTypes]
  );

  const dashboardCards = [
    { label: 'Active employees', value: activeEmployees.length, accent: 'orange' },
    { label: 'Assigned shifts', value: assignedShiftCount, accent: 'blue' },
    { label: 'Open shifts', value: openShiftCount, accent: openShiftCount ? 'red' : 'green' },
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
          <div className="dashboard__panel dashboard__panel--hours">
            <h3>Business Hours</h3>
            <ul className="dashboard__hours-list">
              {operatingHoursSummary.map(({ dayRange, label }) => (
                <li key={`${dayRange}-${label}`} className="dashboard__hours-item">
                  <strong>{dayRange}</strong>
                  <span>{label}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="dashboard__panel">
            <h3>Publish Status</h3>
            <p>
              {schedule.lastPublishedAt
                ? `Last published ${new Date(schedule.lastPublishedAt).toLocaleString()}`
                : 'No published schedule yet.'}
            </p>
            <small>
              {schedule.status === 'published'
                ? `The active week is live for ${schedule.selectedRole} coverage.`
                : 'Finish the draft and publish when coverage blockers are resolved.'}
            </small>
          </div>
        </div>
      </ContentPanel>
    </div>
  );
};