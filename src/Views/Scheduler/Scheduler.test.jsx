import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AppStateProvider } from '../../state/AppState';
import { renderView } from '../../test/renderView';
import { Scheduler } from './Scheduler';

const STORAGE_KEY = 'shiftsizzle.app-state.v1';

describe('Scheduler view', () => {
  it('renders the scheduler page', () => {
    renderView(Scheduler);

    expect(screen.getByText('Schedule Control Panel')).toBeInTheDocument();
    expect(screen.getByText('Weekly Schedule Editor')).toBeInTheDocument();
    const jenHeading = screen.getAllByText('Jen Ray').find((element) => element.tagName === 'STRONG');
    const jenCard = jenHeading?.closest('.scheduler__employee-card');

    expect(jenCard).not.toBeNull();
    expect(within(jenCard).getByText('5 shifts/week')).toBeInTheDocument();
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
});