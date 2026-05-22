import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderView } from '../../test/renderView';
import { Settings } from './Settings';

describe('Settings view', () => {
  it('renders the settings page', () => {
    renderView(Settings);

    expect(screen.getByText('Workspace Settings')).toBeInTheDocument();
    expect(screen.getByText('Save Settings')).toBeInTheDocument();
  });
});