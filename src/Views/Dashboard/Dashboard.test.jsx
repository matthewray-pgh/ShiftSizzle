import { useEffect, useRef } from 'react';
import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppState } from '../../state/AppState';
import { renderView } from '../../test/renderView';
import { Dashboard } from './Dashboard';

vi.mock('../../lib/supabaseClient', async () => {
  const { createFakeSupabaseClient } = await import('../../test/fakeSupabaseClient');
  return { supabase: createFakeSupabaseClient() };
});

const { supabase } = await import('../../lib/supabaseClient');

const resetFakeSupabase = () => {
  Object.values(supabase.__tables).forEach((rows) => {
    rows.length = 0;
  });
  supabase.__setSession(null);
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

const mondayOnlyOperatingHours = {
  Sunday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
  Monday: { isOpen: true, openTime: '11:00', closeTime: '21:00' },
  Tuesday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
  Wednesday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
  Thursday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
  Friday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
  Saturday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
};

const mondayTuesdayOperatingHours = {
  ...mondayOnlyOperatingHours,
  Tuesday: { isOpen: true, openTime: '11:00', closeTime: '21:00' },
};

// Selects a different (future) week in the live editing canvas and dirties
// it, once org data has hydrated — simulates a manager who is mid-draft on
// a future week in the Scheduler while the Dashboard should keep showing
// the actual current week, sourced from saved history instead.
const DashboardWithMidDraftFutureWeek = () => {
  const { state, dispatch } = useAppState();
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (state.isHydrated && !hasRunRef.current) {
      hasRunRef.current = true;
      dispatch({ type: 'SELECT_WEEK', payload: { startDate: '2026-06-21' } });
      dispatch({ type: 'UPDATE_REQUIREMENTS', payload: { role: 'Manager', day: 'Monday', shift: 'Open', value: 9 } });
      dispatch({ type: 'UPDATE_SCHEDULE_NOTES', payload: 'Draft notes for the future week.' });
    }
  }, [state.isHydrated, dispatch]);

  return <Dashboard />;
};

describe('Dashboard view', () => {
  beforeEach(() => {
    resetFakeSupabase();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the dashboard page', async () => {
    await renderView(Dashboard);

    expect(screen.getByText('Hello, Jen Ray')).toBeInTheDocument();
    expect(screen.getByText('Coverage')).toBeInTheDocument();
    expect(screen.getByText('Shifts scheduled')).toBeInTheDocument();
    expect(screen.getByText('Business Hours')).toBeInTheDocument();

    // A fresh org has no configured hours yet (operating_hours seeds as
    // `{}`) — every day should read "Closed" until the owner sets hours in
    // Settings, not a guessed default schedule.
    const hoursList = screen.getByText('Business Hours').closest('.dashboard__panel--hours');

    expect(within(hoursList).getByText('Sun')).toBeInTheDocument();
    expect(within(hoursList).getByText('Thu')).toBeInTheDocument();
    expect(within(hoursList).getByText('Fri')).toBeInTheDocument();
    expect(within(hoursList).getByText('Sat')).toBeInTheDocument();
    expect(within(hoursList).getAllByText('Closed')).toHaveLength(7);
  });

  // Regression test for backlog #1: Assigned/Open shifts used to go stale
  // relative to each other because one metric summed every role while the
  // other filtered to a single selected role. Both must now aggregate
  // across every role for the active week, and stay consistent regardless
  // of which role most recently had focus.
  it('aggregates Assigned and Open shifts across every role, not just one', async () => {
    // Only Date is faked (not timers) so RTL's async findBy/waitFor polling
    // (used to await the async Supabase hydration) keeps working — a bare
    // vi.useFakeTimers() would freeze setTimeout and hang that polling.
    vi.useFakeTimers({ toFake: ['Date'] });
    // Pin "today" to a Wednesday inside the seeded week (May 24-30, 2026)
    // so the Dashboard resolves this as the current week regardless of
    // which day within it "today" happens to fall on.
    vi.setSystemTime(new Date('2026-05-27T12:00:00'));

    await renderView(Dashboard, {
      settings: {
        shiftTypes: ['Open'],
        weekStartsOn: 'Sunday',
        operatingHours: mondayOnlyOperatingHours,
      },
      employees: [
        { id: '1', name: 'Jen Ray', roles: ['Manager'], status: 'active', shiftsPerWeek: 2, availability: availableEveryDay },
        { id: '2', name: 'Ava Cole', roles: ['Server'], status: 'active', shiftsPerWeek: 2, availability: availableEveryDay },
      ],
      // Manager is fully covered (1 required, 1 assigned); Server has a
      // gap (2 required, 0 assigned). Total: 1 assigned shift, 2 open.
      schedules: [
        {
          weekLabel: 'May 24 - May 30, 2026',
          startDate: '2026-05-24',
          endDate: '2026-05-30',
          role: 'Manager',
          status: 'draft',
          requirements: grid(1),
          assignments: { 1: { ...emptyAssignments(), Monday: ['Open'] } },
        },
        {
          weekLabel: 'May 24 - May 30, 2026',
          startDate: '2026-05-24',
          endDate: '2026-05-30',
          role: 'Server',
          status: 'draft',
          requirements: grid(2),
          assignments: { 2: emptyAssignments() },
        },
      ],
    });

    expect(screen.getByText('Shifts scheduled')).toBeInTheDocument();
    const assignedCard = screen.getByText('Shifts scheduled').closest('.dashboard__metric');
    const openCard = screen.getByText('Open shifts').closest('.dashboard__metric');

    expect(assignedCard.querySelector('.dashboard__metric-value')).toHaveTextContent('1');
    expect(openCard.querySelector('.dashboard__metric-value')).toHaveTextContent('2');
  });

  it('shows the current week\'s schedule even when a different week is loaded in the Scheduler canvas', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-05-27T12:00:00')); // Wednesday inside the May 24-30 week

    await renderView(DashboardWithMidDraftFutureWeek, {
      settings: {
        shiftTypes: ['Open'],
        weekStartsOn: 'Sunday',
        operatingHours: mondayOnlyOperatingHours,
      },
      employees: [
        { id: '1', name: 'Jen Ray', roles: ['Manager'], status: 'active', shiftsPerWeek: 2, availability: availableEveryDay },
      ],
      // The CURRENT week already has a published schedule; the harness
      // above puts the live canvas mid-draft on a FUTURE week instead.
      schedules: [{
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        role: 'Manager',
        status: 'published',
        requirements: grid(1),
        assignments: { 1: { ...emptyAssignments(), Monday: ['Open'] } },
        notes: 'Patio opens for summer.',
        savedAt: '2026-05-20T12:00:00.000Z',
        publishedAt: '2026-05-20T12:00:00.000Z',
      }],
    });

    expect((await screen.findAllByText(/May 24 - May 30, 2026/)).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/Jun 21 - Jun 27, 2026/).length).toBe(0);
    expect(screen.getByText('Patio opens for summer.')).toBeInTheDocument();
    expect(screen.queryByText('Draft notes for the future week.')).not.toBeInTheDocument();

    const assignedCard = screen.getByText('Shifts scheduled').closest('.dashboard__metric');
    const openCard = screen.getByText('Open shifts').closest('.dashboard__metric');

    expect(assignedCard.querySelector('.dashboard__metric-value')).toHaveTextContent('1');
    expect(openCard.querySelector('.dashboard__metric-value')).toHaveTextContent('0');
  });

  it('shows the logged-in employee\'s own shifts in the My Schedule panel, not the whole roster', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-05-27T12:00:00'));

    await renderView(Dashboard, {
      employeeId: '2',
      settings: {
        shiftTypes: ['Open'],
        weekStartsOn: 'Sunday',
        operatingHours: mondayTuesdayOperatingHours,
      },
      employees: [
        { id: '1', name: 'Jen Ray', roles: ['Manager'], status: 'active', shiftsPerWeek: 2, availability: availableEveryDay },
        { id: '2', name: 'Ava Cole', roles: ['Server'], status: 'active', shiftsPerWeek: 2, availability: availableEveryDay },
      ],
      schedules: [
        {
          weekLabel: 'May 24 - May 30, 2026',
          startDate: '2026-05-24',
          endDate: '2026-05-30',
          role: 'Manager',
          status: 'draft',
          requirements: grid(1),
          assignments: { 1: { ...emptyAssignments(), Monday: ['Open'] } },
        },
        {
          weekLabel: 'May 24 - May 30, 2026',
          startDate: '2026-05-24',
          endDate: '2026-05-30',
          role: 'Server',
          status: 'draft',
          requirements: grid(0),
          assignments: { 2: { ...emptyAssignments(), Tuesday: ['Open'] } },
        },
      ],
    });

    expect(screen.getByText('My Schedule')).toBeInTheDocument();

    // Scoped to the My Schedule panel specifically — the My Availability
    // panel below it reuses the same day-label class for its own Mon/Tue
    // rows.
    const myScheduleSection = screen.getByText('My Schedule').closest('.dashboard__panel--myschedule');
    const mondayRow = within(myScheduleSection).getByText('Mon', { selector: '.dashboard__myschedule-day' }).closest('.dashboard__myschedule-row');
    const tuesdayRow = within(myScheduleSection).getByText('Tue', { selector: '.dashboard__myschedule-day' }).closest('.dashboard__myschedule-row');

    // Ava (the logged-in user) is Off Monday even though Jen has a Monday
    // shift — this panel is scoped to the logged-in user, not the roster.
    expect(within(mondayRow).getByText('Off')).toBeInTheDocument();
    expect(within(tuesdayRow).getByText('Open')).toBeInTheDocument();
    expect(screen.queryByText('Jen Ray')).not.toBeInTheDocument();
  });

  it('shows one My Schedule row per day, labeling each shift with its role for an employee who holds multiple roles', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-05-27T12:00:00'));

    await renderView(Dashboard, {
      employeeId: '3',
      settings: {
        shiftTypes: ['Open'],
        weekStartsOn: 'Sunday',
        operatingHours: mondayTuesdayOperatingHours,
      },
      employees: [
        { id: '3', name: 'Kayla Brooks', roles: ['Bartender', 'Server'], status: 'active', shiftsPerWeek: 5, availability: availableEveryDay },
      ],
      schedules: [
        {
          weekLabel: 'May 24 - May 30, 2026',
          startDate: '2026-05-24',
          endDate: '2026-05-30',
          role: 'Bartender',
          status: 'draft',
          requirements: grid(1),
          assignments: { 3: { ...emptyAssignments(), Monday: ['Open'] } },
        },
        {
          weekLabel: 'May 24 - May 30, 2026',
          startDate: '2026-05-24',
          endDate: '2026-05-30',
          role: 'Server',
          status: 'draft',
          requirements: grid(0),
          assignments: { 3: { ...emptyAssignments(), Tuesday: ['Open'] } },
        },
      ],
    });

    // Scoped to the My Schedule panel specifically — the My Availability
    // panel below it reuses the same day-label class for its own Mon/Tue
    // rows.
    const myScheduleSection = screen.getByText('My Schedule').closest('.dashboard__panel--myschedule');
    const rows = within(myScheduleSection).getAllByText(/^(Mon|Tue)$/, { selector: '.dashboard__myschedule-day' });

    expect(rows).toHaveLength(2);

    const mondayRow = within(myScheduleSection).getByText('Mon', { selector: '.dashboard__myschedule-day' }).closest('.dashboard__myschedule-row');
    const tuesdayRow = within(myScheduleSection).getByText('Tue', { selector: '.dashboard__myschedule-day' }).closest('.dashboard__myschedule-row');

    // Monday: only the Bartender shift is worked, labeled with its role
    // since Kayla holds more than one.
    expect(within(mondayRow).getByText('Bartender: Open')).toBeInTheDocument();

    // Tuesday: the opposite — only the Server shift is worked.
    expect(within(tuesdayRow).getByText('Server: Open')).toBeInTheDocument();
  });

  it('hides manager-only content (metrics, status badge, Publish Status) for a non-manager employee', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-05-27T12:00:00'));

    await renderView(Dashboard, {
      employeeId: '2',
      accountRole: 'staff',
      settings: {
        shiftTypes: ['Open'],
        weekStartsOn: 'Sunday',
        operatingHours: mondayOnlyOperatingHours,
      },
      employees: [
        { id: '1', name: 'Jen Ray', roles: ['Manager'], status: 'active', shiftsPerWeek: 2, availability: availableEveryDay },
        { id: '2', name: 'Ava Cole', roles: ['Server'], status: 'active', shiftsPerWeek: 2, availability: availableEveryDay },
      ],
      schedules: [{
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        role: 'Manager',
        status: 'draft',
        requirements: grid(1),
        assignments: { 1: { ...emptyAssignments(), Monday: ['Open'] } },
        notes: 'Patio opens for summer.',
      }],
    });

    // Manager-only content is gone — including the team-scoped summary cards
    expect(screen.queryByText('Shifts scheduled')).not.toBeInTheDocument();
    expect(screen.queryByText('Open shifts')).not.toBeInTheDocument();
    expect(screen.queryByText('Needs review')).not.toBeInTheDocument();
    expect(screen.queryByText('Publish Status')).not.toBeInTheDocument();
    expect(screen.queryByText('published')).not.toBeInTheDocument();
    expect(screen.queryByText('draft')).not.toBeInTheDocument();

    // Staff instead get their own personal summary cards
    expect(screen.getByText('My shifts this week')).toBeInTheDocument();
    expect(screen.getByText('Next shift')).toBeInTheDocument();
    expect(screen.getByText('Open to pick up')).toBeInTheDocument();

    // Content for every employee is still there
    expect(screen.getByText('My Schedule')).toBeInTheDocument();
    expect(screen.getByText('Business Hours')).toBeInTheDocument();
    expect(screen.getByText('Manager Notes')).toBeInTheDocument();
    expect(screen.getByText('Patio opens for summer.')).toBeInTheDocument();
  });

  // The old "This is me" Settings stand-in for sign-in is gone — identity
  // now comes from useAuth()'s membership. "No employee linked" is now
  // represented by a membership with no employeeId, and Dashboard.jsx's
  // prompt copy changed to point at inviting/linking a roster profile
  // instead of a Settings field that no longer exists.
  it('prompts to link a roster profile in My Schedule when no employee is linked to the logged-in user', async () => {
    await renderView(Dashboard, { employees: [], employeeId: null });

    expect(screen.getByText('My Schedule')).toBeInTheDocument();
    expect(screen.getByText(/Ask a manager to link your account to a roster profile/)).toBeInTheDocument();
  });
});
