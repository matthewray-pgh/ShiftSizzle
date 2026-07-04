import { fireEvent, screen } from '@testing-library/react';
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
    expect(screen.getByText('Scheduling Week')).toBeInTheDocument();
    expect(screen.getByText('Business Hours')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sunday' })).toBeInTheDocument();
    expect(screen.getAllByLabelText('Open').length).toBeGreaterThan(0);
    expect(screen.getByText('No changes to save')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeDisabled();
  });

  it('saves every dirty section in one action and shows a single confirmation', () => {
    renderView(Settings);

    fireEvent.change(screen.getByLabelText('Location Name'), { target: { value: 'Uptown Diner' } });
    fireEvent.change(screen.getByLabelText('Week Starts On'), { target: { value: 'Monday' } });

    expect(screen.getAllByText('Unsaved changes').length).toBe(3);
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
    expect(screen.getByText('All changes saved')).toBeInTheDocument();
    expect(screen.getByLabelText('Location Name')).toHaveValue('Uptown Diner');
    expect(screen.getByLabelText('Week Starts On')).toHaveValue('Monday');
  });

  it('discards unsaved edits across all sections', () => {
    renderView(Settings);

    fireEvent.change(screen.getByLabelText('Location Name'), { target: { value: 'Uptown Diner' } });
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

    expect(screen.getByLabelText('Location Name')).not.toHaveValue('Uptown Diner');
    expect(screen.getByText('No changes to save')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });
});
