import { useEffect, useRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppStateProvider, useAppState } from './AppState';
import { AuthProvider } from './AuthState';

vi.mock('../lib/supabaseClient', async () => {
  const { createFakeSupabaseClient } = await import('../test/fakeSupabaseClient');
  return { supabase: createFakeSupabaseClient() };
});

const { supabase } = await import('../lib/supabaseClient');
const { seedFakeSupabase } = await import('../test/fakeSupabaseClient');

const resetFakeSupabase = () => {
  Object.values(supabase.__tables).forEach((rows) => {
    rows.length = 0;
  });
  supabase.__setSession(null);
};

// Selects `initialWeek` once org data has loaded — has to wait for
// isHydrated rather than firing immediately on mount, since SELECT_WEEK's
// buildWeekRange needs the real settings.weekStartsOn (not the pre-hydrate
// default of "") to resolve a startDate instead of resetting it to "".
// Mirrors a manager navigating to a specific week via the Scheduler, just
// triggered automatically for tests.
const TestHarness = ({ initialWeek }) => {
  const { state, dispatch } = useAppState();
  const hasSelectedRef = useRef(false);

  useEffect(() => {
    if (initialWeek && state.isHydrated && !hasSelectedRef.current) {
      hasSelectedRef.current = true;
      dispatch({ type: 'SELECT_WEEK', payload: { startDate: initialWeek } });
    }
  }, [initialWeek, state.isHydrated, dispatch]);

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

const renderHarness = (initialWeek) =>
  render(
    <AuthProvider>
      <AppStateProvider>
        <TestHarness initialWeek={initialWeek} />
      </AppStateProvider>
    </AuthProvider>,
  );

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
  resetFakeSupabase();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AppState scheduling', () => {
  it('respects each employee shifts per week cap during auto-build', async () => {
    seedFakeSupabase(supabase, {
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Monday', operatingHours: twoRoleOperatingHours },
      employees: [
        { id: '1', name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 1, status: 'active', availability: availableEveryDay },
      ],
      schedules: [{
        weekLabel: 'May 25 - May 31, 2026',
        startDate: '2026-05-25',
        endDate: '2026-05-31',
        role: 'Manager',
        status: 'draft',
        requirements: emptyWeekGrid(1),
        assignments: { 1: emptyAssignments() },
      }],
    });

    renderHarness('2026-05-25');
    await screen.findByText('Manager Monday Open requirement: 1');

    fireEvent.click(screen.getByRole('button', { name: 'Generate draft' }));

    expect(screen.getByText('Assigned count: 1')).toBeInTheDocument();
  });

  it('prevents manual assignments from exceeding shifts per week cap', async () => {
    seedFakeSupabase(supabase, {
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Monday', operatingHours: twoRoleOperatingHours },
      employees: [
        { id: '1', name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 1, status: 'active', availability: availableEveryDay },
      ],
    });

    renderHarness();
    await screen.findByText('Manager Monday Open requirement: 0');

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Monday Open as Manager' }));
    expect(screen.getByText('Assigned count: 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Tuesday Open as Manager' }));
    expect(screen.getByText('Assigned count: 1')).toBeInTheDocument();
  });

  it('blocks scheduling a second role once the employee\'s cross-role weekly cap is reached', async () => {
    seedFakeSupabase(supabase, {
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Monday', operatingHours: twoRoleOperatingHours },
      employees: [
        { id: '1', name: 'Kayla Brooks', roles: ['Manager', 'Server'], shiftsPerWeek: 1, status: 'active', availability: availableEveryDay },
      ],
    });

    renderHarness();
    await screen.findByText('Manager Monday Open requirement: 0');

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Monday Open as Manager' }));
    expect(screen.getByText('Assigned count: 1')).toBeInTheDocument();

    // Already at the 1-shift cap via Manager — Server toggle should be blocked.
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Tuesday Open as Server' }));
    expect(screen.getByText('Assigned count: 1')).toBeInTheDocument();
  });

  it('blocks double-booking the same day and shift under a different role, and releases it when toggled off', async () => {
    seedFakeSupabase(supabase, {
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Monday', operatingHours: twoRoleOperatingHours },
      employees: [
        { id: '1', name: 'Kayla Brooks', roles: ['Manager', 'Server'], shiftsPerWeek: 5, status: 'active', availability: availableEveryDay },
      ],
    });

    renderHarness();
    await screen.findByText('Manager Monday Open requirement: 0');

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

  it('auto-build respects an employee\'s existing assignment under another role', async () => {
    seedFakeSupabase(supabase, {
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Monday', operatingHours: twoRoleOperatingHours },
      employees: [
        { id: '1', name: 'Kayla Brooks', roles: ['Manager', 'Server'], shiftsPerWeek: 1, status: 'active', availability: availableEveryDay },
      ],
      schedules: [
        {
          weekLabel: 'May 25 - May 31, 2026',
          startDate: '2026-05-25',
          endDate: '2026-05-31',
          role: 'Manager',
          status: 'draft',
          requirements: emptyWeekGrid(1),
          assignments: { 1: { ...emptyAssignments(), Monday: ['Open'] } },
        },
        {
          weekLabel: 'May 25 - May 31, 2026',
          startDate: '2026-05-25',
          endDate: '2026-05-31',
          role: 'Server',
          status: 'draft',
          requirements: emptyWeekGrid(1),
          assignments: { 1: emptyAssignments() },
        },
      ],
    });

    renderHarness('2026-05-25');
    await screen.findByText('Assigned count: 1');

    fireEvent.click(screen.getByRole('button', { name: 'Auto-build Server' }));

    // Kayla is already at her 1-shift cap via Manager, so auto-build can't
    // also place her under Server even though Server has an open Monday slot.
    expect(screen.getByText('Assigned count: 1')).toBeInTheDocument();
  });

  it('keeps coverage targets independent per role on the shared week', async () => {
    seedFakeSupabase(supabase, {
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Monday', operatingHours: twoRoleOperatingHours },
      employees: [
        { id: '1', name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 5, status: 'active', availability: availableEveryDay },
        { id: '2', name: 'Ava Cole', roles: ['Server'], shiftsPerWeek: 5, status: 'active', availability: availableEveryDay },
      ],
      schedules: [{
        startDate: '2026-06-01',
        endDate: '2026-06-07',
        role: 'Manager',
        status: 'draft',
        requirements: emptyWeekGrid(1),
        assignments: { 1: emptyAssignments() },
      }],
    });

    renderHarness('2026-06-01');
    await screen.findByText('Manager Monday Open requirement: 1');

    expect(screen.getByText('Server Monday Open requirement: 0')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Set Server Monday Open to 4' }));

    expect(screen.getByText('Manager Monday Open requirement: 1')).toBeInTheDocument();
    expect(screen.getByText('Server Monday Open requirement: 4')).toBeInTheDocument();
  });

  it('does not update coverage requirements when no role is provided', async () => {
    seedFakeSupabase(supabase, { settings: { shiftTypes: ['Open'] } });

    renderHarness();
    await screen.findByText('Manager Monday Open requirement: 0');

    fireEvent.click(screen.getByRole('button', { name: 'Set requirement with no role' }));

    expect(screen.getByText('Manager Monday Open requirement: 0')).toBeInTheDocument();
    expect(screen.getByText('Has unsaved changes: no')).toBeInTheDocument();
  });

  it('applies one day\'s coverage targets to every day for that role only', async () => {
    seedFakeSupabase(supabase, {
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Monday', operatingHours: twoRoleOperatingHours },
      employees: [
        { id: '1', name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 5, status: 'active', availability: availableEveryDay },
      ],
      schedules: [{
        startDate: '2026-06-01',
        endDate: '2026-06-07',
        role: 'Manager',
        status: 'draft',
        requirements: emptyWeekGrid(3),
        assignments: { 1: emptyAssignments() },
      }],
    });

    renderHarness('2026-06-01');
    await screen.findByText('Manager Monday Open requirement: 3');

    fireEvent.click(screen.getByRole('button', { name: 'Apply Manager Monday to all days' }));

    expect(screen.getByText('Manager Tuesday Open requirement: 3')).toBeInTheDocument();
    expect(screen.getByText('Server Monday Open requirement: 0')).toBeInTheDocument();
  });

  it('requires signal before publishing and blocks it while any role with demand still has an open slot', async () => {
    seedFakeSupabase(supabase, {
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Monday', operatingHours: twoRoleOperatingHours },
      employees: [
        { id: '1', name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay },
        { id: '2', name: 'Ava Cole', roles: ['Server'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay },
      ],
      schedules: [
        {
          weekLabel: 'May 25 - May 31, 2026',
          startDate: '2026-05-25',
          endDate: '2026-05-31',
          role: 'Manager',
          status: 'draft',
          requirements: emptyWeekGrid(1),
          assignments: { 1: { ...emptyAssignments(), Monday: ['Open'] } },
        },
        {
          weekLabel: 'May 25 - May 31, 2026',
          startDate: '2026-05-25',
          endDate: '2026-05-31',
          role: 'Server',
          status: 'draft',
          requirements: emptyWeekGrid(1),
          assignments: { 2: emptyAssignments() },
        },
      ],
    });

    renderHarness('2026-05-25');
    await screen.findByText('Saved schedules count: 2');

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    expect(screen.getByText('Schedule status: draft')).toBeInTheDocument();
    expect(screen.getByText('Saved schedules count: 2')).toBeInTheDocument();
  });

  it('saves one record per role with signal, skipping roles with no demand or assignments', async () => {
    seedFakeSupabase(supabase, {
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Monday', operatingHours: twoRoleOperatingHours },
      employees: [
        { id: '1', name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay },
        { id: '2', name: 'Ava Cole', roles: ['Server'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay },
      ],
      schedules: [{
        weekLabel: 'May 25 - May 31, 2026',
        startDate: '2026-05-25',
        endDate: '2026-05-31',
        role: 'Manager',
        status: 'draft',
        requirements: emptyWeekGrid(1),
        assignments: { 1: { ...emptyAssignments(), Monday: ['Open'] } },
      }],
    });

    renderHarness('2026-05-25');
    await screen.findByText('Saved schedules count: 1');

    // Dirty the draft without touching Manager's seeded requirement value —
    // Server still has zero requirements/assignments (the default), so it
    // stays signal-free and should be skipped on save.
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Tuesday Open as Manager' }));

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(screen.getByText('Saved schedules count: 1')).toBeInTheDocument();
    expect(screen.getByText('2026-05-25__Manager · draft')).toBeInTheDocument();
  });

  it('publishing upserts the same record instead of duplicating it', async () => {
    const customOperatingHours = {
      Sunday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
      Monday: { isOpen: true, openTime: '11:00', closeTime: '21:00' },
      Tuesday: { isOpen: true, openTime: '11:00', closeTime: '21:00' },
      Wednesday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
      Thursday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
      Friday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
      Saturday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
    };

    seedFakeSupabase(supabase, {
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: customOperatingHours },
      employees: [
        { id: '1', name: 'Jen Ray', roles: ['Manager'], status: 'active', shiftsPerWeek: 2, availability: availableEveryDay },
      ],
      schedules: [{
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        role: 'Manager',
        status: 'draft',
        requirements: emptyWeekGrid(1),
        assignments: { 1: { ...emptyAssignments(), Monday: ['Open'] } },
      }],
    });

    renderHarness('2026-05-24');
    await screen.findByText('Saved schedules count: 1');

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(screen.getByText('Saved schedules count: 1')).toBeInTheDocument();
    expect(screen.getByText('2026-05-24__Manager · published')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Tuesday Open as Manager' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(screen.getByText('Saved schedules count: 1')).toBeInTheDocument();
    expect(screen.getByText('2026-05-24__Manager · draft')).toBeInTheDocument();
  });

  it('resets every role\'s requirements and assignments for the week without touching saved history', async () => {
    seedFakeSupabase(supabase, {
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: twoRoleOperatingHours },
      employees: [
        { id: '1', name: 'Jen Ray', roles: ['Manager'], status: 'active', shiftsPerWeek: 2, availability: availableEveryDay },
      ],
      schedules: [{
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
    });

    renderHarness('2026-05-24');
    await screen.findByText('Manager Monday Open requirement: 1');

    fireEvent.click(screen.getByRole('button', { name: 'Set Server Monday Open to 4' }));
    expect(screen.getByText('Server Monday Open requirement: 4')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reset week' }));

    expect(screen.getByText('Manager Monday Open requirement: 0')).toBeInTheDocument();
    expect(screen.getByText('Server Monday Open requirement: 0')).toBeInTheDocument();
    expect(screen.getByText('Assigned count: 0')).toBeInTheDocument();
    expect(screen.getByText('Has unsaved changes: no')).toBeInTheDocument();
    expect(screen.getByText('Has last saved at: no')).toBeInTheDocument();
    expect(screen.getByText('Saved schedules count: 1')).toBeInTheDocument();
    expect(screen.getByText('2026-05-24__Manager · published')).toBeInTheDocument();
  });

  it('keeps a saved draft resumable after switching to a different week and back', async () => {
    seedFakeSupabase(supabase, {
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: twoRoleOperatingHours },
      employees: [
        { id: '1', name: 'Jen Ray', roles: ['Manager'], status: 'active', shiftsPerWeek: 2, availability: availableEveryDay },
      ],
      schedules: [{
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        role: 'Manager',
        status: 'draft',
        requirements: emptyWeekGrid(1),
        assignments: { 1: emptyAssignments() },
      }],
    });

    renderHarness('2026-05-24');
    await screen.findByText('Manager Monday Open requirement: 1');

    // Dirty the draft without touching the seeded requirement value.
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Monday Open as Manager' }));

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

  it('autosaves an unsaved edit into schedule history a couple seconds after the user stops typing', async () => {
    seedFakeSupabase(supabase, {
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: twoRoleOperatingHours },
      employees: [
        { id: '1', name: 'Jen Ray', roles: ['Manager'], status: 'active', shiftsPerWeek: 2, availability: availableEveryDay },
      ],
    });

    renderHarness('2026-05-24');
    await screen.findByText('Manager Monday Open requirement: 0');

    // Switch to fake timers only after the async hydration above has
    // already settled, so RTL's polling isn't stuck waiting on a clock
    // that never advances.
    vi.useFakeTimers();

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
});
