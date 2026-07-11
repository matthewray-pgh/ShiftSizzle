import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { AppStateProvider } from '../../state/AppState';
import { renderView } from '../../test/renderView';
import { History } from './History';

const STORAGE_KEY = 'shiftsizzle.app-state.v1';

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, '', '/history');
});

const managerRecord = {
  id: '2026-06-01__Manager',
  weekLabel: 'Jun 1 - Jun 7, 2026',
  startDate: '2026-06-01',
  endDate: '2026-06-07',
  role: 'Manager',
  status: 'published',
  requirements: { Monday: { Open: 1 } },
  assignments: { 1: { Monday: ['Open'] } },
  notes: 'Cover the patio.',
  savedAt: '2026-05-30T12:00:00.000Z',
  publishedAt: '2026-05-30T18:00:00.000Z',
  coverageGaps: [],
  shiftCapAlerts: [],
  metrics: { requiredSlots: 1, assignedSlots: 1, openSlots: 0, roleEmployeeCount: 1 },
};

const serverRecord = {
  id: '2026-05-25__Server',
  weekLabel: 'May 25 - May 31, 2026',
  startDate: '2026-05-25',
  endDate: '2026-05-31',
  role: 'Server',
  status: 'draft',
  requirements: { Monday: { Open: 2 } },
  assignments: { 2: { Monday: ['Open'] } },
  notes: '',
  savedAt: '2026-05-24T12:00:00.000Z',
  publishedAt: null,
  coverageGaps: [{ day: 'Monday', shift: 'Open', open: 1 }],
  shiftCapAlerts: [],
  metrics: { requiredSlots: 2, assignedSlots: 1, openSlots: 1, roleEmployeeCount: 1 },
};

const employees = [
  { id: 1, name: 'Jen Ray', role: 'Manager', status: 'active', shiftsPerWeek: 5, availability: {} },
  { id: 2, name: 'Ava Cole', role: 'Server', status: 'active', shiftsPerWeek: 5, availability: {} },
];

describe('History view', () => {
  it('shows an onboarding empty state when no schedules exist', () => {
    renderView(History);

    expect(screen.getByText('No schedules yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Builder' })).toHaveAttribute('href', '/scheduler');
  });

  it('lists saved and published schedules newest to oldest with status badges', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      employees,
      schedules: [serverRecord, managerRecord],
    }));

    render(
      <AppStateProvider>
        <History />
      </AppStateProvider>,
    );

    expect(screen.getByText('All schedules')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');

    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('Jun 1 - Jun 7, 2026')).toBeInTheDocument();
    expect(within(items[0]).getByText('published')).toBeInTheDocument();
    expect(within(items[1]).getByText('May 25 - May 31, 2026')).toBeInTheDocument();
    expect(within(items[1]).getByText('draft')).toBeInTheDocument();
  });

  it('opens a schedule detail view with a resume link back to Scheduler', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      employees,
      schedules: [managerRecord],
    }));

    render(
      <AppStateProvider>
        <History />
      </AppStateProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Jun 1 - Jun 7, 2026/ }));

    expect(screen.getByRole('heading', { name: 'Jun 1 - Jun 7, 2026' })).toBeInTheDocument();
    expect(screen.getByText('1 assigned slots across 1 team members.')).toBeInTheDocument();
    expect(screen.getByText('Cover the patio.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit Schedule' })).toHaveAttribute(
      'href',
      '?weekStart=2026-06-01&role=Manager#/scheduler',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back to all schedules' }));
    expect(screen.getByText('All schedules')).toBeInTheDocument();
  });

  it('filters the list by role and status', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      employees,
      schedules: [serverRecord, managerRecord],
    }));

    render(
      <AppStateProvider>
        <History />
      </AppStateProvider>,
    );

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
