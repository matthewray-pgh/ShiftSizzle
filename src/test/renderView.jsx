import { render, waitFor } from '@testing-library/react';
import { expect } from 'vitest';

import { AppStateProvider, DAYS, useAppState } from '../state/AppState';
import { AuthProvider } from '../state/AuthState';
import { supabase } from '../lib/supabaseClient';
import { seedFakeSupabase } from './fakeSupabaseClient';

const fullAvailability = (shifts = ['Open', 'Mid', 'Close']) =>
  Object.fromEntries(DAYS.map((day) => [day, [...shifts]]));

// Mirrors the 7-person roster ShiftSizzle used to seed into a fresh
// localStorage blob before the Supabase migration (see `defaultEmployees` in
// AppState.jsx's git history) — kept here so view tests that don't care
// about specific roster data can just call `renderView(SomeView)` and get a
// realistic, non-empty org like they used to, instead of an empty one.
export const DEFAULT_TEST_EMPLOYEES = [
  { id: '1', name: 'Jen Ray', title: 'General Manager', roles: ['Manager'], contact: '(555) 010-1001', email: 'jen@shiftsizzle.app', shiftsPerWeek: 5, status: 'active', availability: fullAvailability() },
  { id: '2', name: 'Ryan Sutton', title: 'Assistant General Manager', roles: ['Manager'], contact: '(555) 010-1002', email: 'ryan@shiftsizzle.app', shiftsPerWeek: 5, status: 'active', availability: fullAvailability(['Open', 'Mid']) },
  { id: '3', name: 'Kayla Brooks', title: 'Bar Manager', roles: ['Bartender'], contact: '(555) 010-1003', email: 'kayla@shiftsizzle.app', shiftsPerWeek: 4, status: 'active', availability: fullAvailability(['Mid', 'Close']) },
  { id: '4', name: 'Kirk Brady', title: 'Director', roles: ['Manager'], contact: '(555) 010-1004', email: 'kirk@shiftsizzle.app', shiftsPerWeek: 4, status: 'active', availability: fullAvailability(['Open', 'Close']) },
  { id: '5', name: 'Jackie Carter', title: 'Lead Host', roles: ['Host'], contact: '(555) 010-1005', email: 'jackie@shiftsizzle.app', shiftsPerWeek: 4, status: 'active', availability: fullAvailability() },
  { id: '6', name: 'Marco Ellis', title: 'Line Cook', roles: ['Cook'], contact: '(555) 010-1006', email: 'marco@shiftsizzle.app', shiftsPerWeek: 5, status: 'active', availability: fullAvailability(['Open', 'Mid']) },
  { id: '7', name: 'Ariana Cole', title: 'Server', roles: ['Server'], contact: '(555) 010-1007', email: 'ariana@shiftsizzle.app', shiftsPerWeek: 4, status: 'active', availability: fullAvailability(['Mid', 'Close']) },
];

// Renders `children` only once org data has finished loading
// (state.isHydrated). Some views run mount-only effects (e.g. Scheduler's
// deep-link query param handling) that need real settings/employees to
// already be in place, which used to be guaranteed by localStorage
// hydrating synchronously before first render — this recreates that
// guarantee against the new async Supabase hydration.
export const HydrationGate = ({ children }) => {
  const { state } = useAppState();
  return state.isHydrated ? children : null;
};

// Seeds a default org (see DEFAULT_TEST_EMPLOYEES above) into the fake
// Supabase client, renders `ViewComponent` wrapped in the same
// AuthProvider > AppStateProvider tree the real app uses, and waits for
// hydration to finish before handing back control — every consuming test
// file mocks '.../lib/supabaseClient' itself (see AppState.test.jsx), which
// is what makes the `supabase` singleton imported here the fake one.
export const renderView = async (ViewComponent, seed = {}) => {
  seedFakeSupabase(supabase, {
    employees: DEFAULT_TEST_EMPLOYEES,
    employeeId: '1',
    ...seed,
  });

  const view = render(
    <AuthProvider>
      <AppStateProvider>
        <HydrationGate>
          <ViewComponent />
        </HydrationGate>
      </AppStateProvider>
    </AuthProvider>
  );

  await waitFor(() => {
    expect(view.container).not.toBeEmptyDOMElement();
  });

  return view;
};
