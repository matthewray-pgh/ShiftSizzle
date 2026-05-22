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

  return (
    <>
      <button type="button" onClick={() => dispatch({ type: 'AUTO_BUILD_SCHEDULE' })}>
        Auto-build
      </button>
      <span>Assigned count: {assignedCount}</span>
    </>
  );
};

describe('AppState scheduling', () => {
  it('respects each employee shifts per week cap during auto-build', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Auto-build' }));

    expect(screen.getByText('Assigned count: 1')).toBeInTheDocument();
  });
});