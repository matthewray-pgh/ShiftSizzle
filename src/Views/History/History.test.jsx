import { useEffect, useRef } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppStateProvider, useAppState } from '../../state/AppState';
import { AuthProvider } from '../../state/AuthState';
import { renderView } from '../../test/renderView';
import { History } from './History';

vi.mock('../../lib/supabaseClient', async () => {
  const { createFakeSupabaseClient } = await import('../../test/fakeSupabaseClient');
  return { supabase: createFakeSupabaseClient() };
});

const { supabase } = await import('../../lib/supabaseClient');
const { seedFakeSupabase } = await import('../../test/fakeSupabaseClient');

const resetFakeSupabase = () => {
  Object.values(supabase.__tables).forEach((rows) => {
    rows.length = 0;
  });
  supabase.__setSession(null);
};

const availableEveryDay = { Sunday: ['Open'], Monday: ['Open'], Tuesday: ['Open'], Wednesday: ['Open'], Thursday: ['Open'], Friday: ['Open'], Saturday: ['Open'] };

// History.jsx reads a saved/published record's `metrics`/`coverageGaps`/
// `shiftCapAlerts` straight off the record itself — those are computed by
// the reducer's SAVE_SCHEDULE_DRAFT/PUBLISH_SCHEDULE actions
// (buildScheduleRecordFromLiveSchedule) but are NOT columns Supabase
// persists (see schedule_records in fakeSupabaseClient.js / supabaseSync.js),
// so a record seeded directly via seedFakeSupabase (i.e. "loaded from a
// previous session") would come back without them. To exercise History
// with fully-populated records the same way the running app produces them,
// this harness builds the schedules by dispatching the real actions
// (mirrors the TestHarness pattern in AppState.test.jsx) instead of
// pre-seeding `schedules[]` directly.
const HistoryTestHarness = () => {
  const { state, dispatch } = useAppState();
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (!state.isHydrated || hasRunRef.current) {
      return;
    }

    hasRunRef.current = true;

    // Server week: May 25 - May 31, 2026 — draft, 2 required / 1 assigned.
    dispatch({ type: 'SELECT_WEEK', payload: { startDate: '2026-05-25' } });
    dispatch({ type: 'UPDATE_REQUIREMENTS', payload: { role: 'Server', day: 'Monday', shift: 'Open', value: 2 } });
    dispatch({ type: 'TOGGLE_ASSIGNMENT', payload: { employeeId: '2', role: 'Server', day: 'Monday', shift: 'Open' } });
    dispatch({ type: 'SAVE_SCHEDULE_DRAFT' });

    // Manager week: Jun 1 - Jun 7, 2026 — published, 1 required / 1 assigned.
    dispatch({ type: 'SELECT_WEEK', payload: { startDate: '2026-06-01' } });
    dispatch({ type: 'UPDATE_REQUIREMENTS', payload: { role: 'Manager', day: 'Monday', shift: 'Open', value: 1 } });
    dispatch({ type: 'TOGGLE_ASSIGNMENT', payload: { employeeId: '1', role: 'Manager', day: 'Monday', shift: 'Open' } });
    dispatch({ type: 'UPDATE_SCHEDULE_NOTES', payload: 'Cover the patio.' });
    dispatch({ type: 'PUBLISH_SCHEDULE' });
  }, [state.isHydrated, dispatch]);

  return <History />;
};

const renderHistoryWithTwoSavedWeeks = async () => {
  seedFakeSupabase(supabase, {
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
      { id: '1', name: 'Jen Ray', roles: ['Manager'], status: 'active', shiftsPerWeek: 5, availability: availableEveryDay },
      { id: '2', name: 'Ava Cole', roles: ['Server'], status: 'active', shiftsPerWeek: 5, availability: availableEveryDay },
    ],
  });

  render(
    <AuthProvider>
      <AppStateProvider>
        <HistoryTestHarness />
      </AppStateProvider>
    </AuthProvider>
  );

  // Wait for both weeks to be built and saved before interacting.
  await screen.findByText('Jun 1 - Jun 7, 2026');
};

beforeEach(() => {
  resetFakeSupabase();
  window.history.replaceState({}, '', '/schedule');
});

describe('History view', () => {
  it('shows an onboarding empty state when no schedules exist', async () => {
    await renderView(History);

    expect(screen.getByText('Start your schedule')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'New schedule' }));
    expect(window.location.hash).toBe('#/schedule/build');
  });

  it('hides schedule-building actions from staff', async () => {
    await renderView(History, { accountRole: 'staff' });

    expect(screen.getByText('Start your schedule')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New schedule' })).not.toBeInTheDocument();
  });

  it('lists saved and published schedules newest to oldest with status badges', async () => {
    await renderHistoryWithTwoSavedWeeks();

    expect(screen.getByText('All schedules')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');

    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('Jun 1 - Jun 7, 2026')).toBeInTheDocument();
    expect(within(items[0]).getByText('published')).toBeInTheDocument();
    expect(within(items[1]).getByText('May 25 - May 31, 2026')).toBeInTheDocument();
    expect(within(items[1]).getByText('draft')).toBeInTheDocument();
  });

  it('opens a schedule detail view with a resume link back to Scheduler', async () => {
    await renderHistoryWithTwoSavedWeeks();

    fireEvent.click(screen.getByRole('button', { name: /Jun 1 - Jun 7, 2026/ }));

    expect(screen.getByRole('heading', { name: 'Jun 1 - Jun 7, 2026' })).toBeInTheDocument();
    expect(screen.getByText('1 assigned slots across 1 team members.')).toBeInTheDocument();
    expect(screen.getByText('Cover the patio.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Schedule' }));
    expect(window.location.search).toBe('?weekStart=2026-06-01&role=Manager');
    expect(window.location.hash).toBe('#/schedule/build');

    fireEvent.click(screen.getByRole('button', { name: 'Back to all schedules' }));
    expect(screen.getByText('All schedules')).toBeInTheDocument();
  });

  it('filters the list by role and status', async () => {
    await renderHistoryWithTwoSavedWeeks();

    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'Manager' } });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Jun 1 - Jun 7, 2026')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'draft' } });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('May 25 - May 31, 2026')).toBeInTheDocument();
  });
});
