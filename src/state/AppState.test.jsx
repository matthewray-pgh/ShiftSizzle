import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppStateProvider, useAppState } from './AppState';

const STORAGE_KEY = 'shiftsizzle.app-state.v1';

const TestHarness = () => {
  const { state, dispatch } = useAppState();
  const employeeId = state.employees[0]?.id;
  const assignedCount = employeeId
    ? Object.values(state.schedule.assignments).reduce(
      (total, roleBucket) => total + Object.values(roleBucket[employeeId] ?? {}).reduce(
        (dayTotal, shifts) => dayTotal + shifts.length,
        0,
      ),
      0,
    )
    : 0;

  return (
    <>
      <button type="button" onClick={() => dispatch({ type: 'AUTO_BUILD_SCHEDULE', payload: { role: 'Manager' } })}>
        Generate draft
      </button>
      <button type="button" onClick={() => dispatch({ type: 'AUTO_BUILD_SCHEDULE', payload: { role: 'Server' } })}>
        Auto-build Server
      </button>
      <button type="button" onClick={() => dispatch({ type: 'SAVE_SCHEDULE_DRAFT' })}>
        Save draft
      </button>
      <button type="button" onClick={() => dispatch({ type: 'PUBLISH_SCHEDULE' })}>
        Publish
      </button>
      <button type="button" onClick={() => dispatch({ type: 'RESET_WEEK_DRAFT' })}>
        Reset week
      </button>
      <button
        type="button"
        onClick={() => dispatch({ type: 'TOGGLE_ASSIGNMENT', payload: { employeeId, role: 'Manager', day: 'Monday', shift: 'Open' } })}
      >
        Toggle Monday Open as Manager
      </button>
      <button
        type="button"
        onClick={() => dispatch({ type: 'TOGGLE_ASSIGNMENT', payload: { employeeId, role: 'Manager', day: 'Tuesday', shift: 'Open' } })}
      >
        Toggle Tuesday Open as Manager
      </button>
      <button
        type="button"
        onClick={() => dispatch({ type: 'TOGGLE_ASSIGNMENT', payload: { employeeId, role: 'Server', day: 'Monday', shift: 'Open' } })}
      >
        Toggle Monday Open as Server
      </button>
      <button
        type="button"
        onClick={() => dispatch({ type: 'TOGGLE_ASSIGNMENT', payload: { employeeId, role: 'Server', day: 'Tuesday', shift: 'Open' } })}
      >
        Toggle Tuesday Open as Server
      </button>
      <button
        type="button"
        onClick={() => dispatch({ type: 'UPDATE_REQUIREMENTS', payload: { role: 'Manager', day: 'Monday', shift: 'Open', value: 2 } })}
      >
        Set Manager Monday Open to 2
      </button>
      <button
        type="button"
        onClick={() => dispatch({ type: 'UPDATE_REQUIREMENTS', payload: { role: 'Server', day: 'Monday', shift: 'Open', value: 4 } })}
      >
        Set Server Monday Open to 4
      </button>
      <button
        type="button"
        onClick={() => dispatch({ type: 'UPDATE_REQUIREMENTS', payload: { role: '', day: 'Monday', shift: 'Open', value: 2 } })}
      >
        Set requirement with no role
      </button>
      <button
        type="button"
        onClick={() => dispatch({ type: 'APPLY_REQUIREMENTS_TO_ALL_DAYS', payload: { role: 'Manager', sourceDay: 'Monday' } })}
      >
        Apply Manager Monday to all days
      </button>
      <button type="button" onClick={() => dispatch({ type: 'SELECT_WEEK', payload: { startDate: '2026-05-24' } })}>
        Go to week A
      </button>
      <button type="button" onClick={() => dispatch({ type: 'SELECT_WEEK', payload: { startDate: '2026-05-31' } })}>
        Go to week B
      </button>
      <span>Assigned count: {assignedCount}</span>
      <span>Current week: {state.schedule.startDate}</span>
      <span>Manager Monday Open requirement: {state.schedule.roleRequirements?.Manager?.Monday?.Open ?? 0}</span>
      <span>Server Monday Open requirement: {state.schedule.roleRequirements?.Server?.Monday?.Open ?? 0}</span>
      <span>Manager Tuesday Open requirement: {state.schedule.roleRequirements?.Manager?.Tuesday?.Open ?? 0}</span>
      <span>Has unsaved changes: {state.schedule.hasUnsavedChanges ? 'yes' : 'no'}</span>
      <span>Has last saved at: {state.schedule.lastSavedAt ? 'yes' : 'no'}</span>
      <span>Schedule status: {state.schedule.status}</span>
      <span>Saved schedules count: {state.schedules.length}</span>
      <ul>
        {state.schedules.map((record) => (
          <li key={record.id}>{record.id} · {record.status}</li>
        ))}
      </ul>
    </>
  );
};

const twoRoleOperatingHours = {
  Sunday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
  Monday: { isOpen: true, openTime: '11:00', closeTime: '21:00' },
  Tuesday: { isOpen: true, openTime: '11:00', closeTime: '21:00' },
  Wednesday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
  Thursday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
  Friday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
  Saturday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
};

const emptyWeekGrid = (openValue = 0) => ({
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

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AppState scheduling', () => {
  it('respects each employee shifts per week cap during auto-build', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: {
        shiftTypes: ['Open'],
        weekStartsOn: 'Monday',
        operatingHours: twoRoleOperatingHours,
      },
      employees: [
        {
          id: 1,
          name: 'Jen Ray',
          roles: ['Manager'],
          shiftsPerWeek: 1,
          status: 'active',
          availability: availableEveryDay,
        },
      ],
      schedule: {
        weekLabel: 'May 25 - May 31, 2026',
        startDate: '2026-05-25',
        endDate: '2026-05-31',
        roleRequirements: {
          Manager: emptyWeekGrid(1),
        },
        assignments: { Manager: { 1: emptyAssignments() } },
      },
    }));

    render(
      <AppStateProvider>
        <TestHarness />
      </AppStateProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Generate draft' }));

    expect(screen.getByText('Assigned count: 1')).toBeInTheDocument();
  });

  it('prevents manual assignments from exceeding shifts per week cap', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: { shiftTypes: ['Open'], operatingHours: twoRoleOperatingHours },
      employees: [
        {
          id: 1,
          name: 'Jen Ray',
          roles: ['Manager'],
          shiftsPerWeek: 1,
          status: 'active',
          availability: availableEveryDay,
        },
      ],
      schedule: {
        roleRequirements: { Manager: emptyWeekGrid(0) },
        assignments: { Manager: { 1: emptyAssignments() } },
      },
    }));

    render(
      <AppStateProvider>
        <TestHarness />
      </AppStateProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Monday Open as Manager' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Tuesday Open as Manager' }));

    expect(screen.getByText('Assigned count: 1')).toBeInTheDocument();
  });

  it('blocks scheduling a second role once the employee\'s cross-role weekly cap is reached', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: { shiftTypes: ['Open'], operatingHours: twoRoleOperatingHours },
      employees: [
        {
          id: 1,
          name: 'Kayla Brooks',
          roles: ['Manager', 'Server'],
          shiftsPerWeek: 1,
          status: 'active',
          availability: availableEveryDay,
        },
      ],
      schedule: {
        roleRequirements: { Manager: emptyWeekGrid(0), Server: emptyWeekGrid(0) },
        assignments: { Manager: { 1: emptyAssignments() }, Server: { 1: emptyAssignments() } },
      },
    }));

    render(
      <AppStateProvider>
        <TestHarness />
      </AppStateProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Monday Open as Manager' }));
    expect(screen.getByText('Assigned count: 1')).toBeInTheDocument();

    // Already at the 1-shift cap via Manager — Server toggle should be blocked.
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Tuesday Open as Server' }));
    expect(screen.getByText('Assigned count: 1')).toBeInTheDocument();
  });

  it('blocks double-booking the same day and shift under a different role, and releases it when toggled off', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: { shiftTypes: ['Open'], operatingHours: twoRoleOperatingHours },
      employees: [
        {
          id: 1,
          name: 'Kayla Brooks',
          roles: ['Manager', 'Server'],
          shiftsPerWeek: 5,
          status: 'active',
          availability: availableEveryDay,
        },
      ],
      schedule: {
        roleRequirements: { Manager: emptyWeekGrid(0), Server: emptyWeekGrid(0) },
        assignments: { Manager: { 1: emptyAssignments() }, Server: { 1: emptyAssignments() } },
      },
    }));

    render(
      <AppStateProvider>
        <TestHarness />
      </AppStateProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Monday Open as Manager' }));
    expect(screen.getByText('Assigned count: 1')).toBeInTheDocument();

    // Can't work Server's Monday Open while already booked as Manager for
    // that same day and shift.
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Monday Open as Server' }));
    expect(screen.getByText('Assigned count: 1')).toBeInTheDocument();

    // Freeing the Manager slot lets the Server toggle succeed.
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Monday Open as Manager' }));
    expect(screen.getByText('Assigned count: 0')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Monday Open as Server' }));
    expect(screen.getByText('Assigned count: 1')).toBeInTheDocument();
  });

  it('auto-build respects an employee\'s existing assignment under another role', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Monday', operatingHours: twoRoleOperatingHours },
      employees: [
        {
          id: 1,
          name: 'Kayla Brooks',
          roles: ['Manager', 'Server'],
          shiftsPerWeek: 1,
          status: 'active',
          availability: availableEveryDay,
        },
      ],
      schedule: {
        weekLabel: 'May 25 - May 31, 2026',
        startDate: '2026-05-25',
        endDate: '2026-05-31',
        roleRequirements: { Manager: emptyWeekGrid(1), Server: emptyWeekGrid(1) },
        assignments: {
          Manager: { 1: { ...emptyAssignments(), Monday: ['Open'] } },
          Server: { 1: emptyAssignments() },
        },
      },
    }));

    render(
      <AppStateProvider>
        <TestHarness />
      </AppStateProvider>,
    );

    expect(screen.getByText('Assigned count: 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Auto-build Server' }));

    // Kayla is already at her 1-shift cap via Manager, so auto-build can't
    // also place her under Server even though Server has an open Monday slot.
    expect(screen.getByText('Assigned count: 1')).toBeInTheDocument();
  });

  it('keeps coverage targets independent per role on the shared week', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: { shiftTypes: ['Open'], operatingHours: twoRoleOperatingHours },
      employees: [
        { id: 1, name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 5, status: 'active', availability: availableEveryDay },
        { id: 2, name: 'Ava Cole', roles: ['Server'], shiftsPerWeek: 5, status: 'active', availability: availableEveryDay },
      ],
      schedule: {
        roleRequirements: { Manager: emptyWeekGrid(1), Server: emptyWeekGrid(0) },
        assignments: { Manager: { 1: emptyAssignments() }, Server: { 2: emptyAssignments() } },
      },
    }));

    render(
      <AppStateProvider>
        <TestHarness />
      </AppStateProvider>,
    );

    expect(screen.getByText('Manager Monday Open requirement: 1')).toBeInTheDocument();
    expect(screen.getByText('Server Monday Open requirement: 0')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Set Server Monday Open to 4' }));

    expect(screen.getByText('Manager Monday Open requirement: 1')).toBeInTheDocument();
    expect(screen.getByText('Server Monday Open requirement: 4')).toBeInTheDocument();
  });

  it('does not update coverage requirements when no role is provided', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: { shiftTypes: ['Open'] },
      schedule: { roleRequirements: { Manager: emptyWeekGrid(0) } },
    }));

    render(
      <AppStateProvider>
        <TestHarness />
      </AppStateProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Set requirement with no role' }));

    expect(screen.getByText('Manager Monday Open requirement: 0')).toBeInTheDocument();
    expect(screen.getByText('Has unsaved changes: no')).toBeInTheDocument();
  });

  it('applies one day\'s coverage targets to every day for that role only', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: { shiftTypes: ['Open'], operatingHours: twoRoleOperatingHours },
      employees: [
        { id: 1, name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 5, status: 'active', availability: availableEveryDay },
      ],
      schedule: {
        roleRequirements: { Manager: emptyWeekGrid(3), Server: emptyWeekGrid(0) },
        assignments: { Manager: { 1: emptyAssignments() } },
      },
    }));

    render(
      <AppStateProvider>
        <TestHarness />
      </AppStateProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Apply Manager Monday to all days' }));

    expect(screen.getByText('Manager Tuesday Open requirement: 3')).toBeInTheDocument();
    expect(screen.getByText('Server Monday Open requirement: 0')).toBeInTheDocument();
  });

  it('requires signal before publishing and blocks it while any role with demand still has an open slot', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Monday', operatingHours: twoRoleOperatingHours },
      employees: [
        { id: 1, name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay },
        { id: 2, name: 'Ava Cole', roles: ['Server'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay },
      ],
      schedule: {
        weekLabel: 'May 25 - May 31, 2026',
        startDate: '2026-05-25',
        endDate: '2026-05-31',
        roleRequirements: {
          Manager: emptyWeekGrid(1),
          Server: emptyWeekGrid(1),
        },
        assignments: {
          Manager: { 1: { ...emptyAssignments(), Monday: ['Open'] } },
          Server: { 2: emptyAssignments() },
        },
      },
    }));

    render(
      <AppStateProvider>
        <TestHarness />
      </AppStateProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    expect(screen.getByText('Schedule status: draft')).toBeInTheDocument();
    expect(screen.getByText('Saved schedules count: 0')).toBeInTheDocument();
  });

  it('saves one record per role with signal, skipping roles with no demand or assignments', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Monday', operatingHours: twoRoleOperatingHours },
      employees: [
        { id: 1, name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay },
        { id: 2, name: 'Ava Cole', roles: ['Server'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay },
      ],
      schedule: {
        weekLabel: 'May 25 - May 31, 2026',
        startDate: '2026-05-25',
        endDate: '2026-05-31',
        roleRequirements: {
          Manager: emptyWeekGrid(1),
          Server: emptyWeekGrid(0),
        },
        assignments: {
          Manager: { 1: { ...emptyAssignments(), Monday: ['Open'] } },
          Server: { 2: emptyAssignments() },
        },
        hasUnsavedChanges: true,
      },
    }));

    render(
      <AppStateProvider>
        <TestHarness />
      </AppStateProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(screen.getByText('Saved schedules count: 1')).toBeInTheDocument();
    expect(screen.getByText('2026-05-25__Manager · draft')).toBeInTheDocument();
  });

  it('publishing upserts the same record instead of duplicating it', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: {
        Sunday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
        Monday: { isOpen: true, openTime: '11:00', closeTime: '21:00' },
        Tuesday: { isOpen: true, openTime: '11:00', closeTime: '21:00' },
        Wednesday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
        Thursday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
        Friday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
        Saturday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
      } },
      employees: [
        { id: 1, name: 'Jen Ray', roles: ['Manager'], status: 'active', shiftsPerWeek: 2, availability: availableEveryDay },
      ],
      schedule: {
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        roleRequirements: { Manager: emptyWeekGrid(1) },
        assignments: { Manager: { 1: { ...emptyAssignments(), Monday: ['Open'] } } },
      },
    }));

    render(
      <AppStateProvider>
        <TestHarness />
      </AppStateProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(screen.getByText('Saved schedules count: 1')).toBeInTheDocument();
    expect(screen.getByText('2026-05-24__Manager · published')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Tuesday Open as Manager' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(screen.getByText('Saved schedules count: 1')).toBeInTheDocument();
    expect(screen.getByText('2026-05-24__Manager · draft')).toBeInTheDocument();
  });

  it('resets every role\'s requirements and assignments for the week without touching saved history', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: twoRoleOperatingHours },
      employees: [
        { id: 1, name: 'Jen Ray', roles: ['Manager'], status: 'active', shiftsPerWeek: 2, availability: availableEveryDay },
      ],
      schedule: {
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        notes: 'Bring in patio support.',
        roleRequirements: { Manager: emptyWeekGrid(1), Server: emptyWeekGrid(2) },
        assignments: { Manager: { 1: { ...emptyAssignments(), Monday: ['Open'] } } },
      },
      schedules: [{
        id: '2026-05-24__Manager',
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        role: 'Manager',
        status: 'published',
        requirements: emptyWeekGrid(1),
        assignments: { 1: { ...emptyAssignments(), Monday: ['Open'] } },
        notes: '',
        savedAt: '2026-05-20T12:00:00.000Z',
        publishedAt: '2026-05-20T12:00:00.000Z',
      }],
    }));

    render(
      <AppStateProvider>
        <TestHarness />
      </AppStateProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reset week' }));

    expect(screen.getByText('Manager Monday Open requirement: 0')).toBeInTheDocument();
    expect(screen.getByText('Server Monday Open requirement: 0')).toBeInTheDocument();
    expect(screen.getByText('Assigned count: 0')).toBeInTheDocument();
    expect(screen.getByText('Has unsaved changes: no')).toBeInTheDocument();
    expect(screen.getByText('Has last saved at: no')).toBeInTheDocument();
    expect(screen.getByText('Saved schedules count: 1')).toBeInTheDocument();
    expect(screen.getByText('2026-05-24__Manager · published')).toBeInTheDocument();
  });

  it('keeps a saved draft resumable after switching to a different week and back', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: twoRoleOperatingHours },
      employees: [
        { id: 1, name: 'Jen Ray', roles: ['Manager'], status: 'active', shiftsPerWeek: 2, availability: availableEveryDay },
      ],
      schedule: {
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        roleRequirements: { Manager: emptyWeekGrid(1) },
        assignments: { Manager: { 1: emptyAssignments() } },
        hasUnsavedChanges: true,
      },
    }));

    render(
      <AppStateProvider>
        <TestHarness />
      </AppStateProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(screen.getByText('Saved schedules count: 1')).toBeInTheDocument();
    expect(screen.getByText('2026-05-24__Manager · draft')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Go to week B' }));
    expect(screen.getByText('Manager Monday Open requirement: 0')).toBeInTheDocument();
    expect(screen.getByText('Has last saved at: no')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Go to week A' }));
    expect(screen.getByText('Manager Monday Open requirement: 1')).toBeInTheDocument();
    expect(screen.getByText('Has last saved at: yes')).toBeInTheDocument();
    expect(screen.getByText('Schedule status: draft')).toBeInTheDocument();
  });

  it('autosaves an unsaved edit into schedule history a couple seconds after the user stops typing', () => {
    vi.useFakeTimers();

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: twoRoleOperatingHours },
      employees: [
        { id: 1, name: 'Jen Ray', roles: ['Manager'], status: 'active', shiftsPerWeek: 2, availability: availableEveryDay },
      ],
      schedule: {
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        roleRequirements: { Manager: emptyWeekGrid(0) },
        assignments: { Manager: { 1: emptyAssignments() } },
      },
    }));

    render(
      <AppStateProvider>
        <TestHarness />
      </AppStateProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Set Manager Monday Open to 2' }));

    expect(screen.getByText('Has unsaved changes: yes')).toBeInTheDocument();
    expect(screen.getByText('Saved schedules count: 0')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByText('Has unsaved changes: no')).toBeInTheDocument();
    expect(screen.getByText('Saved schedules count: 1')).toBeInTheDocument();
    expect(screen.getByText('2026-05-24__Manager · draft')).toBeInTheDocument();
  });

  it('migrates legacy publishHistory and an unpublished saved draft into schedules on load', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday' },
      employees: [{ id: 1, name: 'Jen Ray', role: 'Manager', status: 'active' }],
      schedule: {
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        selectedRole: 'Manager',
        status: 'draft',
        lastSavedAt: '2026-05-20T12:00:00.000Z',
        hasUnsavedChanges: false,
        notes: 'Legacy saved draft',
        requirements: { Sunday: { Open: 0 }, Monday: { Open: 1 }, Tuesday: { Open: 0 }, Wednesday: { Open: 0 }, Thursday: { Open: 0 }, Friday: { Open: 0 }, Saturday: { Open: 0 } },
        assignments: {},
        publishHistory: [
          {
            id: 'legacy-1',
            weekLabel: 'May 17 - May 23, 2026',
            startDate: '2026-05-17',
            endDate: '2026-05-23',
            selectedRole: 'Server',
            publishedAt: '2026-05-16T12:00:00.000Z',
            requirements: {},
            assignments: {},
            notes: '',
          },
        ],
      },
    }));

    render(
      <AppStateProvider>
        <TestHarness />
      </AppStateProvider>,
    );

    expect(screen.getByText('Saved schedules count: 2')).toBeInTheDocument();
    expect(screen.getByText('2026-05-17__Server · published')).toBeInTheDocument();
    expect(screen.getByText('2026-05-24__Manager · draft')).toBeInTheDocument();
  });
});
