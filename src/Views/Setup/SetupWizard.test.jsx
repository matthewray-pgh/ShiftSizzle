import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderView } from '../../test/renderView';
import { SetupWizard } from './SetupWizard';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockRequestAiSetup = vi.fn();

vi.mock('../../state/aiAssist', async () => {
  const actual = await vi.importActual('../../state/aiAssist');
  return { ...actual, requestAiSetup: (...args) => mockRequestAiSetup(...args) };
});

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
  mockNavigate.mockClear();
  mockRequestAiSetup.mockReset();
  resetFakeSupabase();
});

const renderWizard = () => renderView(SetupWizard, { employees: [], settings: {} });

describe('SetupWizard', () => {
  it('walks template -> hours -> coverage -> team -> build and lands in the builder', async () => {
    await renderWizard();

    // Step 1: pick a business type + week start, then continue.
    fireEvent.click(screen.getByRole('radio', { name: /Cafe \/ coffee shop/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Wed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 2: hours are pre-filled from the template.
    expect(await screen.findByText('Confirm your hours')).toBeInTheDocument();
    const openInputs = screen.getAllByLabelText('Open');
    expect(openInputs.some((input) => input.value === '06:00')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 3: coverage targets, role-scoped.
    expect(await screen.findByText('Confirm coverage targets')).toBeInTheDocument();
    expect(screen.getByLabelText('Role')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 4: add a team member.
    expect(await screen.findByText('Add your team')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sam Rivera' } });
    fireEvent.click(screen.getByRole('button', { name: 'Barista' }));
    fireEvent.click(screen.getByRole('button', { name: /Add to team/ }));
    expect(await screen.findByText('Sam Rivera')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 5: summary reflects the work, and finishing routes to the builder.
    expect(await screen.findByText("You're set up")).toBeInTheDocument();
    expect(screen.getByText(/1\s*$/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open the builder' }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/schedule/build'));
  });

  it('adjusts a shift time from the collapsed disclosure on the coverage step', async () => {
    await renderWizard();

    fireEvent.click(screen.getByRole('radio', { name: /Cafe \/ coffee shop/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('Confirm your hours')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('Confirm coverage targets')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Adjust shift times'));

    const starts = screen.getAllByLabelText('Start');
    expect(starts[0]).toHaveValue('06:00'); // from the Cafe template
    fireEvent.change(starts[0], { target: { value: '05:30' } });
    expect(screen.getAllByLabelText('Start')[0]).toHaveValue('05:30');
  });

  it('lets a manager skip the template and set up manually', async () => {
    await renderWizard();

    fireEvent.click(screen.getByRole('button', { name: 'Set up manually' }));
    expect(mockNavigate).toHaveBeenCalledWith('/settings');
  });

  it('resumes at the first step that is not yet complete', async () => {
    await renderView(SetupWizard, {
      employees: [],
      settings: {
        weekStartsOn: 'Monday',
        operatingHours: { Monday: { isOpen: true, openTime: '09:00', closeTime: '17:00' } },
      },
    });

    // Week + hours are done, coverage isn't — open straight on the coverage step.
    expect(screen.getByRole('heading', { name: 'Confirm coverage targets' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'What kind of business is this?' })).not.toBeInTheDocument();
  });

  it('links from the team step to the Team page for a bulk import', async () => {
    await renderView(SetupWizard, {
      employees: [],
      settings: {
        weekStartsOn: 'Monday',
        operatingHours: { Monday: { isOpen: true, openTime: '09:00', closeTime: '17:00' } },
        roleCoverage: { Manager: { Monday: { Open: 1 } } },
      },
    });

    expect(screen.getByRole('heading', { name: 'Add your team' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Import a CSV or scan IDs on the Team page/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/team');
  });

  it('generates the setup from a description and advances to review', async () => {
    mockRequestAiSetup.mockResolvedValue({
      ok: true,
      summary: 'Bakery open Tue–Sun, early mornings.',
      payload: {
        shiftTypes: ['Open', 'Close'],
        shiftTimes: {},
        teamRoles: ['Baker', 'Counter'],
        operatingHours: Object.fromEntries(
          ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => [
            day,
            day === 'Monday'
              ? { isOpen: false, openTime: '', closeTime: '' }
              : { isOpen: true, openTime: '06:00', closeTime: '15:00' },
          ]),
        ),
        roleCoverage: { Baker: { Tuesday: { Open: 2 } }, Counter: { Tuesday: { Open: 1 } } },
        weekStartsOn: 'Tuesday',
      },
    });

    await renderWizard();

    fireEvent.click(screen.getByRole('radio', { name: /Something else/ }));
    fireEvent.change(screen.getByLabelText('Tell us about your business'), {
      target: { value: 'A neighborhood bakery, open early Tuesday through Sunday.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate my setup' }));

    expect(await screen.findByText('Confirm your hours')).toBeInTheDocument();
    expect(screen.getByText('Bakery open Tue–Sun, early mornings.')).toBeInTheDocument();
    expect(mockRequestAiSetup).toHaveBeenCalledOnce();
  });

  it('falls back to the template list when AI setup is not deployed', async () => {
    mockRequestAiSetup.mockResolvedValue({ error: 'ai-unavailable' });

    await renderWizard();

    fireEvent.click(screen.getByRole('radio', { name: /Something else/ }));
    fireEvent.change(screen.getByLabelText('Tell us about your business'), {
      target: { value: 'A small taco shop open every day for lunch and dinner.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate my setup' }));

    // Silently drops back to the picker; the "Something else" option is gone.
    expect(await screen.findByRole('radiogroup', { name: 'Business type' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Something else/ })).not.toBeInTheDocument();
  });
});
