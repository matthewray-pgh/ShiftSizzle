import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppStateProvider } from '../../state/AppState';
import { renderView } from '../../test/renderView';
import { Dashboard } from './Dashboard';

const STORAGE_KEY = 'shiftsizzle.app-state.v1';

describe('Dashboard view', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the dashboard page', () => {
    renderView(Dashboard);

    expect(screen.getByText('Hello, Jennifer')).toBeInTheDocument();
    expect(screen.getByText('Active employees')).toBeInTheDocument();
    expect(screen.getByText('Business Hours')).toBeInTheDocument();

    // Every day gets its own row now instead of being combined into ranges
    // like "Sun-Thu" — Sunday through Thursday share the same hours, Friday
    // and Saturday share a later closing time.
    const hoursList = screen.getByText('Business Hours').closest('.dashboard__panel--hours');

    expect(within(hoursList).getByText('Sun')).toBeInTheDocument();
    expect(within(hoursList).getByText('Thu')).toBeInTheDocument();
    expect(within(hoursList).getAllByText('11:00 AM - 9:00 PM')).toHaveLength(5);
    expect(within(hoursList).getByText('Fri')).toBeInTheDocument();
    expect(within(hoursList).getByText('Sat')).toBeInTheDocument();
    expect(within(hoursList).getAllByText('10:00 AM - 11:00 PM')).toHaveLength(2);
  });

  // Regression test for backlog #1: Assigned/Open shifts used to go stale
  // relative to each other because one metric summed every role while the
  // other filtered to a single selected role. Both must now aggregate
  // across every role for the active week, and stay consistent regardless
  // of which role most recently had focus.
  it('aggregates Assigned and Open shifts across every role, not just one', () => {
    window.localStorage.clear();
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
          roles: ['Manager'],
          status: 'active',
          shiftsPerWeek: 2,
          availability: { Sunday: ['Open'], Monday: ['Open'], Tuesday: ['Open'], Wednesday: ['Open'], Thursday: ['Open'], Friday: ['Open'], Saturday: ['Open'] },
        },
        {
          id: 2,
          name: 'Ava Cole',
          roles: ['Server'],
          status: 'active',
          shiftsPerWeek: 2,
          availability: { Sunday: ['Open'], Monday: ['Open'], Tuesday: ['Open'], Wednesday: ['Open'], Thursday: ['Open'], Friday: ['Open'], Saturday: ['Open'] },
        },
      ],
      schedule: {
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        // Manager is fully covered (1 required, 1 assigned); Server has a
        // gap (2 required, 0 assigned). Total: 1 assigned shift, 2 open.
        roleRequirements: {
          Manager: { Sunday: { Open: 0 }, Monday: { Open: 1 }, Tuesday: { Open: 0 }, Wednesday: { Open: 0 }, Thursday: { Open: 0 }, Friday: { Open: 0 }, Saturday: { Open: 0 } },
          Server: { Sunday: { Open: 0 }, Monday: { Open: 2 }, Tuesday: { Open: 0 }, Wednesday: { Open: 0 }, Thursday: { Open: 0 }, Friday: { Open: 0 }, Saturday: { Open: 0 } },
        },
        assignments: {
          Manager: { 1: { Sunday: [], Monday: ['Open'], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [] } },
          Server: { 2: { Sunday: [], Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [] } },
        },
      },
    }));

    // Pin "today" to a Wednesday inside the seeded week (May 24-30, 2026)
    // so the Dashboard resolves this as the current week regardless of
    // which day within it "today" happens to fall on.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-27T12:00:00'));

    render(
      <AppStateProvider>
        <Dashboard />
      </AppStateProvider>
    );

    expect(screen.getByText('Assigned shifts')).toBeInTheDocument();
    const assignedCard = screen.getByText('Assigned shifts').closest('.dashboard__metric');
    const openCard = screen.getByText('Open shifts').closest('.dashboard__metric');

    expect(assignedCard).toHaveTextContent('1');
    expect(openCard).toHaveTextContent('2');
  });

  it('shows the current week\'s schedule even when a different week is loaded in the Scheduler canvas', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-27T12:00:00')); // Wednesday inside the May 24-30 week

    window.localStorage.clear();
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
          roles: ['Manager'],
          status: 'active',
          shiftsPerWeek: 2,
          availability: { Sunday: ['Open'], Monday: ['Open'], Tuesday: ['Open'], Wednesday: ['Open'], Thursday: ['Open'], Friday: ['Open'], Saturday: ['Open'] },
        },
      ],
      // The manager is mid-draft on a FUTURE week in the Scheduler...
      schedule: {
        weekLabel: 'Jun 21 - Jun 27, 2026',
        startDate: '2026-06-21',
        endDate: '2026-06-27',
        roleRequirements: {
          Manager: { Sunday: { Open: 0 }, Monday: { Open: 9 }, Tuesday: { Open: 0 }, Wednesday: { Open: 0 }, Thursday: { Open: 0 }, Friday: { Open: 0 }, Saturday: { Open: 0 } },
        },
        assignments: { Manager: { 1: { Sunday: [], Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [] } } },
        notes: 'Draft notes for the future week.',
      },
      // ...but the CURRENT week already has a published schedule.
      schedules: [{
        id: '2026-05-24__Manager',
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        role: 'Manager',
        status: 'published',
        requirements: { Sunday: { Open: 0 }, Monday: { Open: 1 }, Tuesday: { Open: 0 }, Wednesday: { Open: 0 }, Thursday: { Open: 0 }, Friday: { Open: 0 }, Saturday: { Open: 0 } },
        assignments: { 1: { Sunday: [], Monday: ['Open'], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [] } },
        notes: 'Patio opens for summer.',
        savedAt: '2026-05-20T12:00:00.000Z',
        publishedAt: '2026-05-20T12:00:00.000Z',
      }],
    }));

    render(
      <AppStateProvider>
        <Dashboard />
      </AppStateProvider>
    );

    expect(screen.getAllByText(/May 24 - May 30, 2026/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/Jun 21 - Jun 27, 2026/).length).toBe(0);
    expect(screen.getByText('Patio opens for summer.')).toBeInTheDocument();
    expect(screen.queryByText('Draft notes for the future week.')).not.toBeInTheDocument();

    const assignedCard = screen.getByText('Assigned shifts').closest('.dashboard__metric');
    const openCard = screen.getByText('Open shifts').closest('.dashboard__metric');

    expect(assignedCard).toHaveTextContent('1');
    expect(openCard).toHaveTextContent('0');
  });

  it('shows the logged-in employee\'s own shifts in the My Schedule panel, not the whole roster', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-27T12:00:00'));

    window.localStorage.clear();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: {
        shiftTypes: ['Open'],
        weekStartsOn: 'Sunday',
        currentUserEmployeeId: 2,
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
          roles: ['Manager'],
          status: 'active',
          shiftsPerWeek: 2,
          availability: { Sunday: ['Open'], Monday: ['Open'], Tuesday: ['Open'], Wednesday: ['Open'], Thursday: ['Open'], Friday: ['Open'], Saturday: ['Open'] },
        },
        {
          id: 2,
          name: 'Ava Cole',
          roles: ['Server'],
          status: 'active',
          shiftsPerWeek: 2,
          availability: { Sunday: ['Open'], Monday: ['Open'], Tuesday: ['Open'], Wednesday: ['Open'], Thursday: ['Open'], Friday: ['Open'], Saturday: ['Open'] },
        },
      ],
      schedule: {
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        roleRequirements: {
          Manager: { Sunday: { Open: 0 }, Monday: { Open: 1 }, Tuesday: { Open: 0 }, Wednesday: { Open: 0 }, Thursday: { Open: 0 }, Friday: { Open: 0 }, Saturday: { Open: 0 } },
        },
        assignments: {
          Manager: { 1: { Sunday: [], Monday: ['Open'], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [] } },
          Server: { 2: { Sunday: [], Monday: [], Tuesday: ['Open'], Wednesday: [], Thursday: [], Friday: [], Saturday: [] } },
        },
      },
    }));

    render(
      <AppStateProvider>
        <Dashboard />
      </AppStateProvider>
    );

    expect(screen.getByText('My Schedule')).toBeInTheDocument();

    const mondayRow = screen.getByText('Mon', { selector: '.dashboard__myschedule-day' }).closest('.dashboard__myschedule-row');
    const tuesdayRow = screen.getByText('Tue', { selector: '.dashboard__myschedule-day' }).closest('.dashboard__myschedule-row');

    // Ava (the logged-in user) is Off Monday even though Jen has a Monday
    // shift — this panel is scoped to the logged-in user, not the roster.
    expect(within(mondayRow).getByText('Off')).toBeInTheDocument();
    expect(within(tuesdayRow).getByText('Open')).toBeInTheDocument();
    expect(screen.queryByText('Jen Ray')).not.toBeInTheDocument();
  });

  it('shows one My Schedule row per day, labeling each shift with its role for an employee who holds multiple roles', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-27T12:00:00'));

    window.localStorage.clear();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: {
        shiftTypes: ['Open'],
        weekStartsOn: 'Sunday',
        currentUserEmployeeId: 3,
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
          id: 3,
          name: 'Kayla Brooks',
          roles: ['Bartender', 'Server'],
          status: 'active',
          shiftsPerWeek: 5,
          availability: { Sunday: ['Open'], Monday: ['Open'], Tuesday: ['Open'], Wednesday: ['Open'], Thursday: ['Open'], Friday: ['Open'], Saturday: ['Open'] },
        },
      ],
      schedule: {
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        roleRequirements: {
          Bartender: { Sunday: { Open: 0 }, Monday: { Open: 1 }, Tuesday: { Open: 0 }, Wednesday: { Open: 0 }, Thursday: { Open: 0 }, Friday: { Open: 0 }, Saturday: { Open: 0 } },
          Server: { Sunday: { Open: 0 }, Monday: { Open: 0 }, Tuesday: { Open: 1 }, Wednesday: { Open: 0 }, Thursday: { Open: 0 }, Friday: { Open: 0 }, Saturday: { Open: 0 } },
        },
        assignments: {
          Bartender: { 3: { Sunday: [], Monday: ['Open'], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [] } },
          Server: { 3: { Sunday: [], Monday: [], Tuesday: ['Open'], Wednesday: [], Thursday: [], Friday: [], Saturday: [] } },
        },
      },
    }));

    render(
      <AppStateProvider>
        <Dashboard />
      </AppStateProvider>
    );

    const rows = screen.getAllByText(/^(Mon|Tue)$/, { selector: '.dashboard__myschedule-day' });

    expect(rows).toHaveLength(2);

    const mondayRow = screen.getByText('Mon', { selector: '.dashboard__myschedule-day' }).closest('.dashboard__myschedule-row');
    const tuesdayRow = screen.getByText('Tue', { selector: '.dashboard__myschedule-day' }).closest('.dashboard__myschedule-row');

    // Monday: only the Bartender shift is worked, labeled with its role
    // since Kayla holds more than one.
    expect(within(mondayRow).getByText('Bartender: Open')).toBeInTheDocument();

    // Tuesday: the opposite — only the Server shift is worked.
    expect(within(tuesdayRow).getByText('Server: Open')).toBeInTheDocument();
  });

  it('hides manager-only content (metrics, status badge, Publish Status) for a non-manager employee', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-27T12:00:00'));

    window.localStorage.clear();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: {
        shiftTypes: ['Open'],
        weekStartsOn: 'Sunday',
        currentUserEmployeeId: 2,
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
          roles: ['Manager'],
          status: 'active',
          shiftsPerWeek: 2,
          availability: { Sunday: ['Open'], Monday: ['Open'], Tuesday: ['Open'], Wednesday: ['Open'], Thursday: ['Open'], Friday: ['Open'], Saturday: ['Open'] },
        },
        {
          id: 2,
          name: 'Ava Cole',
          roles: ['Server'],
          status: 'active',
          shiftsPerWeek: 2,
          availability: { Sunday: ['Open'], Monday: ['Open'], Tuesday: ['Open'], Wednesday: ['Open'], Thursday: ['Open'], Friday: ['Open'], Saturday: ['Open'] },
        },
      ],
      schedule: {
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        notes: 'Patio opens for summer.',
        roleRequirements: {
          Manager: { Sunday: { Open: 0 }, Monday: { Open: 1 }, Tuesday: { Open: 0 }, Wednesday: { Open: 0 }, Thursday: { Open: 0 }, Friday: { Open: 0 }, Saturday: { Open: 0 } },
        },
        assignments: {
          Manager: { 1: { Sunday: [], Monday: ['Open'], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [] } },
          Server: { 2: { Sunday: [], Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [] } },
        },
      },
    }));

    render(
      <AppStateProvider>
        <Dashboard />
      </AppStateProvider>
    );

    // Manager-only content is gone
    expect(screen.queryByText('Active employees')).not.toBeInTheDocument();
    expect(screen.queryByText('Assigned shifts')).not.toBeInTheDocument();
    expect(screen.queryByText('Open shifts')).not.toBeInTheDocument();
    expect(screen.queryByText('Publish Status')).not.toBeInTheDocument();
    expect(screen.queryByText('published')).not.toBeInTheDocument();
    expect(screen.queryByText('draft')).not.toBeInTheDocument();

    // Content for every employee is still there
    expect(screen.getByText('My Schedule')).toBeInTheDocument();
    expect(screen.getByText('Business Hours')).toBeInTheDocument();
    expect(screen.getByText('Manager Notes')).toBeInTheDocument();
    expect(screen.getByText('Patio opens for summer.')).toBeInTheDocument();
  });

  it('prompts to set "This is me" in Settings when no employee is linked to the logged-in user', () => {
    window.localStorage.clear();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: { currentUserEmployeeId: '' },
    }));

    render(
      <AppStateProvider>
        <Dashboard />
      </AppStateProvider>
    );

    expect(screen.getByText('My Schedule')).toBeInTheDocument();
    expect(screen.getByText(/Set "This is me" in Settings/)).toBeInTheDocument();
  });
});