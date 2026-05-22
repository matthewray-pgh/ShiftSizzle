import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderView } from '../../test/renderView';
import { Dashboard } from './Dashboard';

describe('Dashboard view', () => {
  it('renders the dashboard page', () => {
    renderView(Dashboard);

    expect(screen.getByText('Hello, Jennifer')).toBeInTheDocument();
    expect(screen.getByText('Active employees')).toBeInTheDocument();
    expect(screen.getByText('Business Hours')).toBeInTheDocument();
    expect(screen.getByText('Sun-Thu')).toBeInTheDocument();
    expect(screen.getByText('11:00 AM - 9:00 PM')).toBeInTheDocument();
  });
});