import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppStateProvider } from '../../state/AppState';
import { renderView } from '../../test/renderView';
import { Scheduler } from './Scheduler';

const STORAGE_KEY = 'shiftsizzle.app-state.v1';

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('Scheduler view', () => {
  it('renders the scheduler page', () => {
    renderView(Scheduler);

    expect(screen.getByText('Build Schedule')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Set up and generate' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Resolve issues' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Publish Schedule' })).toBeInTheDocument();
    expect(screen.getAllByText('Choose which day your schedules start on, then pick a start date below.').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Active editing context')).toHaveTextContent('No schedule started yet');
    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Individual employee view' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Schedule Visualizations')).not.toBeInTheDocument();
    const statusPanel = screen.getByLabelText('Schedule status panel');

    expect(within(statusPanel).getByText('Draft schedule')).toBeInTheDocument();
    expect(within(statusPanel).getByText('Set the week and role to start planning.')).toBeInTheDocument();
    expect(screen.getByLabelText('Week start date')).toBeDisabled();
    const setupNotice = screen.getByLabelText('Set scheduling week start day');

    expect(within(setupNotice).getByLabelText('Week starts on')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate draft' })).toBeDisabled();
    expect(screen.getByText('Choose the week and role in Set up and generate before editing the schedule.')).toBeInTheDocument();
    expect(screen.getByText('Choose the week and role first, then enter target coverage for each day and shift.')).toBeInTheDocument();
  });

  it('guards role switching when unpublished work is in progress', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: {
        weekStartsOn: 'Sunday',
      },
      schedule: {
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        selectedRole: 'Manager',
        hasUnsavedChanges: true,
        status: 'draft',
      },
    }));

    render(
      <AppStateProvider>
        <Scheduler />
      </AppStateProvider>
    );

    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'Server' } });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Switch schedule?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Role')).toHaveValue('Manager');
  });

  it('can intentionally start a new schedule context from planning scope', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: {
        weekStartsOn: 'Sunday',
      },
      schedule: {
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        selectedRole: 'Manager',
        hasUnsavedChanges: true,
        status: 'draft',
      },
    }));

    render(
      <AppStateProvider>
        <Scheduler />
      </AppStateProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(screen.queryByText('Switch schedule?')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Week start date')).toHaveValue('');
    expect(screen.getByLabelText('Role')).toHaveValue('');
    expect(screen.getByLabelText('Active editing context')).toHaveTextContent('No schedule started yet');
  });

  it('applies the newly chosen week after confirming the switch modal', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: {
        weekStartsOn: 'Sunday',
      },
      schedule: {
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        selectedRole: 'Manager',
        hasUnsavedChanges: true,
        status: 'draft',
      },
    }));

    render(
      <AppStateProvider>
        <Scheduler />
      </AppStateProvider>
    );

    fireEvent.change(screen.getByLabelText('Week start date'), { target: { value: '2026-06-07' } });

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Switch schedule' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Week start date')).toHaveValue('2026-06-07');
    expect(screen.getByLabelText('Active editing context')).toHaveTextContent('Jun 7 - Jun 13, 2026');
  });

  it('hides closed days from scheduling controls', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: {
        weekStartsOn: 'Sunday',
        operatingHours: {
          Sunday: {
            isOpen: false,
            openTime: '11:00',
            closeTime: '21:00',
          },
        },
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
    expect(screen.getAllByText('Save the current draft before publishing.').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Set up and generate' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Resolve issues' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Publish Schedule' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate draft' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Generate draft' }));

    expect(screen.getByRole('heading', { name: 'Publish Schedule' })).toBeInTheDocument();
    expect(publishButton).toBeDisabled();
    expect(screen.getAllByText('Save the current draft before publishing.').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(screen.getByText(/Last saved /)).toBeInTheDocument();
    expect(publishButton).toBeEnabled();
    expect(screen.getByText('Latest draft saved')).toBeInTheDocument();
    expect(screen.getByLabelText('Publish bar')).toBeInTheDocument();

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

    expect(screen.getAllByText('Save the current draft before publishing.').length).toBeGreaterThan(0);
    expect(screen.getByText('Unsaved changes since the last draft save.')).toBeInTheDocument();
    expect(publishButton).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(screen.queryByText('Unsaved changes since the last draft save.')).not.toBeInTheDocument();
    expect(publishButton).toBeEnabled();
  });

  it('enables draft generation as soon as coverage targets are added, with no separate confirmation step', () => {
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

    expect(screen.getAllByText('Add at least one required slot to define demand.').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Generate draft' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Confirm coverage plan' })).not.toBeInTheDocument();

    const mondayInput = screen.getAllByRole('spinbutton')[0];
    fireEvent.change(mondayInput, { target: { value: '2' } });

    expect(screen.getByRole('button', { name: 'Generate draft' })).toBeEnabled();

    fireEvent.change(mondayInput, { target: { value: '3' } });

    expect(screen.getByRole('button', { name: 'Generate draft' })).toBeEnabled();
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

  it('hydrates week and role from deep-link query params', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: {
        weekStartsOn: 'Monday',
      },
      schedule: {
        selectedRole: '',
        startDate: '',
        endDate: '',
        weekLabel: '',
      },
    }));
    window.history.replaceState({}, '', '/schedule/build?weekStart=2026-05-25&role=Manager');

    render(
      <AppStateProvider>
        <Scheduler />
      </AppStateProvider>
    );

    expect(screen.getByLabelText('Week start date')).toHaveValue('2026-05-25');
    expect(screen.getByLabelText('Role')).toHaveValue('Manager');
    expect(window.location.search).toBe('');
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

  it('resets the entire phase (week, role, draft, and notes) when Reset is clicked from the review step', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(screen.queryByText('Switch schedule?')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Week start date')).toHaveValue('');
    expect(screen.getByLabelText('Role')).toHaveValue('');
    expect(screen.getByLabelText('Active editing context')).toHaveTextContent('No schedule started yet');
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