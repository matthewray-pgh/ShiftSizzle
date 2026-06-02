import { fireEvent, screen, within } from '@testing-library/react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { AppStateProvider } from '../../state/AppState';
import { Shifts } from './Shifts';

const STORAGE_KEY = 'shiftsizzle.app-state.v1';

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState({}, '', '/shifts');
});

const renderShifts = () => render(
  <AppStateProvider>
    <Shifts />
  </AppStateProvider>,
);

describe('Shifts view', () => {
  it('shows a publish prompt when no published schedule exists', () => {
    renderShifts();

    expect(screen.getByText('Published schedule view')).toBeInTheDocument();
    expect(
      screen.getByText('Publish a schedule in Scheduler to review assignments, coverage, and unresolved issues here.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('draft')).not.toBeInTheDocument();
  });

  it('renders published assignments, coverage, and unresolved issue summaries', () => {
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
            Sunday: ['Open'], Monday: ['Open'], Tuesday: ['Open'], Wednesday: ['Open'], Thursday: ['Open'], Friday: ['Open'], Saturday: ['Open'],
          },
        },
      ],
      schedule: {
        weekLabel: 'May 25 - May 31, 2026',
        startDate: '2026-05-25',
        endDate: '2026-05-31',
        status: 'published',
        selectedRole: 'Manager',
        notes: 'Watch patio launch staffing.',
        lastSavedAt: '2026-05-25T14:00:00.000Z',
        lastPublishedAt: '2026-05-25T14:00:00.000Z',
        requirements: {
          Sunday: { Open: 0 },
          Monday: { Open: 2 },
          Tuesday: { Open: 1 },
          Wednesday: { Open: 0 },
          Thursday: { Open: 0 },
          Friday: { Open: 0 },
          Saturday: { Open: 0 },
        },
        assignments: {
          1: {
            Sunday: [],
            Monday: ['Open'],
            Tuesday: ['Open'],
            Wednesday: [],
            Thursday: [],
            Friday: [],
            Saturday: [],
          },
        },
      },
    }));

    renderShifts();

    expect(screen.getByText('Manager coverage for May 25 - May 31, 2026.')).toBeInTheDocument();
    expect(screen.getByLabelText('Assignment review summary')).toHaveTextContent('2 assigned slots across 1 team members.');
    expect(screen.getByLabelText('Coverage review summary')).toHaveTextContent('3 required slots for the week.');
    expect(screen.getByLabelText('Coverage review summary')).toHaveTextContent('1 unfilled slots after publish.');
    expect(screen.getByLabelText('Unresolved issues summary')).toHaveTextContent('1 coverage gap issue');
    expect(screen.getByLabelText('Unresolved issues summary')).toHaveTextContent('1 shift-cap alert');
    expect(screen.getByRole('tab', { name: 'Employee view' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Reset filters' })).toBeDisabled();
    expect(screen.getByLabelText('Published assignments view')).toBeInTheDocument();
    expect(screen.getByLabelText('Selected assignment schedule context')).toHaveTextContent('Manager');
    expect(screen.getByLabelText('Selected assignment schedule context')).toHaveTextContent('May 25 - May 31, 2026');
    expect(screen.getByText('1 assigned / 2 required')).toBeInTheDocument();
    expect(screen.getByText('1 assigned / 1 required')).toBeInTheDocument();
    expect(screen.getByText('Coverage gap: Monday Open (1 open)')).toBeInTheDocument();
    expect(screen.getByText('Shift-cap alert: Jen Ray assigned 2 shifts (limit 1)')).toBeInTheDocument();
    expect(screen.getByLabelText('Published note panel')).toHaveTextContent('Watch patio launch staffing.');
    expect(screen.getByRole('link', { name: 'Open in Scheduler' })).toHaveAttribute(
      'href',
      '/scheduler?weekStart=2026-05-25&role=Manager',
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Day-first view' }));

    expect(screen.getByRole('tab', { name: 'Day-first view' })).toHaveAttribute('aria-selected', 'true');
    const dayFirstView = screen.getByLabelText('Published day-first view');
    expect(dayFirstView).toBeInTheDocument();
    expect(within(dayFirstView).getByText('Monday')).toBeInTheDocument();
    expect(within(dayFirstView).getByText('Tuesday')).toBeInTheDocument();

    const assignmentsHeading = screen.getByRole('heading', { name: 'Published assignments' });
    const summaryHeading = screen.getByRole('heading', { name: 'Assignments' });
    expect(summaryHeading.compareDocumentPosition(assignmentsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const dayCoverageHeading = screen.getByRole('heading', { name: 'Day coverage' });
    expect(dayCoverageHeading.compareDocumentPosition(assignmentsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('supports selecting schedules from the matching schedule list', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: {
        shiftTypes: ['Open'],
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
      ],
      schedule: {
        status: 'draft',
        publishHistory: [
          {
            id: 'published-2',
            weekLabel: 'Jun 1 - Jun 7, 2026',
            startDate: '2026-06-01',
            endDate: '2026-06-07',
            selectedRole: 'Manager',
            publishedAt: '2026-06-01T18:00:00.000Z',
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
                Sunday: [], Monday: ['Open'], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [],
              },
            },
            metrics: {
              requiredSlots: 1,
              assignedSlots: 1,
              openSlots: 0,
              roleEmployeeCount: 1,
            },
            coverageGaps: [],
            shiftCapAlerts: [],
          },
          {
            id: 'published-1',
            weekLabel: 'May 25 - May 31, 2026',
            startDate: '2026-05-25',
            endDate: '2026-05-31',
            selectedRole: 'Manager',
            publishedAt: '2026-05-25T18:00:00.000Z',
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
                Sunday: [], Monday: ['Open'], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [],
              },
            },
            metrics: {
              requiredSlots: 1,
              assignedSlots: 1,
              openSlots: 0,
              roleEmployeeCount: 1,
            },
            coverageGaps: [],
            shiftCapAlerts: [],
          },
        ],
      },
    }));

    renderShifts();

    expect(screen.getByRole('heading', { level: 2, name: 'Jun 1 - Jun 7, 2026' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'May 25 - May 31, 2026 Manager' }));
    expect(screen.getByRole('heading', { level: 2, name: 'May 25 - May 31, 2026' })).toBeInTheDocument();
    expect(window.location.search).toContain('schedule=published-1');

    fireEvent.click(screen.getByRole('button', { name: 'Jun 1 - Jun 7, 2026 Manager' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Jun 1 - Jun 7, 2026' })).toBeInTheDocument();
  });

  it('filters published schedules by range and role from the top panel', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: {
        shiftTypes: ['Open'],
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
          name: 'Kyle Park',
          title: 'Kitchen Lead',
          role: 'Kitchen',
          contact: '(555) 010-2001',
          email: 'kyle@shiftsizzle.app',
          shiftsPerWeek: 5,
          status: 'active',
          availability: {
            Sunday: ['Open'], Monday: ['Open'], Tuesday: ['Open'], Wednesday: ['Open'], Thursday: ['Open'], Friday: ['Open'], Saturday: ['Open'],
          },
        },
      ],
      schedule: {
        status: 'draft',
        publishHistory: [
          {
            id: 'published-kitchen',
            weekLabel: 'Jun 1 - Jun 7, 2026',
            startDate: '2026-06-01',
            endDate: '2026-06-07',
            selectedRole: 'Kitchen',
            publishedAt: '2026-06-01T18:00:00.000Z',
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
              2: {
                Sunday: [], Monday: ['Open'], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [],
              },
            },
            metrics: {
              requiredSlots: 1,
              assignedSlots: 1,
              openSlots: 0,
              roleEmployeeCount: 1,
            },
            coverageGaps: [],
            shiftCapAlerts: [],
          },
          {
            id: 'published-manager',
            weekLabel: 'May 25 - May 31, 2026',
            startDate: '2026-05-25',
            endDate: '2026-05-31',
            selectedRole: 'Manager',
            publishedAt: '2026-05-25T18:00:00.000Z',
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
                Sunday: [], Monday: ['Open'], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [],
              },
            },
            metrics: {
              requiredSlots: 1,
              assignedSlots: 1,
              openSlots: 0,
              roleEmployeeCount: 1,
            },
            coverageGaps: [],
            shiftCapAlerts: [],
          },
        ],
      },
    }));

    renderShifts();

    expect(screen.queryByLabelText('Filtered schedule count')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'Manager' } });

    expect(screen.getByLabelText('Filtered schedule count')).toHaveTextContent('1 schedule match this filter.');
    expect(screen.getByRole('heading', { level: 2, name: 'May 25 - May 31, 2026' })).toBeInTheDocument();
    expect(window.location.search).toContain('role=Manager');

    fireEvent.change(screen.getByLabelText('Schedule range'), { target: { value: '2026-06-01__2026-06-07' } });

    expect(window.location.search).toContain('range=2026-06-01__2026-06-07');
    expect(screen.getByText('No matching schedules')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset filters' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));

    expect(screen.getByLabelText('Role')).toHaveValue('all');
    expect(screen.getByLabelText('Schedule range')).toHaveValue('all');
    expect(screen.queryByLabelText('Filtered schedule count')).not.toBeInTheDocument();
  });

  it('hydrates filters from query params', () => {
    window.history.replaceState({}, '', '/shifts?range=2026-05-25__2026-05-31&role=Manager');
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: {
        shiftTypes: ['Open'],
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
          name: 'Kyle Park',
          title: 'Kitchen Lead',
          role: 'Kitchen',
          contact: '(555) 010-2001',
          email: 'kyle@shiftsizzle.app',
          shiftsPerWeek: 5,
          status: 'active',
          availability: {
            Sunday: ['Open'], Monday: ['Open'], Tuesday: ['Open'], Wednesday: ['Open'], Thursday: ['Open'], Friday: ['Open'], Saturday: ['Open'],
          },
        },
      ],
      schedule: {
        status: 'draft',
        publishHistory: [
          {
            id: 'published-kitchen',
            weekLabel: 'Jun 1 - Jun 7, 2026',
            startDate: '2026-06-01',
            endDate: '2026-06-07',
            selectedRole: 'Kitchen',
            publishedAt: '2026-06-01T18:00:00.000Z',
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
              2: {
                Sunday: [], Monday: ['Open'], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [],
              },
            },
            metrics: {
              requiredSlots: 1,
              assignedSlots: 1,
              openSlots: 0,
              roleEmployeeCount: 1,
            },
            coverageGaps: [],
            shiftCapAlerts: [],
          },
          {
            id: 'published-manager',
            weekLabel: 'May 25 - May 31, 2026',
            startDate: '2026-05-25',
            endDate: '2026-05-31',
            selectedRole: 'Manager',
            publishedAt: '2026-05-25T18:00:00.000Z',
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
                Sunday: [], Monday: ['Open'], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [],
              },
            },
            metrics: {
              requiredSlots: 1,
              assignedSlots: 1,
              openSlots: 0,
              roleEmployeeCount: 1,
            },
            coverageGaps: [],
            shiftCapAlerts: [],
          },
        ],
      },
    }));

    renderShifts();

    expect(screen.getByLabelText('Schedule range')).toHaveValue('2026-05-25__2026-05-31');
    expect(screen.getByLabelText('Role')).toHaveValue('Manager');
    expect(screen.getByLabelText('Filtered schedule count')).toHaveTextContent('1 schedule match this filter.');
  });
});