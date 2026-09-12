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
  it('walks template -> shift types -> team roles -> hours -> coverage -> team -> build and lands in the builder', async () => {
    await renderWizard();

    // Step 1: pick a business type + week start, then continue.
    fireEvent.click(screen.getByRole('radio', { name: /Cafe \/ coffee shop/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Wed' }));
    clickContinue();

    // Shift types and team roles are new review stops shared with Settings
    // — same components, so nothing to assert here beyond reaching them.
    expect(await screen.findByText('Confirm your shift types')).toBeInTheDocument();
    clickContinue();

    expect(await screen.findByText('Confirm your team roles')).toBeInTheDocument();
    clickContinue();

    // Hours are pre-filled from the template.
    expect(await screen.findByText('Confirm your hours')).toBeInTheDocument();
    const openInputs = screen.getAllByLabelText('Open');
    expect(openInputs.some((input) => input.value === '06:00')).toBe(true);
    clickContinue();

    // Coverage targets — a role pill per team role, the first one already
    // reviewed, the rest flagged as still to review.
    expect(await screen.findByText('Confirm coverage targets')).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Role' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Barista/ })).toBeInTheDocument();
    expect(screen.getByText(/Still to review:/)).toBeInTheDocument();
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
    expect(await screen.findByText('Confirm your shift types')).toBeInTheDocument();

    // Now the earlier + reached steps are clickable.
    fireEvent.click(screen.getByRole('button', { name: /Coverage/ }));
    expect(await screen.findByText('Confirm coverage targets')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Business type/ }));
    expect(await screen.findByText('What kind of business is this?')).toBeInTheDocument();
  });

  it('tunes a template\'s coverage from the size hint before advancing', async () => {
    mockRequestTunedCoverage.mockResolvedValue({
      ok: true,
      coverageByRole: { Barista: { Open: 5 } },
      summary: 'Bumped opening baristas for the weekend rush.',
    });

    await renderWizard();

    fireEvent.click(screen.getByRole('radio', { name: /Cafe \/ coffee shop/ }));
    fireEvent.change(screen.getByLabelText(/Fine-tune staffing/), {
      target: { value: 'Busy weekend brunch, seats about 40.' },
    });
    clickContinue();

    // template -> shift types -> team roles -> hours (the tune ran during
    // the template -> shift types transition) -> coverage.
    expect(await screen.findByText('Confirm your shift types')).toBeInTheDocument();
    clickContinue();

    expect(await screen.findByText('Confirm your team roles')).toBeInTheDocument();
    clickContinue();

    expect(await screen.findByText('Confirm your hours')).toBeInTheDocument();
    clickContinue();

    expect(await screen.findByText('Confirm coverage targets')).toBeInTheDocument();
    expect(screen.getByText('Bumped opening baristas for the weekend rush.')).toBeInTheDocument();
    expect(mockRequestTunedCoverage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ templateLabel: 'Cafe / coffee shop', note: 'Busy weekend brunch, seats about 40.' }),
    );
  });

  it('falls back to template numbers when the coverage tune fails', async () => {
    mockRequestTunedCoverage.mockResolvedValue({ error: 'model unavailable' });

    await renderWizard();

    fireEvent.click(screen.getByRole('radio', { name: /Cafe \/ coffee shop/ }));
    fireEvent.change(screen.getByLabelText(/Fine-tune staffing/), { target: { value: 'A small cafe.' } });
    clickContinue();

    expect(await screen.findByText('Confirm your shift types')).toBeInTheDocument();
    clickContinue();

    expect(await screen.findByText('Confirm your team roles')).toBeInTheDocument();
    clickContinue();

    expect(await screen.findByText('Confirm your hours')).toBeInTheDocument();
    clickContinue();

    expect(await screen.findByText('Confirm coverage targets')).toBeInTheDocument();
    expect(screen.getByText(/Couldn't adjust staffing automatically/)).toBeInTheDocument();
  });

  it('skips the tune call when the size hint is left blank', async () => {
    await renderWizard();

    fireEvent.click(screen.getByRole('radio', { name: /Cafe \/ coffee shop/ }));
    clickContinue();

    expect(await screen.findByText('Confirm your shift types')).toBeInTheDocument();
    expect(mockRequestTunedCoverage).not.toHaveBeenCalled();
  });

  it('tracks which roles have been reviewed on the coverage step', async () => {
    await renderWizard();

    fireEvent.click(screen.getByRole('radio', { name: /Cafe \/ coffee shop/ }));
    clickContinue();
    expect(await screen.findByText('Confirm your shift types')).toBeInTheDocument();
    clickContinue();
    expect(await screen.findByText('Confirm your team roles')).toBeInTheDocument();
    clickContinue();
    expect(await screen.findByText('Confirm your hours')).toBeInTheDocument();
    clickContinue();

    expect(await screen.findByText('Confirm coverage targets')).toBeInTheDocument();
    // Cafe template roles: Shift Lead, Barista, Cook. One is auto-reviewed.
    expect(screen.getByText('Still to review: Barista, Cook')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Barista/ }));
    expect(screen.getByText('Still to review: Cook')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Cook/ }));
    expect(screen.queryByText(/Still to review/)).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('radio', { name: /Something else/ }));
    fireEvent.change(screen.getByLabelText('Tell us about your business'), {
      target: { value: 'A neighborhood bakery, open early Tuesday through Sunday.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate my setup' }));

    expect(await screen.findByText('Confirm your shift types')).toBeInTheDocument();
    expect(mockRequestAiSetup).toHaveBeenCalledOnce();

    // The AI's summary line surfaces on the hours step, same as before.
    clickContinue();
    expect(await screen.findByText('Confirm your team roles')).toBeInTheDocument();
    clickContinue();
    expect(await screen.findByText('Confirm your hours')).toBeInTheDocument();
    expect(screen.getByText('Bakery open Tue–Sun, early mornings.')).toBeInTheDocument();
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
