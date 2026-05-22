import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderView } from '../../test/renderView';
import { Scheduler } from './Scheduler';

describe('Scheduler view', () => {
  it('renders the scheduler page', () => {
    renderView(Scheduler);

    expect(screen.getByText('Schedule Control Panel')).toBeInTheDocument();
    expect(screen.getByText('Weekly Schedule Editor')).toBeInTheDocument();
  });
});