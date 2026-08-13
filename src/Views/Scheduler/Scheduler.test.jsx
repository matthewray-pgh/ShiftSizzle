import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppStateProvider } from '../../state/AppState';
import { renderView } from '../../test/renderView';
import { Scheduler } from './Scheduler';

const STORAGE_KEY = 'shiftsizzle.app-state.v1';

const singleDayOperatingHours = {
  Sunday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
  Monday: { isOpen: true, openTime: '11:00', closeTime: '21:00' },
  Tuesday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
  Wednesday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
  Thursday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
  Friday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
  Saturday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
};

const twoDayOperatingHours = {
  ...singleDayOperatingHours,
  Tuesday: { isOpen: true, openTime: '11:00', closeTime: '21:00' },
};

const grid = (openValue = 0) => ({
  Sunday: { Open: 0 },
  Monday: { Open: openValue },
  Tuesday: { Open: 0 },
  Wednesday: { Open: 0 },
  Thursday: { Open: 0 },
  Friday: { Open: 0 },
  Saturday: { Open: 0 },
});

const emptyAssignments = () => ({
  Sunday: [], Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [],
});

const availableEveryDay = { Sunday: ['Open'], Monday: ['Open'], Tuesday: ['Open'], Wednesday: ['Open'], Thursday: ['Open'], Friday: ['Open'], Saturday: ['Open'] };

const getRoleSection = (role) => screen
  .getByText(role, { selector: '.scheduler__role-section-header-left strong' })
  .closest('.scheduler__role-section');

const getDayCard = (day) => screen.getByRole('heading', { name: day, level: 4 }).closest('.scheduler__requirements-card');

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Scheduler view', () => {
  it('renders the scheduler page before a week is selected', () => {
    renderView(Scheduler);

    expect(screen.getByText('Build Schedule')).toBeInTheDocument();
    expect(screen.getAllByText('Choose which day your schedules start on, then pick a start date below.').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Active editing context')).toHaveTextContent('No week selected yet');
    expect(screen.getByLabelText('Week start date')).toBeDisabled();
    const setupNotice = screen.getByLabelText('Set scheduling week start day');

    expect(within(setupNotice).getByLabelText('Week starts on')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish week' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset week' })).not.toBeInTheDocument();
    const statusPanel = screen.getByLabelText('Schedule status panel');

    expect(within(statusPanel).getByText('Draft schedule')).toBeInTheDocument();
    expect(within(statusPanel).getByText('Set the week to start planning.')).toBeInTheDocument();
  });

  it('hydrates week and role from deep-link query params, activating the matching role tab', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: { weekStartsOn: 'Monday' },
      schedule: { startDate: '', endDate: '', weekLabel: '' },
    }));
    window.history.replaceState({}, '', '/schedule/build?weekStart=2026-05-25&role=Manager');

    render(
      <AppStateProvider>
        <Scheduler />
      </AppStateProvider>
    );

    expect(screen.getByLabelText('Week start date')).toHaveValue('2026-05-25');
    expect(screen.getByRole('tab', { name: /^Manager/ })).toHaveAttribute('aria-selected', 'true');
    expect(window.location.search).toBe('');
  });

  it('switching weeks with unsaved changes autosaves the previous week and switches with no confirm dialog', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: singleDayOperatingHours },
      employees: [{ id: 1, name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay }],
      schedule: {
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        roleRequirements: { Manager: grid(1) },
        assignments: { Manager: { 1: emptyAssignments() } },
        hasUnsavedChanges: true,
      },
    }));

    render(
      <AppStateProvider>
        <Scheduler />
      </AppStateProvider>
    );

    fireEvent.change(screen.getByLabelText('Week start date'), { target: { value: '2026-06-07' } });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Week start date')).toHaveValue('2026-06-07');
    expect(screen.getByLabelText('Active editing context')).toHaveTextContent('Jun 7 - Jun 13, 2026');

    fireEvent.change(screen.getByLabelText('Week start date'), { target: { value: '2026-05-24' } });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Active editing context')).toHaveTextContent('May 24 - May 30, 2026');
    fireEvent.click(screen.getByRole('tab', { name: /^Manager/ }));
    expect(getDayCard('Monday').querySelector('input')).toHaveValue(1);
  });

  it('resets the whole week behind a confirm dialog', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: singleDayOperatingHours },
      employees: [
        { id: 1, name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay },
        { id: 2, name: 'Ava Cole', roles: ['Server'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay },
      ],
      schedule: {
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        roleRequirements: { Manager: grid(1), Server: grid(2) },
        assignments: { Manager: { 1: emptyAssignments() }, Server: { 2: emptyAssignments() } },
      },
    }));

    render(
      <AppStateProvider>
        <Scheduler />
      </AppStateProvider>
    );

    const trigger = screen.getByRole('button', { name: 'Reset week' });

    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(trigger);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reset week' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /^Manager/ }));
    expect(getDayCard('Monday').querySelector('input')).toHaveValue(0);
  });

  it('hides closed days from scheduling controls', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: singleDayOperatingHours },
      employees: [{ id: 1, name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay }],
      schedule: {
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        roleRequirements: { Manager: grid(0) },
        assignments: { Manager: { 1: emptyAssignments() } },
      },
    }));

    render(
      <AppStateProvider>
        <Scheduler />
      </AppStateProvider>
    );

    fireEvent.click(screen.getByRole('tab', { name: /^Manager/ }));

    expect(screen.queryByRole('heading', { name: 'Sunday', level: 4 })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Monday', level: 4 })).toBeInTheDocument();
  });

  it('blocks publishing until coverage is filled and then records the publish state', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: singleDayOperatingHours },
      employees: [{ id: 1, name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 1, status: 'active', availability: availableEveryDay }],
      schedule: {
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        roleRequirements: { Manager: grid(1) },
        assignments: { Manager: { 1: emptyAssignments() } },
      },
    }));

    render(
      <AppStateProvider>
        <Scheduler />
      </AppStateProvider>
    );

    fireEvent.click(screen.getByRole('tab', { name: /^Manager/ }));

    const publishButton = screen.getByRole('button', { name: 'Publish week' });

    expect(publishButton).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Generate draft' }));

    expect(publishButton).toBeEnabled();

    fireEvent.click(publishButton);

    expect(screen.getByText('Published schedule')).toBeInTheDocument();
    expect(screen.getByText(/Last published /)).toBeInTheDocument();
  });

  it('enables draft generation as soon as coverage targets are added', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: singleDayOperatingHours },
      employees: [{ id: 1, name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay }],
      schedule: {
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        roleRequirements: { Manager: grid(0) },
        assignments: { Manager: { 1: emptyAssignments() } },
      },
    }));

    render(
      <AppStateProvider>
        <Scheduler />
      </AppStateProvider>
    );

    fireEvent.click(screen.getByRole('tab', { name: /^Manager/ }));

    expect(screen.getByRole('button', { name: 'Generate draft' })).toBeDisabled();

    const input = getDayCard('Monday').querySelector('input');

    fireEvent.change(input, { target: { value: '2' } });

    expect(screen.getByRole('button', { name: 'Generate draft' })).toBeEnabled();
  });

  it('applies one day\'s coverage targets to every day via "Apply to all days"', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: twoDayOperatingHours },
      employees: [{ id: 1, name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay }],
      schedule: {
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        roleRequirements: { Manager: grid(0) },
        assignments: { Manager: { 1: emptyAssignments() } },
      },
    }));

    render(
      <AppStateProvider>
        <Scheduler />
      </AppStateProvider>
    );

    fireEvent.click(screen.getByRole('tab', { name: /^Manager/ }));

    const mondayCard = getDayCard('Monday');

    fireEvent.change(mondayCard.querySelector('input'), { target: { value: '3' } });
    fireEvent.click(within(mondayCard).getByRole('button', { name: 'Apply to all days' }));

    expect(getDayCard('Tuesday').querySelector('input')).toHaveValue(3);
  });

  it('disables extra manual assignment buttons once an employee reaches the weekly shift cap', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: twoDayOperatingHours },
      employees: [{ id: 1, name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 1, status: 'active', availability: availableEveryDay }],
      schedule: {
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        roleRequirements: { Manager: grid(0) },
        assignments: { Manager: { 1: emptyAssignments() } },
      },
    }));

    render(
      <AppStateProvider>
        <Scheduler />
      </AppStateProvider>
    );

    fireEvent.click(screen.getByRole('tab', { name: /^Manager/ }));

    const jenCard = screen.getAllByText('Jen Ray').find((element) => element.tagName === 'STRONG').closest('.scheduler__employee-card');
    const mondayRow = within(jenCard).getByText('Mon').closest('.scheduler__day-row');
    const tuesdayRow = within(jenCard).getByText('Tue').closest('.scheduler__day-row');

    fireEvent.click(within(mondayRow).getByRole('button', { name: 'Open' }));

    expect(within(jenCard).getByText('1/1 assigned')).toBeInTheDocument();
    expect(within(tuesdayRow).getByRole('button', { name: 'Open' })).toBeDisabled();
  });

  it('switching role tabs does not reset or discard unsaved edits in other roles', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: singleDayOperatingHours },
      employees: [
        { id: 1, name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay },
        { id: 2, name: 'Ava Cole', roles: ['Server'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay },
      ],
      schedule: {
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        roleRequirements: { Manager: grid(0), Server: grid(0) },
        assignments: { Manager: { 1: emptyAssignments() }, Server: { 2: emptyAssignments() } },
      },
    }));

    render(
      <AppStateProvider>
        <Scheduler />
      </AppStateProvider>
    );

    fireEvent.click(screen.getByRole('tab', { name: /^Manager/ }));
    fireEvent.change(getDayCard('Monday').querySelector('input'), { target: { value: '3' } });

    fireEvent.click(screen.getByRole('tab', { name: /^Server/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /^Manager/ }));
    expect(getDayCard('Monday').querySelector('input')).toHaveValue(3);
  });

  it('shows "No demand set" instead of "Covered" for a role with no coverage targets entered', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: singleDayOperatingHours },
      employees: [{ id: 1, name: 'Ava Cole', roles: ['Server'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay }],
      schedule: {
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        roleRequirements: { Server: grid(0) },
        assignments: { Server: { 1: emptyAssignments() } },
      },
    }));

    render(
      <AppStateProvider>
        <Scheduler />
      </AppStateProvider>
    );

    const serverSection = getRoleSection('Server');

    expect(within(serverSection).getByText('No demand set')).toBeInTheDocument();
    expect(within(serverSection).queryByText('Covered')).not.toBeInTheDocument();
  });

  it('the checklist and "All roles" tab total open slots across every role, not just the active tab', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: singleDayOperatingHours },
      employees: [
        { id: 1, name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay },
        { id: 2, name: 'Ava Cole', roles: ['Server'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay },
      ],
      schedule: {
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        roleRequirements: { Manager: grid(1), Server: grid(2) },
        assignments: { Manager: { 1: emptyAssignments() }, Server: { 2: emptyAssignments() } },
      },
    }));

    render(
      <AppStateProvider>
        <Scheduler />
      </AppStateProvider>
    );

    expect(screen.getByText('Coverage: 3 open slots')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^All roles/ })).toHaveTextContent('3');
  });

  it('publish is blocked while any role with demand still has an open slot, even if the active tab\'s role is fully covered', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: singleDayOperatingHours },
      employees: [
        { id: 1, name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay },
        { id: 2, name: 'Ava Cole', roles: ['Server'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay },
      ],
      schedule: {
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        roleRequirements: { Manager: grid(1), Server: grid(1) },
        assignments: { Manager: { 1: { ...emptyAssignments(), Monday: ['Open'] } }, Server: { 2: emptyAssignments() } },
      },
    }));

    render(
      <AppStateProvider>
        <Scheduler />
      </AppStateProvider>
    );

    fireEvent.click(screen.getByRole('tab', { name: /^Manager/ }));
    expect(within(getRoleSection('Manager')).getByText('Covered')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish week' })).toBeDisabled();
  });

  it('blocks double-booking a shift under a different role and shows the cross-role assigned total on the employee card', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: singleDayOperatingHours },
      employees: [
        { id: 3, name: 'Kayla Brooks', roles: ['Manager', 'Server'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay },
      ],
      schedule: {
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        roleRequirements: { Manager: grid(0), Server: grid(0) },
        assignments: {
          Manager: { 3: { ...emptyAssignments(), Monday: ['Open'] } },
          Server: { 3: emptyAssignments() },
        },
      },
    }));

    render(
      <AppStateProvider>
        <Scheduler />
      </AppStateProvider>
    );

    fireEvent.click(screen.getByRole('tab', { name: /^Manager/ }));
    const kaylaCardManagerView = screen.getByText('Kayla Brooks').closest('.scheduler__employee-card');

    // Cross-role total (1 shift under Manager, 0 under Server) shows here...
    expect(within(kaylaCardManagerView).getByText('1/2 assigned')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /^Server/ }));
    const kaylaCardServerView = screen.getByText('Kayla Brooks').closest('.scheduler__employee-card');

    // ...and here too, even though Server's own bucket is still empty.
    expect(within(kaylaCardServerView).getByText('1/2 assigned')).toBeInTheDocument();

    const mondayRow = within(kaylaCardServerView).getByText('Mon').closest('.scheduler__day-row');
    const openButton = within(mondayRow).getByRole('button', { name: 'Open' });

    expect(openButton).toBeDisabled();
    expect(openButton).toHaveAttribute('title', expect.stringContaining('already working Open on Monday under another role'));
  });

  it('autosaves an unsaved edit without clicking "Save draft"', () => {
    vi.useFakeTimers();

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: singleDayOperatingHours },
      employees: [{ id: 1, name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay }],
      schedule: {
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        roleRequirements: { Manager: grid(0) },
        assignments: { Manager: { 1: emptyAssignments() } },
      },
    }));

    render(
      <AppStateProvider>
        <Scheduler />
      </AppStateProvider>
    );

    fireEvent.click(screen.getByRole('tab', { name: /^Manager/ }));
    fireEvent.change(getDayCard('Monday').querySelector('input'), { target: { value: '2' } });

    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
    expect(screen.getByText(/Autosaved/)).toBeInTheDocument();
  });
});
