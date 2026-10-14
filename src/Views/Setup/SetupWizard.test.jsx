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
const mockRequestTunedCoverage = vi.fn();

vi.mock('../../state/aiAssist', async () => {
  const actual = await vi.importActual('../../state/aiAssist');
  return {
    ...actual,
    requestAiSetup: (...args) => mockRequestAiSetup(...args),
    requestTunedCoverage: (...args) => mockRequestTunedCoverage(...args),
  };
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
  mockRequestTunedCoverage.mockReset();
  resetFakeSupabase();
});

const renderWizard = () => renderView(SetupWizard, { employees: [], settings: {} });

const clickContinue = () => fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

describe('SetupWizard', () => {
  it('walks template -> hours -> shift types -> team roles -> coverage -> team -> build and lands in the builder', async () => {
    await renderWizard();

    // Step 1: nothing is preselected, so Continue waits for a business type.
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: /Cafe \/ coffee shop/ }));
    clickContinue();

    // Hours are pre-filled from the template; the week start is confirmed
    // here, defaulting to Monday.
    expect(await screen.findByText('Confirm your hours')).toBeInTheDocument();
    const openInputs = screen.getAllByLabelText('Open');
    expect(openInputs.some((input) => input.value === '06:00')).toBe(true);
    expect(screen.getByRole('button', { name: 'Mon' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Wed' }));
    expect(screen.getByRole('button', { name: 'Wed' })).toHaveAttribute('aria-pressed', 'true');
    clickContinue();

    // Shift types and team roles are review stops shared with Settings —
    // same components, so nothing to assert here beyond reaching them.
    expect(await screen.findByText('Confirm your shift types')).toBeInTheDocument();
    clickContinue();

    expect(await screen.findByText('Confirm your team roles')).toBeInTheDocument();
    clickContinue();

    // Coverage targets — the week heatmap, opened on the first open day's
    // first shift with a stepper per team role.
    expect(await screen.findByText('Confirm coverage targets')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Coverage targets by day and shift' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add one Barista' })).toBeInTheDocument();
    clickContinue();

    // Add a team member.
    expect(await screen.findByText('Add your team')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sam Rivera' } });
    fireEvent.click(screen.getByRole('button', { name: 'Barista' }));
    fireEvent.click(screen.getByRole('button', { name: /Add to team/ }));
    expect(await screen.findByText('Sam Rivera')).toBeInTheDocument();
    clickContinue();

    // Summary reflects the work, and finishing routes to the builder.
    expect(await screen.findByText("You're set up")).toBeInTheDocument();
    expect(screen.getByText(/1\s*$/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open the builder' }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/schedule/build'));
  });

  it('adjusts a shift type\'s time on the shift types step', async () => {
    await renderWizard();

    fireEvent.click(screen.getByRole('radio', { name: /Cafe \/ coffee shop/ }));
    clickContinue();

    // Times sit inline per shift type now (Settings' own Shift Types
    // section), not behind a separate collapsed disclosure.
    expect(await screen.findByText('Confirm your hours')).toBeInTheDocument();
    clickContinue();
    expect(await screen.findByText('Confirm your shift types')).toBeInTheDocument();
    const starts = screen.getAllByLabelText('Start');
    expect(starts[0]).toHaveValue('06:00'); // from the Cafe template
    fireEvent.change(starts[0], { target: { value: '05:30' } });
    expect(screen.getAllByLabelText('Start')[0]).toHaveValue('05:30');
  });

  it('lets you jump between reached steps from the progress bar, but locks ones ahead of the template', async () => {
    await renderWizard();

    // Before a template is committed, only "Business type" is reachable.
    expect(screen.getByRole('button', { name: /Business type/ })).toBeDisabled(); // current
    expect(screen.getByRole('button', { name: /Coverage/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: /Cafe \/ coffee shop/ }));
    clickContinue();
    expect(await screen.findByText('Confirm your hours')).toBeInTheDocument();

    // Now the earlier + reached steps are clickable.
    fireEvent.click(screen.getByRole('button', { name: /Coverage/ }));
    expect(await screen.findByText('Confirm coverage targets')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Business type/ }));
    expect(await screen.findByText('What kind of business is this?')).toBeInTheDocument();
  });

  // template -> hours -> shift types -> team roles -> coverage.
  const walkToCoverage = async () => {
    await renderWizard();

    fireEvent.click(screen.getByRole('radio', { name: /Cafe \/ coffee shop/ }));
    clickContinue();
    expect(await screen.findByText('Confirm your hours')).toBeInTheDocument();
    clickContinue();
    expect(await screen.findByText('Confirm your shift types')).toBeInTheDocument();
    clickContinue();
    expect(await screen.findByText('Confirm your team roles')).toBeInTheDocument();
    clickContinue();
    expect(await screen.findByText('Confirm coverage targets')).toBeInTheDocument();
  };

  it('adjusts coverage for the location from the coverage step', async () => {
    mockRequestTunedCoverage.mockResolvedValue({
      ok: true,
      coverageByRole: { Barista: { Open: 5 } },
      summary: 'Bumped opening baristas for the weekend rush.',
    });

    await walkToCoverage();
    expect(mockRequestTunedCoverage).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('What should we know about your location?'), {
      target: { value: 'Busy weekend brunch, seats about 40.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Adjust staffing' }));

    expect(await screen.findByText('Bumped opening baristas for the weekend rush.')).toBeInTheDocument();
    expect(mockRequestTunedCoverage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        templateLabel: 'Cafe / coffee shop',
        roles: ['Shift Lead', 'Barista', 'Cook'],
        note: 'Busy weekend brunch, seats about 40.',
      }),
    );
    // The first open day's Open shift is selected by default.
    expect(screen.getByLabelText('Barista needed')).toHaveTextContent('5');
  });

  it('leaves the numbers alone and says why when the adjustment fails', async () => {
    mockRequestTunedCoverage.mockResolvedValue({ error: 'The AI service took too long to respond. Try again.' });

    await walkToCoverage();
    const before = screen.getByLabelText('Barista needed').textContent;

    fireEvent.change(screen.getByLabelText('What should we know about your location?'), { target: { value: 'A small cafe.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adjust staffing' }));

    expect(await screen.findByText(/Couldn't adjust staffing — your numbers are unchanged\. The AI service took too long/)).toBeInTheDocument();
    expect(screen.getByLabelText('Barista needed')).toHaveTextContent(before);
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

    // Week + hours are done, coverage isn't — open straight on the coverage
    // step (shift types / team roles are review-only stops, never gates).
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

  it('warns on the build step when the team was skipped, and sends you back to fix it', async () => {
    await renderView(SetupWizard, {
      employees: [],
      settings: {
        weekStartsOn: 'Monday',
        operatingHours: { Monday: { isOpen: true, openTime: '09:00', closeTime: '17:00' } },
        roleCoverage: { Manager: { Monday: { Open: 1 } } },
      },
    });

    expect(screen.getByRole('heading', { name: 'Add your team' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));

    expect(await screen.findByText("You're set up")).toBeInTheDocument();
    expect(screen.getByText(/You don't have any team members yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Build my first week' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Go back to Team' }));
    expect(await screen.findByRole('heading', { name: 'Add your team' })).toBeInTheDocument();
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

    fireEvent.change(screen.getByLabelText('Tell us about your business'), {
      target: { value: 'A neighborhood bakery, open early Tuesday through Sunday.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate my setup' }));

    // Hours is the first stop after generating, and carries the AI's summary.
    expect(await screen.findByText('Confirm your hours')).toBeInTheDocument();
    expect(mockRequestAiSetup).toHaveBeenCalledOnce();
    expect(screen.getByText('Bakery open Tue–Sun, early mornings.')).toBeInTheDocument();
    // The week start the description stated is what the Hours step shows.
    expect(screen.getByRole('button', { name: 'Tue' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('falls back to the template list when AI setup is not deployed', async () => {
    mockRequestAiSetup.mockResolvedValue({ error: 'ai-unavailable' });

    await renderWizard();

    fireEvent.change(screen.getByLabelText('Tell us about your business'), {
      target: { value: 'A small taco shop open every day for lunch and dinner.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate my setup' }));

    // The describe box quietly goes away, leaving the templates.
    await waitFor(() => expect(screen.queryByLabelText('Tell us about your business')).not.toBeInTheDocument());
    expect(screen.getByRole('radiogroup', { name: 'Business type' })).toBeInTheDocument();
    expect(screen.getByText('Start from a common setup')).toBeInTheDocument();
  });
});
