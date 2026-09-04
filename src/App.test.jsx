import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import { AppStateProvider } from './state/AppState';
import { AuthProvider } from './state/AuthState';

vi.mock('./lib/supabaseClient', async () => {
  const { createFakeSupabaseClient } = await import('./test/fakeSupabaseClient');
  return { supabase: createFakeSupabaseClient() };
});

const { supabase } = await import('./lib/supabaseClient');
const { seedFakeSupabase } = await import('./test/fakeSupabaseClient');
const { DEFAULT_TEST_EMPLOYEES } = await import('./test/renderView');

const resetFakeSupabase = () => {
  Object.values(supabase.__tables).forEach((rows) => {
    rows.length = 0;
  });
  supabase.__setSession(null);
};

beforeEach(() => {
  resetFakeSupabase();
});

describe('ShiftSizzle application', () => {
  it('renders the dashboard shell by default', async () => {
    seedFakeSupabase(supabase, { employees: DEFAULT_TEST_EMPLOYEES, employeeId: '1' });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/']}>
          <AppStateProvider>
            <App />
          </AppStateProvider>
        </MemoryRouter>
      </AuthProvider>
    );

    expect(await screen.findByText('Hello, Jen Ray')).toBeInTheDocument();
    expect(screen.getByText('Coverage')).toBeInTheDocument();
    expect(screen.getAllByText('Schedule').length).toBeGreaterThan(0);
  });

  it('shows the linked employee\'s roster name in the header, not the raw login email', async () => {
    seedFakeSupabase(supabase, { employees: DEFAULT_TEST_EMPLOYEES, employeeId: '1' });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/']}>
          <AppStateProvider>
            <App />
          </AppStateProvider>
        </MemoryRouter>
      </AuthProvider>
    );

    await screen.findByText('Hello, Jen Ray');
    // Both the desktop header pill and the mobile header's icon-only
    // avatar button share the "My account" label — scope to the named
    // desktop pill, the only one with visible text content.
    expect(screen.getByLabelText('My account', { selector: '.layout__header-main-user-pill' })).toHaveTextContent('Jen Ray');
  });

  it('falls back to the login email in the header when not linked to a roster employee', async () => {
    seedFakeSupabase(supabase, { employees: DEFAULT_TEST_EMPLOYEES, employeeId: null });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/']}>
          <AppStateProvider>
            <App />
          </AppStateProvider>
        </MemoryRouter>
      </AuthProvider>
    );

    await screen.findByText('Coverage');
    expect(screen.getByLabelText('My account', { selector: '.layout__header-main-user-pill' })).toHaveTextContent('test-user@example.com');
  });

  it('renders the team management view on the team route', async () => {
    seedFakeSupabase(supabase, { employees: DEFAULT_TEST_EMPLOYEES, employeeId: '1' });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/team']}>
          <AppStateProvider>
            <App />
          </AppStateProvider>
        </MemoryRouter>
      </AuthProvider>
    );

    // Wait on the search box specifically, not the "Add Employee" text —
    // that label now also appears (briefly, pre-hydration) on the
    // empty-roster state's consolidated add-employee menu button.
    expect(await screen.findByPlaceholderText('Search employees')).toBeInTheDocument();
    expect(screen.getByText('Add Employee')).toBeInTheDocument();
  });
});
