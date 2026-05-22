import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import App from './App';
import { AppStateProvider } from './state/AppState';

describe('ShiftSizzle application', () => {
  it('renders the dashboard shell by default', () => {
    render(
      <AppStateProvider>
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      </AppStateProvider>
    );

    expect(screen.getByText('Hello, Jennifer')).toBeInTheDocument();
    expect(screen.getByText('Active employees')).toBeInTheDocument();
    expect(screen.getAllByText('Schedules').length).toBeGreaterThan(0);
  });

  it('renders the team management view on the team route', () => {
    render(
      <AppStateProvider>
        <MemoryRouter initialEntries={['/team']}>
          <App />
        </MemoryRouter>
      </AppStateProvider>
    );

    expect(screen.getByText('Add Employee')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search employees')).toBeInTheDocument();
  });
});