import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AppStateProvider, useAppState } from './AppState';

const STORAGE_KEY = 'shiftsizzle.app-state.v1';

const TestHarness = () => {
  const { state, dispatch } = useAppState();
  const employeeId = state.employees[0]?.id;
  const assignedCount = employeeId
    ? Object.values(state.schedule.assignments[employeeId] ?? {}).reduce(
      (total, shifts) => total + shifts.length,
      0,
    )
    : 0;
  const mondayOpenRequirement = state.schedule.requirements?.Monday?.Open ?? 0;
  const selectedRoleAssignedCount = state.employees
    .filter((employee) => employee.role === state.schedule.selectedRole)
    .reduce(
      (total, employee) => total + Object.values(state.schedule.assignments[employee.id] ?? {}).reduce(
        (shiftTotal, shifts) => shiftTotal + shifts.length,
        0,
      ),
      0,
    );

  return (
    <>
      <button type="button" onClick={() => dispatch({ type: 'AUTO_BUILD_SCHEDULE' })}>
        Generate draft
      </button>
      <button type="button" onClick={() => dispatch({ type: 'SAVE_SCHEDULE_DRAFT' })}>
        Save draft
      </button>
      <button type="button" onClick={() => dispatch({ type: 'PUBLISH_SCHEDULE' })}>
        Publish
      </button>
      <button
        type="button"
        onClick={() => dispatch({ type: 'TOGGLE_ASSIGNMENT', payload: { employeeId, day: 'Monday', shift: 'Open' } })}
      >
        Toggle Monday Open
      </button>
      <button
        type="button"
        onClick={() => dispatch({ type: 'TOGGLE_ASSIGNMENT', payload: { employeeId, day: 'Tuesday', shift: 'Open' } })}
      >
        Toggle Tuesday Open
      </button>
      <button
        type="button"
        onClick={() => dispatch({ type: 'UPDATE_REQUIREMENTS', payload: {
          ...state.schedule.requirements,
          Monday: {
            ...state.schedule.requirements.Monday,
            Open: 2,
          },
        } })}
      >
        Set Monday Open to 2
      </button>
      <button type="button" onClick={() => dispatch({ type: 'SET_SELECTED_ROLE', payload: 'Server' })}>
        Switch to Server
      </button>
      <button type="button" onClick={() => dispatch({ type: 'SET_SELECTED_ROLE', payload: 'Manager' })}>
        Switch to Manager
      </button>
      <button type="button" onClick={() => dispatch({ type: 'SET_SCHEDULE_START_DATE', payload: '2026-05-24' })}>
        Go to week A
      </button>
      <button type="button" onClick={() => dispatch({ type: 'SET_SCHEDULE_START_DATE', payload: '2026-05-31' })}>
        Go to week B
      </button>
      <button
        type="button"
        onClick={() => dispatch({ type: 'RESUME_SCHEDULE', payload: '2026-05-24__Manager' })}
      >
        Resume week A Manager
      </button>
      <span>Assigned count: {assignedCount}</span>
      <span>Selected role assigned count: {selectedRoleAssignedCount}</span>
      <span>Current role: {state.schedule.selectedRole}</span>
      <span>Current week: {state.schedule.startDate}</span>
      <span>Monday Open requirement: {mondayOpenRequirement}</span>
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

describe('AppState scheduling', () => {
  it('respects each employee shifts per week cap during auto-build', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: {
        shiftTypes: ['Open'],
        weekStartsOn: 'Monday',
        operatingHours: {
          Sunday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
          Monday: { isOpen: true, openTime: '11:00', closeTime: '21:00' },
          Tuesday: { isOpen: true, openTime: '11:00', closeTime: '21:00' },
          Wednesday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
          Thursday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
          Friday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
          Saturday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
        },
      },
      employees: [
        {
          id: 1,
          name: 'Jen Ray',
          title: 'General Manager',
          role: 'Manager',
          contact: '(555) 010-1001',
          email: 'jen@shiftsizzle.app',
          shiftsPerWeek: 1,
          status: 'active',
          availability: {
            Sunday: ['Open'],
            Monday: ['Open'],
            Tuesday: ['Open'],
            Wednesday: ['Open'],
            Thursday: ['Open'],
            Friday: ['Open'],
            Saturday: ['Open'],
          },
        },
      ],
      schedule: {
        weekLabel: 'May 25 - May 31, 2026',
        startDate: '2026-05-25',
        endDate: '2026-05-31',
        selectedRole: 'Manager',
        requirements: {
          Sunday: { Open: 0 },
          Monday: { Open: 1 },
          Tuesday: { Open: 1 },
          Wednesday: { Open: 0 },
          Thursday: { Open: 0 },
          Friday: { Open: 0 },
          Saturday: { Open: 0 },
        },
        assignments: {
          1: {
            Sunday: [],
            Monday: [],
            Tuesday: [],
            Wednesday: [],
            Thursday: [],
            Friday: [],
            Saturday: [],
          },
        },
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
      settings: {
        shiftTypes: ['Open'],
        operatingHours: {
          Sunday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
          Monday: { isOpen: true, openTime: '11:00', closeTime: '21:00' },
          Tuesday: { isOpen: true, openTime: '11:00', closeTime: '21:00' },
          Wednesday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
          Thursday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
          Friday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
          Saturday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
        },
      },
      employees: [
        {
          id: 1,
          name: 'Jen Ray',
          title: 'General Manager',
          role: 'Manager',
          contact: '(555) 010-1001',
          email: 'jen@shiftsizzle.app',
          shiftsPerWeek: 1,
          status: 'active',
          availability: {
            Sunday: ['Open'],
            Monday: ['Open'],
            Tuesday: ['Open'],
            Wednesday: ['Open'],
            Thursday: ['Open'],
            Friday: ['Open'],
            Saturday: ['Open'],
          },
        },
      ],
      schedule: {
        selectedRole: 'Manager',
        requirements: {
          Sunday: { Open: 0 },
          Monday: { Open: 0 },
          Tuesday: { Open: 0 },
          Wednesday: { Open: 0 },
          Thursday: { Open: 0 },
          Friday: { Open: 0 },
          Saturday: { Open: 0 },
        },
        assignments: {
          1: {
            Sunday: [],
            Monday: [],
            Tuesday: [],
            Wednesday: [],
            Thursday: [],
            Friday: [],
            Saturday: [],
          },
        },
      },
    }));

    render(
      <AppStateProvider>
        <TestHarness />
      </AppStateProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Monday Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Tuesday Open' }));

    expect(screen.getByText('Assigned count: 1')).toBeInTheDocument();
  });

  it('keeps coverage targets separate for each role when switching roles', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: {
        shiftTypes: ['Open'],
        operatingHours: {
          Sunday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
          Monday: { isOpen: true, openTime: '11:00', closeTime: '21:00' },
          Tuesday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
          Wednesday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
          Thursday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
          Friday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
          Saturday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
        },
      },
      employees: [
        {
          id: 1,
          name: 'Jen Ray',
          title: 'General Manager',
          role: 'Manager',
          contact: '(555) 010-1001',
          email: 'jen@shiftsizzle.app',
          shiftsPerWeek: 5,
          status: 'active',
          availability: {
            Sunday: ['Open'], Monday: ['Open'], Tuesday: ['Open'], Wednesday: ['Open'], Thursday: ['Open'], Friday: ['Open'], Saturday: ['Open'],
          },
        },
        {
          id: 2,
          name: 'Ava Cole',
          title: 'Server',
          role: 'Server',
          contact: '(555) 010-1002',
          email: 'ava@shiftsizzle.app',
          shiftsPerWeek: 5,
          status: 'active',
          availability: {
            Sunday: ['Open'], Monday: ['Open'], Tuesday: ['Open'], Wednesday: ['Open'], Thursday: ['Open'], Friday: ['Open'], Saturday: ['Open'],
          },
        },
      ],
      schedule: {
        selectedRole: 'Manager',
        requirements: {
          Sunday: { Open: 0 },
          Monday: { Open: 1 },
          Tuesday: { Open: 0 },
          Wednesday: { Open: 0 },
          Thursday: { Open: 0 },
          Friday: { Open: 0 },
          Saturday: { Open: 0 },
        },
        roleRequirements: {
          Manager: {
            Sunday: { Open: 0 },
            Monday: { Open: 1 },
            Tuesday: { Open: 0 },
            Wednesday: { Open: 0 },
            Thursday: { Open: 0 },
            Friday: { Open: 0 },
            Saturday: { Open: 0 },
          },
          Server: {
            Sunday: { Open: 0 },
            Monday: { Open: 4 },
            Tuesday: { Open: 0 },
            Wednesday: { Open: 0 },
            Thursday: { Open: 0 },
            Friday: { Open: 0 },
            Saturday: { Open: 0 },
          },
        },
        assignments: {
          1: { Sunday: [], Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [] },
          2: { Sunday: [], Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [] },
        },
      },
    }));

    render(
      <AppStateProvider>
        <TestHarness />
      </AppStateProvider>,
    );

    expect(screen.getByText('Current role: Manager')).toBeInTheDocument();
    expect(screen.getByText('Monday Open requirement: 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Set Monday Open to 2' }));
    expect(screen.getByText('Monday Open requirement: 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Switch to Server' }));
    expect(screen.getByText('Current role: Server')).toBeInTheDocument();
    expect(screen.getByText('Monday Open requirement: 4')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Switch to Manager' }));
    expect(screen.getByText('Current role: Manager')).toBeInTheDocument();
    expect(screen.getByText('Monday Open requirement: 2')).toBeInTheDocument();
  });

  it('requires an explicit draft save before publishing', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: {
        shiftTypes: ['Open'],
        weekStartsOn: 'Monday',
        operatingHours: {
          Sunday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
          Monday: { isOpen: true, openTime: '11:00', closeTime: '21:00' },
          Tuesday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
          Wednesday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
          Thursday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
          Friday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
          Saturday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
        },
      },
      employees: [
        {
          id: 1,
          name: 'Jen Ray',
          title: 'General Manager',
          role: 'Manager',
          contact: '(555) 010-1001',
          email: 'jen@shiftsizzle.app',
          shiftsPerWeek: 2,
          status: 'active',
          availability: {
            Sunday: ['Open'],
            Monday: ['Open'],
            Tuesday: ['Open'],
            Wednesday: ['Open'],
            Thursday: ['Open'],
            Friday: ['Open'],
            Saturday: ['Open'],
          },
        },
      ],
      schedule: {
        weekLabel: 'May 25 - May 31, 2026',
        startDate: '2026-05-25',
        endDate: '2026-05-31',
        selectedRole: 'Manager',
        requirements: {
          Sunday: { Open: 0 },
          Monday: { Open: 1 },
          Tuesday: { Open: 0 },
          Wednesday: { Open: 0 },
          Thursday: { Open: 0 },
          Friday: { Open: 0 },
          Saturday: { Open: 0 },
        },
        assignments: {
          1: {
            Sunday: [],
            Monday: ['Open'],
            Tuesday: [],
            Wednesday: [],
            Thursday: [],
            Friday: [],
            Saturday: [],
          },
        },
        notes: '',
        lastSavedAt: null,
        hasUnsavedChanges: true,
        lastPublishedAt: null,
        status: 'draft',
      },
    }));

    render(
      <AppStateProvider>
        <TestHarness />
      </AppStateProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    expect(screen.getByText('Schedule status: draft')).toBeInTheDocument();
    expect(screen.getByText('Has unsaved changes: yes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(screen.getByText('Has unsaved changes: no')).toBeInTheDocument();
    expect(screen.getByText('Has last saved at: yes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    expect(screen.getByText('Schedule status: published')).toBeInTheDocument();
  });

  it('does not update coverage requirements when no role is selected', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: {
        shiftTypes: ['Open'],
      },
      schedule: {
        selectedRole: '',
        requirements: {
          Sunday: { Open: 0 },
          Monday: { Open: 0 },
          Tuesday: { Open: 0 },
          Wednesday: { Open: 0 },
          Thursday: { Open: 0 },
          Friday: { Open: 0 },
          Saturday: { Open: 0 },
        },
      },
    }));

    render(
      <AppStateProvider>
        <TestHarness />
      </AppStateProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Set Monday Open to 2' }));

    expect(screen.getByText('Current role:')).toHaveTextContent('Current role:');
    expect(screen.getByText('Monday Open requirement: 0')).toBeInTheDocument();
    expect(screen.getByText('Has unsaved changes: no')).toBeInTheDocument();
  });

  it('does not auto-build a draft when switching roles', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: {
        shiftTypes: ['Open'],
        operatingHours: {
          Sunday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
          Monday: { isOpen: true, openTime: '11:00', closeTime: '21:00' },
          Tuesday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
          Wednesday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
          Thursday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
          Friday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
          Saturday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
        },
      },
      employees: [
        {
          id: 1,
          name: 'Jen Ray',
          title: 'General Manager',
          role: 'Manager',
          contact: '(555) 010-1001',
          email: 'jen@shiftsizzle.app',
          shiftsPerWeek: 5,
          status: 'active',
          availability: {
            Sunday: ['Open'], Monday: ['Open'], Tuesday: ['Open'], Wednesday: ['Open'], Thursday: ['Open'], Friday: ['Open'], Saturday: ['Open'],
          },
        },
        {
          id: 2,
          name: 'Ava Cole',
          title: 'Server',
          role: 'Server',
          contact: '(555) 010-1002',
          email: 'ava@shiftsizzle.app',
          shiftsPerWeek: 5,
          status: 'active',
          availability: {
            Sunday: ['Open'], Monday: ['Open'], Tuesday: ['Open'], Wednesday: ['Open'], Thursday: ['Open'], Friday: ['Open'], Saturday: ['Open'],
          },
        },
      ],
      schedule: {
        selectedRole: 'Manager',
        requirements: {
          Sunday: { Open: 0 },
          Monday: { Open: 1 },
          Tuesday: { Open: 0 },
          Wednesday: { Open: 0 },
          Thursday: { Open: 0 },
          Friday: { Open: 0 },
          Saturday: { Open: 0 },
        },
        roleRequirements: {
          Manager: {
            Sunday: { Open: 0 },
            Monday: { Open: 1 },
            Tuesday: { Open: 0 },
            Wednesday: { Open: 0 },
            Thursday: { Open: 0 },
            Friday: { Open: 0 },
            Saturday: { Open: 0 },
          },
          Server: {
            Sunday: { Open: 0 },
            Monday: { Open: 2 },
            Tuesday: { Open: 0 },
            Wednesday: { Open: 0 },
            Thursday: { Open: 0 },
            Friday: { Open: 0 },
            Saturday: { Open: 0 },
          },
        },
        assignments: {
          1: {
            Sunday: [],
            Monday: ['Open'],
            Tuesday: [],
            Wednesday: [],
            Thursday: [],
            Friday: [],
            Saturday: [],
          },
          2: {
            Sunday: [],
            Monday: [],
            Tuesday: [],
            Wednesday: [],
            Thursday: [],
            Friday: [],
            Saturday: [],
          },
        },
      },
    }));

    render(
      <AppStateProvider>
        <TestHarness />
      </AppStateProvider>,
    );

    expect(screen.getByText('Current role: Manager')).toBeInTheDocument();
    expect(screen.getByText('Selected role assigned count: 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Switch to Server' }));

    expect(screen.getByText('Current role: Server')).toBeInTheDocument();
    expect(screen.getByText('Selected role assigned count: 0')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Switch to Manager' }));

    expect(screen.getByText('Current role: Manager')).toBeInTheDocument();
    expect(screen.getByText('Selected role assigned count: 1')).toBeInTheDocument();
  });

  it('keeps a saved draft resumable after switching to a different week and back', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: {
        shiftTypes: ['Open'],
        weekStartsOn: 'Sunday',
        operatingHours: {
          Sunday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
          Monday: { isOpen: true, openTime: '11:00', closeTime: '21:00' },
          Tuesday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
          Wednesday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
          Thursday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
          Friday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
          Saturday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
        },
      },
      employees: [
        {
          id: 1,
          name: 'Jen Ray',
          role: 'Manager',
          status: 'active',
          shiftsPerWeek: 2,
          availability: {
            Sunday: ['Open'], Monday: ['Open'], Tuesday: ['Open'], Wednesday: ['Open'], Thursday: ['Open'], Friday: ['Open'], Saturday: ['Open'],
          },
        },
      ],
      schedule: {
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        selectedRole: 'Manager',
        requirements: {
          Sunday: { Open: 0 }, Monday: { Open: 1 }, Tuesday: { Open: 0 }, Wednesday: { Open: 0 }, Thursday: { Open: 0 }, Friday: { Open: 0 }, Saturday: { Open: 0 },
        },
        assignments: {
          1: { Sunday: [], Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [] },
        },
        notes: '',
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
    expect(screen.getByText('Monday Open requirement: 0')).toBeInTheDocument();
    expect(screen.getByText('Has last saved at: no')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Go to week A' }));
    expect(screen.getByText('Monday Open requirement: 1')).toBeInTheDocument();
    expect(screen.getByText('Has last saved at: yes')).toBeInTheDocument();
    expect(screen.getByText('Schedule status: draft')).toBeInTheDocument();
  });

  it('publishing upserts the same record instead of duplicating it', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: {
        shiftTypes: ['Open'],
        weekStartsOn: 'Sunday',
        operatingHours: {
          Sunday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
          Monday: { isOpen: true, openTime: '11:00', closeTime: '21:00' },
          Tuesday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
          Wednesday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
          Thursday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
          Friday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
          Saturday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
        },
      },
      employees: [
        {
          id: 1,
          name: 'Jen Ray',
          role: 'Manager',
          status: 'active',
          shiftsPerWeek: 2,
          availability: {
            Sunday: ['Open'], Monday: ['Open'], Tuesday: ['Open'], Wednesday: ['Open'], Thursday: ['Open'], Friday: ['Open'], Saturday: ['Open'],
          },
        },
      ],
      schedule: {
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        selectedRole: 'Manager',
        requirements: {
          Sunday: { Open: 0 }, Monday: { Open: 1 }, Tuesday: { Open: 0 }, Wednesday: { Open: 0 }, Thursday: { Open: 0 }, Friday: { Open: 0 }, Saturday: { Open: 0 },
        },
        assignments: {
          1: { Sunday: [], Monday: ['Open'], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [] },
        },
        notes: '',
        lastSavedAt: '2026-05-20T12:00:00.000Z',
        hasUnsavedChanges: false,
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

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Tuesday Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

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