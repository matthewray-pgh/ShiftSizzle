import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderView } from '../../test/renderView';
import { Messages } from './Messages';

describe('Messages view', () => {
  it('renders the messages page', () => {
    renderView(Messages);

    expect(screen.getByText('Team Updates')).toBeInTheDocument();
    expect(screen.getByText('Welcome to ShiftSizzle')).toBeInTheDocument();
  });
});