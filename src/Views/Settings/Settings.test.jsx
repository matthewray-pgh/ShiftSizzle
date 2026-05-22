import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderView } from '../../test/renderView';
import { Settings } from './Settings';

describe('Settings view', () => {
  it('renders the settings page', () => {
    renderView(Settings);

    expect(screen.getByText('Manage business defaults and scheduling rules')).toBeInTheDocument();
    expect(screen.getByText('Workspace settings')).toBeInTheDocument();
    expect(screen.getByText('Shift Types')).toBeInTheDocument();
    expect(screen.getByText('Team Roles')).toBeInTheDocument();
    expect(screen.getByText('Business Hours')).toBeInTheDocument();
    expect(screen.getByText('Sunday')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Open').length).toBeGreaterThan(0);
    expect(screen.getByText('Save Workspace Details')).toBeInTheDocument();
    expect(screen.getByText('Save Shift Types')).toBeInTheDocument();
    expect(screen.getByText('Save Team Roles')).toBeInTheDocument();
    expect(screen.getByText('Save Business Hours')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Workspace Details' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save Shift Types' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save Team Roles' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save Business Hours' })).toBeDisabled();
  });
});