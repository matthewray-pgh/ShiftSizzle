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
    expect(screen.getByText('Active employees')).toBeInTheDocument();
    expect(screen.getAllByText('Schedule').length).toBeGreaterThan(0);
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

    expect(await screen.findByText('Add Employee')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search employees')).toBeInTheDocument();
  });
});
