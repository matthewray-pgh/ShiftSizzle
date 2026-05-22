import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderView } from '../../test/renderView';
import { Shifts } from './Shifts';

describe('Shifts view', () => {
  it('renders the shifts page', () => {
    renderView(Shifts);

    expect(screen.getByText('Draft team view for Manager scheduling.')).toBeInTheDocument();
  });
});