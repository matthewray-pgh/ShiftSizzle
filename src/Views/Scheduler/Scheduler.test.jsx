import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { AppStateProvider } from '../../state/AppState';
import { renderView } from '../../test/renderView';
import { Scheduler } from './Scheduler';

const STORAGE_KEY = 'shiftsizzle.app-state.v1';

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('Scheduler view', () => {
  it('renders the scheduler page', () => {
    renderView(Scheduler);

    expect(screen.getByText('Schedule Control Panel')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Define demand' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Build draft' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Resolve issues' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Publish Schedule' })).toBeInTheDocument();
    expect(screen.getByLabelText('Schedule workflow')).toBeInTheDocument();
    expect(screen.getAllByText('Choose week.').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Confirm coverage plan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset to blank draft' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Individual employee view' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Schedule Visualizations')).not.toBeInTheDocument();
    const statusPanel = screen.getByLabelText('Schedule status panel');

    expect(within(statusPanel).getByText('Active week')).toBeInTheDocument();
    expect(within(statusPanel).getAllByText('Not selected').length).toBe(2);
    expect(screen.getByLabelText('Week start date')).toBeDisabled();
    const setupNotice = screen.getByLabelText('Scheduling week setup notice');

    expect(within(setupNotice).getByText('Scheduling week setup required')).toBeInTheDocument();
    expect(within(setupNotice).getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('button', { name: 'Confirm coverage plan' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Generate draft' })).toBeDisabled();
    expect(screen.getByText('Choose the week and role in Phase 1 before editing the schedule.')).toBeInTheDocument();
  });

  it('hides closed days from scheduling controls', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: {
        operatingHours: {
          Sunday: {
            isOpen: false,
            openTime: '11:00',
            closeTime: '21:00',
          },
        },
      },
    }));

    render(
      <AppStateProvider>
        <Scheduler />
      </AppStateProvider>
    );

    expect(screen.queryByText('Sunday')).not.toBeInTheDocument();
    expect(screen.getAllByText('Monday').length).toBeGreaterThan(0);
    expect(screen.queryByText('Sun')).not.toBeInTheDocument();
  });

  it('blocks publishing until coverage is filled and then records the publish state', () => {
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
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        status: 'draft',
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
            Monday: [],
            Tuesday: [],
            Wednesday: [],
            Thursday: [],
            Friday: [],
            Saturday: [],
          },
        },
        notes: '',
        lastPublishedAt: null,
      },
    }));

    render(
      <AppStateProvider>
        <Scheduler />
      </AppStateProvider>
    );

    const publishButton = screen.getByRole('button', { name: 'Publish' });

    expect(publishButton).toBeDisabled();
    expect(screen.getByText('Active week needs attention')).toBeInTheDocument();
    expect(screen.getAllByText('Confirm the coverage plan before publishing.').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Define demand' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Build draft' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Resolve issues' })).toBeInTheDocument();
    expect(screen.getAllByText('Publish schedule').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Generate draft' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm coverage plan' }));

    expect(screen.getByRole('button', { name: 'Generate draft' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Generate draft' }));

    expect(screen.getAllByText('Publish schedule').length).toBeGreaterThan(0);
    expect(publishButton).toBeDisabled();
    expect(screen.getByText('Save the current draft before publishing.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(screen.getByText(/Last saved /)).toBeInTheDocument();
    expect(publishButton).toBeEnabled();
    expect(screen.getByText('Ready to publish.')).toBeInTheDocument();

    fireEvent.click(publishButton);

    expect(screen.getByText('Published schedule')).toBeInTheDocument();
    expect(screen.getByText(/Last published /)).toBeInTheDocument();
  });

  it('requires saving again after draft edits before publishing', () => {
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
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        coveragePlanReviewed: true,
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
        lastSavedAt: '2026-05-20T15:30:00.000Z',
        hasUnsavedChanges: false,
        lastPublishedAt: null,
      },
    }));

    render(
      <AppStateProvider>
        <Scheduler />
      </AppStateProvider>
    );

    const publishButton = screen.getByRole('button', { name: 'Publish' });

    expect(publishButton).toBeEnabled();

    fireEvent.change(screen.getByPlaceholderText('Schedule notes'), { target: { value: 'Bring in patio support.' } });

    expect(screen.getByText('Save the current draft before publishing.')).toBeInTheDocument();
    expect(screen.getByText('Unsaved changes since the last draft save.')).toBeInTheDocument();
    expect(publishButton).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(screen.queryByText('Unsaved changes since the last draft save.')).not.toBeInTheDocument();
    expect(publishButton).toBeEnabled();
  });

  it('marks the coverage workflow step complete after coverage targets are reviewed', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: {
        weekStartsOn: 'Sunday',
      },
      schedule: {
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        selectedRole: 'Manager',
      },
    }));

    render(
      <AppStateProvider>
        <Scheduler />
      </AppStateProvider>
    );

    expect(screen.getAllByText('Add targets.').length).toBeGreaterThan(0);

    const mondayInput = screen.getAllByRole('spinbutton')[0];
    fireEvent.change(mondayInput, { target: { value: '2' } });

    expect(screen.getAllByText('Confirm targets.').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Confirm coverage plan' }));

    expect(screen.queryByText('Confirm targets.')).not.toBeInTheDocument();
    expect(screen.getByText(/confirmed\./)).toBeInTheDocument();

    fireEvent.change(mondayInput, { target: { value: '3' } });

    expect(screen.getAllByText('Confirm targets.').length).toBeGreaterThan(0);
  });

  it('switches the weekly schedule editor between individual, day, and comprehensive views', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: {
        weekStartsOn: 'Sunday',
      },
      schedule: {
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        selectedRole: 'Manager',
      },
    }));

    render(
      <AppStateProvider>
        <Scheduler />
      </AppStateProvider>
    );

    expect(screen.getByLabelText('Weekly editor by individual')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Daily view' }));
    expect(screen.getByLabelText('Weekly editor by day')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Weekly view' }));
    expect(screen.getByLabelText('Weekly editor weekly canvas')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Open' }).length).toBeGreaterThan(0);
  });

  it('remembers the selected weekly editor view for the current session', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: {
        weekStartsOn: 'Sunday',
      },
      schedule: {
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        selectedRole: 'Manager',
      },
    }));

    const { unmount } = render(
      <AppStateProvider>
        <Scheduler />
      </AppStateProvider>
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Daily view' }));
    expect(screen.getByLabelText('Weekly editor by day')).toBeInTheDocument();

    unmount();
    render(
      <AppStateProvider>
        <Scheduler />
      </AppStateProvider>
    );

    expect(screen.getByRole('tab', { name: 'Daily view' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Weekly editor by day')).toBeInTheDocument();
  });

  it('resets the draft assignments and notes from the review step', () => {
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
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
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
        notes: 'Review patio staffing.',
        lastPublishedAt: null,
      },
    }));

    render(
      <AppStateProvider>
        <Scheduler />
      </AppStateProvider>
    );

    expect(screen.getByDisplayValue('Review patio staffing.')).toBeInTheDocument();
    expect(screen.getByText('1/2 assigned')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear current role draft' }));

    expect(screen.getByPlaceholderText('Schedule notes')).toHaveValue('');
    expect(screen.getByText('0/2 assigned')).toBeInTheDocument();
    expect(screen.getAllByText('Confirm the coverage plan before generating the draft.').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
  });

  it('disables extra manual assignment buttons once an employee reaches the weekly shift cap', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: {
        shiftTypes: ['Open'],
        weekStartsOn: 'Sunday',
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
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
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
        notes: '',
        lastPublishedAt: null,
      },
    }));

    render(
      <AppStateProvider>
        <Scheduler />
      </AppStateProvider>
    );

    const jenHeading = screen.getAllByText('Jen Ray').find((element) => element.tagName === 'STRONG');
    const jenCard = jenHeading.closest('.scheduler__employee-card');

    expect(jenCard).not.toBeNull();

    const mondayRow = within(jenCard).getByText('Mon').closest('.scheduler__day-row');
    const tuesdayRow = within(jenCard).getByText('Tue').closest('.scheduler__day-row');

    expect(mondayRow).not.toBeNull();
    expect(tuesdayRow).not.toBeNull();

    fireEvent.click(within(mondayRow).getByRole('button', { name: 'Open' }));

    expect(within(jenCard).getByText('1/1 assigned')).toBeInTheDocument();
    expect(within(tuesdayRow).getByRole('button', { name: 'Open' })).toBeDisabled();
  });
});