import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderView } from '../../test/renderView';
import { Settings } from './Settings';

vi.mock('../../lib/supabaseClient', async () => {
  const { createFakeSupabaseClient } = await import('../../test/fakeSupabaseClient');
  return { supabase: createFakeSupabaseClient() };
});

const { supabase } = await import('../../lib/supabaseClient');

const resetFakeSupabase = () => {
  Object.values(supabase.__tables).forEach((rows) => {
    rows.length = 0;
  });
  supabase.__setSession(null);
};

beforeEach(() => {
  resetFakeSupabase();
});

describe('Settings view', () => {
  it('renders the settings page', async () => {
    await renderView(Settings);

    expect(screen.getByText('Workspace settings')).toBeInTheDocument();
    expect(screen.getByText('Workspace Details')).toBeInTheDocument();
    expect(screen.getByText('Shift Types')).toBeInTheDocument();
    expect(screen.getByText('Team Roles')).toBeInTheDocument();
    expect(screen.getByText('Scheduling Week')).toBeInTheDocument();
    expect(screen.getByText('Business Hours')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sunday' })).toBeInTheDocument();
    expect(screen.getAllByLabelText('Open').length).toBeGreaterThan(0);
    expect(screen.getByText('No changes to save')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeDisabled();
  });

  it('sets a per-day override for a shift type and keeps it through a save', async () => {
    await renderView(Settings);

    fireEvent.click(screen.getAllByText('Different hours on some days')[0]);

    const fridayStart = screen.getByLabelText('Open Friday start time');
    fireEvent.change(fridayStart, { target: { value: '08:00' } });

    expect(fridayStart).toHaveValue('08:00');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('All changes saved')).toBeInTheDocument();
    expect(screen.getByLabelText('Open Friday start time')).toHaveValue('08:00');
    expect(screen.getByLabelText('Open Monday start time')).toHaveValue('');
  });

  it('saves every dirty section in one action and shows a single confirmation', async () => {
    await renderView(Settings);

    fireEvent.change(screen.getByLabelText('Location Name'), { target: { value: 'Uptown Diner' } });
    fireEvent.change(screen.getByLabelText('Week Starts On'), { target: { value: 'Monday' } });

    expect(screen.getAllByText('Unsaved changes').length).toBe(3);
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
    expect(screen.getByText('All changes saved')).toBeInTheDocument();
    expect(screen.getByLabelText('Location Name')).toHaveValue('Uptown Diner');
    expect(screen.getByLabelText('Week Starts On')).toHaveValue('Monday');
  });

  it('renders each section as a collapsible header, all expanded by default', async () => {
    await renderView(Settings);

    const workspace = screen.getByRole('button', { name: 'Workspace Details' });
    const businessHours = screen.getByRole('button', { name: 'Business Hours' });

    expect(workspace).toHaveAttribute('aria-expanded', 'true');
    expect(businessHours).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(businessHours);
    expect(businessHours).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(businessHours);
    expect(businessHours).toHaveAttribute('aria-expanded', 'true');
  });

  it('fills business hours from the "Weekdays 9–5" preset', async () => {
    await renderView(Settings, { settings: { weekStartsOn: 'Monday' } });

    fireEvent.click(screen.getByRole('button', { name: 'Weekdays 9–5' }));

    const openInputs = screen.getAllByLabelText('Open').filter((input) => input.type === 'time');
    // Sun, Mon, Tue, Wed, Thu, Fri, Sat
    expect(openInputs.map((input) => input.value)).toEqual([
      '', '09:00', '09:00', '09:00', '09:00', '09:00', '',
    ]);
    expect(openInputs[1]).toBeEnabled();
    expect(openInputs[0]).toBeDisabled();
  });

  it('copies one day’s business hours to every day', async () => {
    await renderView(Settings, {
      settings: {
        weekStartsOn: 'Monday',
        operatingHours: {
          Tuesday: { isOpen: true, openTime: '07:30', closeTime: '15:30' },
        },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Apply Tuesday hours to all days' }));

    // "Open" also labels the coverage-grid number inputs; the business-hours
    // fields are the time inputs.
    const openInputs = screen.getAllByLabelText('Open').filter((input) => input.type === 'time');
    expect(openInputs.length).toBe(7);
    openInputs.forEach((input) => {
      expect(input).toHaveValue('07:30');
      expect(input).toBeEnabled();
    });
  });

  it('discards unsaved edits across all sections', async () => {
    await renderView(Settings);

    fireEvent.change(screen.getByLabelText('Location Name'), { target: { value: 'Uptown Diner' } });
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(screen.getByLabelText('Location Name')).not.toHaveValue('Uptown Diner');
    expect(screen.getByText('No changes to save')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
