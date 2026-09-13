import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppStateProvider } from '../../state/AppState';
import { AuthProvider } from '../../state/AuthState';
import { HydrationGate, renderView } from '../../test/renderView';
import { Scheduler } from './Scheduler';

vi.mock('../../lib/supabaseClient', async () => {
  const { createFakeSupabaseClient } = await import('../../test/fakeSupabaseClient');
  return { supabase: createFakeSupabaseClient() };
});

const { supabase } = await import('../../lib/supabaseClient');
const { seedFakeSupabase } = await import('../../test/fakeSupabaseClient');

const resetFakeSupabase = () => {
  Object.values(supabase.__tables).forEach((rows) => {
    rows.length = 0;
  });
  supabase.__setSession(null);
};

const singleDayOperatingHours = {
  Sunday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
  Monday: { isOpen: true, openTime: '11:00', closeTime: '21:00' },
  Tuesday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
  Wednesday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
  Thursday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
  Friday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
  Saturday: { isOpen: false, openTime: '11:00', closeTime: '21:00' },
};

const twoDayOperatingHours = {
  ...singleDayOperatingHours,
  Tuesday: { isOpen: true, openTime: '11:00', closeTime: '21:00' },
};

const grid = (openValue = 0) => ({
  Sunday: { Open: 0 },
  Monday: { Open: openValue },
  Tuesday: { Open: 0 },
  Wednesday: { Open: 0 },
  Thursday: { Open: 0 },
  Friday: { Open: 0 },
  Saturday: { Open: 0 },
});

const emptyAssignments = () => ({
  Sunday: [], Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [],
});

const availableEveryDay = { Sunday: ['Open'], Monday: ['Open'], Tuesday: ['Open'], Wednesday: ['Open'], Thursday: ['Open'], Friday: ['Open'], Saturday: ['Open'] };

// The shift card for a role on the day currently shown in the Day builder.
// Tests using more than one shift type would pass a label too.
const getShiftCard = (role) => screen
  .getByText(role, { selector: '.scheduler__shift-card-title strong' })
  .closest('.scheduler__shift-card');

const getDayTab = (day) => screen.getByRole('tab', { name: new RegExp(`^${day}(\\s|$)`) });

const openAddPanel = (card) => fireEvent.click(within(card).getByRole('button', { name: 'Add person' }));

const renderScheduler = async (seed = {}) => {
  seedFakeSupabase(supabase, seed);

  render(
    <MemoryRouter>
      <AuthProvider>
        <AppStateProvider>
          <HydrationGate>
            <Scheduler />
          </HydrationGate>
        </AppStateProvider>
      </AuthProvider>
    </MemoryRouter>
  );

  // The action bar's Publish button is present as soon as a configured org
  // has hydrated onto a week.
  await screen.findByRole('button', { name: 'Publish week' });
};

// Navigate to a specific week via the action-bar week stepper's sheet.
const selectWeek = (startDate) => {
  const changeWeek = screen.queryByRole('button', { name: /^Change week/ });

  if (changeWeek) {
    fireEvent.click(changeWeek);
  }

  fireEvent.change(screen.getByLabelText('Week start date'), { target: { value: startDate } });
};

beforeEach(() => {
  resetFakeSupabase();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Scheduler view', () => {
  it('shows the first-run setup card when no scheduling week is configured', async () => {
    await renderView(Scheduler);

    expect(screen.getByRole('heading', { name: 'Build Schedule' })).toBeInTheDocument();
    expect(screen.getByText('Which day does your week start?')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Week starts on' })).toBeInTheDocument();
    expect(screen.getByLabelText('Week start date')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Publish week' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Change week/ })).not.toBeInTheDocument();
  });

  it('hydrates week and role from deep-link query params, activating the matching role tab', async () => {
    window.history.replaceState({}, '', '/schedule/build?weekStart=2026-05-25&role=Manager');

    await renderScheduler({
      settings: {
        weekStartsOn: 'Monday',
        operatingHours: singleDayOperatingHours,
        roleCoverage: { Manager: { Monday: { Open: 1 } } },
      },
      employees: [{ id: '1', name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay }],
    });

    expect(screen.getByRole('button', { name: /Change week — May 25/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Manager/ })).toHaveAttribute('aria-selected', 'true');
    expect(window.location.search).toBe('');
  });

  it('switching weeks shows no confirm dialog and reloads the target week\'s shift cards', async () => {
    await renderScheduler({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: singleDayOperatingHours },
      employees: [{ id: '1', name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay }],
      schedules: [{
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        role: 'Manager',
        status: 'draft',
        requirements: grid(1),
        assignments: { 1: emptyAssignments() },
      }],
    });

    selectWeek('2026-05-24');
    expect(screen.getByRole('button', { name: /Change week — May 24/ })).toBeInTheDocument();

    selectWeek('2026-06-07');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Change week — Jun 7/ })).toBeInTheDocument();

    selectWeek('2026-05-24');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Change week — May 24/ })).toBeInTheDocument();
    expect(within(getShiftCard('Manager')).getByText('0/1')).toBeInTheDocument();
  });

  it('reset clears the week\'s assignments behind a confirm dialog, keeping the coverage target', async () => {
    await renderScheduler({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: singleDayOperatingHours },
      employees: [{ id: '1', name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay }],
      schedules: [{
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        role: 'Manager',
        status: 'draft',
        requirements: grid(1),
        assignments: { 1: emptyAssignments() },
      }],
    });

    selectWeek('2026-05-24');
    fireEvent.click(getDayTab('Monday'));

    const card = getShiftCard('Manager');
    openAddPanel(card);
    fireEvent.click(within(card).getByRole('button', { name: /Jen Ray/ }));
    expect(within(getShiftCard('Manager')).getByText('1/1')).toBeInTheDocument();

    const openReset = () => {
      fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Reset week' }));
    };

    openReset();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    openReset();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reset week' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Assignment cleared, but the target still reads 0/1 (not 0/0).
    expect(within(getShiftCard('Manager')).getByText('0/1')).toBeInTheDocument();
    expect(within(getShiftCard('Manager')).getByText('No one assigned')).toBeInTheDocument();
  });

  it('deletes an unpublished week\'s schedule record entirely, behind a confirm dialog', async () => {
    await renderScheduler({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: singleDayOperatingHours },
      employees: [{ id: '1', name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay }],
      schedules: [{
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        role: 'Manager',
        status: 'draft',
        requirements: grid(1),
        assignments: { 1: emptyAssignments() },
      }],
    });

    selectWeek('2026-05-24');
    fireEvent.click(getDayTab('Monday'));

    const card = getShiftCard('Manager');
    openAddPanel(card);
    fireEvent.click(within(card).getByRole('button', { name: /Jen Ray/ }));
    expect(within(getShiftCard('Manager')).getByText('1/1')).toBeInTheDocument();

    const openDelete = () => {
      fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete draft' }));
    };

    openDelete();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    openDelete();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete draft' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // The record is gone (not just cleared) — the coverage target still
    // re-seeds from the Settings template, same as a reset.
    expect(within(getShiftCard('Manager')).getByText('0/1')).toBeInTheDocument();
  });

  it('does not offer to delete a published week', async () => {
    await renderScheduler({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: singleDayOperatingHours },
      employees: [{ id: '1', name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay }],
      schedules: [{
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        role: 'Manager',
        status: 'published',
        requirements: grid(1),
        assignments: { 1: { ...emptyAssignments(), Monday: ['Open'] } },
      }],
    });

    selectWeek('2026-05-24');

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.queryByRole('menuitem', { name: 'Delete draft' })).not.toBeInTheDocument();
  });

  it('shows only operating days in the day tab strip', async () => {
    await renderScheduler({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: singleDayOperatingHours },
      employees: [{ id: '1', name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay }],
      schedules: [{
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        role: 'Manager',
        status: 'draft',
        requirements: grid(1),
        assignments: { 1: emptyAssignments() },
      }],
    });

    selectWeek('2026-05-24');

    expect(getDayTab('Monday')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^Sunday/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^Tuesday/ })).not.toBeInTheDocument();
  });

  it('an incomplete week routes publish through the confirmation sheet; a full week publishes instantly', async () => {
    await renderScheduler({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: singleDayOperatingHours },
      employees: [{ id: '1', name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 1, status: 'active', availability: availableEveryDay }],
      schedules: [{
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        role: 'Manager',
        status: 'draft',
        requirements: grid(1),
        assignments: { 1: emptyAssignments() },
      }],
    });

    selectWeek('2026-05-24');

    // Open shift -> the sheet, with the incomplete role held back.
    fireEvent.click(screen.getByRole('button', { name: 'Publish week' }));
    const sheet = screen.getByRole('dialog');
    expect(sheet).toHaveTextContent('0 of 1 shifts filled');
    expect(within(sheet).getByRole('checkbox', { name: /Manager/ })).not.toBeChecked();
    expect(within(sheet).getByRole('button', { name: 'Publish selected' })).toBeDisabled();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Go back and fix' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Fill it, then publish with no filter -> instant, no sheet, undo toast.
    fireEvent.click(screen.getByRole('button', { name: 'Auto-fill' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish week' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('PUBLISHED')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
  });

  it('the undo toast reverts a just-published week to draft', async () => {
    await renderScheduler({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: singleDayOperatingHours },
      employees: [{ id: '1', name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 1, status: 'active', availability: availableEveryDay }],
      schedules: [{
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        role: 'Manager',
        status: 'draft',
        requirements: grid(1),
        assignments: { 1: { ...emptyAssignments(), Monday: ['Open'] } },
      }],
    });

    selectWeek('2026-05-24');

    fireEvent.click(screen.getByRole('button', { name: 'Publish week' }));
    expect(screen.getByText('PUBLISHED')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(screen.getByText('DRAFT')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('gates the builder behind a readiness checklist until coverage targets exist', async () => {
    await renderScheduler({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: singleDayOperatingHours },
      employees: [{ id: '1', name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay }],
    });

    // Week + hours + team are set, but there are no coverage targets — the
    // checklist takes over the builder body instead of an empty Day builder.
    expect(screen.getByRole('heading', { name: 'Finish setup to build this week' })).toBeInTheDocument();
    expect(screen.getByText('Set coverage targets')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Auto-fill' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^Monday/ })).not.toBeInTheDocument();
  });

  it('candidate panel disables an employee already at the weekly shift cap', async () => {
    await renderScheduler({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: twoDayOperatingHours },
      employees: [{ id: '1', name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 1, status: 'active', availability: availableEveryDay }],
      schedules: [{
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        role: 'Manager',
        status: 'draft',
        requirements: { ...grid(1), Tuesday: { Open: 1 } },
        assignments: { 1: emptyAssignments() },
      }],
    });

    selectWeek('2026-05-24');
    fireEvent.click(getDayTab('Monday'));

    const mondayCard = getShiftCard('Manager');
    openAddPanel(mondayCard);
    fireEvent.click(within(mondayCard).getByRole('button', { name: /Jen Ray/ }));
    expect(within(getShiftCard('Manager')).getByText('1/1')).toBeInTheDocument();

    fireEvent.click(getDayTab('Tuesday'));
    const tuesdayCard = getShiftCard('Manager');
    openAddPanel(tuesdayCard);
    const jenCandidate = within(tuesdayCard).getByRole('button', { name: /Jen Ray/ });

    expect(jenCandidate).toBeDisabled();
    expect(jenCandidate).toHaveTextContent('At weekly shift limit');
  });

  it('keeps assignments made under one role when the role filter switches away and back', async () => {
    await renderScheduler({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: singleDayOperatingHours },
      employees: [
        { id: '1', name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay },
        { id: '2', name: 'Ava Cole', roles: ['Server'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay },
      ],
      schedules: [
        {
          weekLabel: 'May 24 - May 30, 2026', startDate: '2026-05-24', endDate: '2026-05-30', role: 'Manager',
          status: 'draft', requirements: grid(1), assignments: { 1: emptyAssignments() },
        },
        {
          weekLabel: 'May 24 - May 30, 2026', startDate: '2026-05-24', endDate: '2026-05-30', role: 'Server',
          status: 'draft', requirements: grid(1), assignments: { 2: emptyAssignments() },
        },
      ],
    });

    selectWeek('2026-05-24');
    fireEvent.click(getDayTab('Monday'));
    fireEvent.click(screen.getByRole('tab', { name: /^Manager/ }));

    const managerCard = getShiftCard('Manager');
    openAddPanel(managerCard);
    fireEvent.click(within(managerCard).getByRole('button', { name: /Jen Ray/ }));
    expect(within(getShiftCard('Manager')).getByText('1/1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /^Server/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /^Manager/ }));
    expect(within(getShiftCard('Manager')).getByText('1/1')).toBeInTheDocument();
  });

  it('the checklist and "All roles" tab total open slots across every role, not just the active tab', async () => {
    await renderScheduler({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: singleDayOperatingHours },
      employees: [
        { id: '1', name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay },
        { id: '2', name: 'Ava Cole', roles: ['Server'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay },
      ],
      schedules: [
        {
          weekLabel: 'May 24 - May 30, 2026', startDate: '2026-05-24', endDate: '2026-05-30', role: 'Manager',
          status: 'draft', requirements: grid(1), assignments: { 1: emptyAssignments() },
        },
        {
          weekLabel: 'May 24 - May 30, 2026', startDate: '2026-05-24', endDate: '2026-05-30', role: 'Server',
          status: 'draft', requirements: grid(2), assignments: { 2: emptyAssignments() },
        },
      ],
    });

    selectWeek('2026-05-24');

    expect(screen.getByText(/0 of 3 shifts filled — 3 open/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^All roles/ })).toHaveTextContent('3');
  });

  it('the publish sheet pre-checks complete roles and holds back incomplete ones', async () => {
    await renderScheduler({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: singleDayOperatingHours },
      employees: [
        { id: '1', name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay },
        { id: '2', name: 'Ava Cole', roles: ['Server'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay },
      ],
      schedules: [
        {
          weekLabel: 'May 24 - May 30, 2026', startDate: '2026-05-24', endDate: '2026-05-30', role: 'Manager',
          status: 'draft', requirements: grid(1), assignments: { 1: { ...emptyAssignments(), Monday: ['Open'] } },
        },
        {
          weekLabel: 'May 24 - May 30, 2026', startDate: '2026-05-24', endDate: '2026-05-30', role: 'Server',
          status: 'draft', requirements: grid(1), assignments: { 2: emptyAssignments() },
        },
      ],
    });

    selectWeek('2026-05-24');

    expect(screen.getByRole('tab', { name: /^Server/ })).toHaveTextContent('1');
    expect(screen.getByRole('tab', { name: /^Manager/ })).not.toHaveTextContent('1');

    fireEvent.click(screen.getByRole('button', { name: 'Publish week' }));
    const sheet = screen.getByRole('dialog');

    expect(sheet).toHaveTextContent('1 of 2 shifts filled');
    expect(within(sheet).getByRole('checkbox', { name: /Manager/ })).toBeChecked();
    expect(within(sheet).getByRole('checkbox', { name: /Server/ })).not.toBeChecked();
    expect(within(sheet).getByRole('button', { name: 'Publish selected' })).toBeEnabled();

    fireEvent.click(within(sheet).getByRole('button', { name: 'Publish selected' }));

    // Manager published, Server held back as draft -> week status stays draft.
    expect(screen.getByText('DRAFT')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
  });

  it('candidate panel blocks someone already working that day+shift under another role', async () => {
    await renderScheduler({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: singleDayOperatingHours },
      employees: [
        { id: '3', name: 'Kayla Brooks', roles: ['Manager', 'Server'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay },
      ],
      schedules: [
        {
          weekLabel: 'May 24 - May 30, 2026', startDate: '2026-05-24', endDate: '2026-05-30', role: 'Manager',
          status: 'draft', requirements: grid(1), assignments: { 3: { ...emptyAssignments(), Monday: ['Open'] } },
        },
        {
          weekLabel: 'May 24 - May 30, 2026', startDate: '2026-05-24', endDate: '2026-05-30', role: 'Server',
          status: 'draft', requirements: grid(1), assignments: { 3: emptyAssignments() },
        },
      ],
    });

    selectWeek('2026-05-24');
    fireEvent.click(getDayTab('Monday'));
    fireEvent.click(screen.getByRole('tab', { name: /^Server/ }));

    const serverCard = getShiftCard('Server');
    openAddPanel(serverCard);
    const kaylaCandidate = within(serverCard).getByRole('button', { name: /Kayla Brooks/ });

    expect(kaylaCandidate).toBeDisabled();
    expect(kaylaCandidate).toHaveTextContent('Already on another shift');
  });

  it('autosaves an assignment without clicking "Save draft"', async () => {
    await renderScheduler({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: singleDayOperatingHours },
      employees: [{ id: '1', name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay }],
      schedules: [{
        weekLabel: 'May 24 - May 30, 2026',
        startDate: '2026-05-24',
        endDate: '2026-05-30',
        role: 'Manager',
        status: 'draft',
        requirements: grid(1),
        assignments: { 1: emptyAssignments() },
      }],
    });

    selectWeek('2026-05-24');

    vi.useFakeTimers();

    fireEvent.click(getDayTab('Monday'));
    const card = getShiftCard('Manager');
    openAddPanel(card);
    fireEvent.click(within(card).getByRole('button', { name: /Jen Ray/ }));

    // Edit is pending — the passive sync line shows it, no button was clicked.
    expect(screen.getByText(/·\s*Saving…/)).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });

    expect(screen.queryByText(/·\s*Saving…/)).not.toBeInTheDocument();
    expect(screen.getByText(/·\s*Saved/)).toBeInTheDocument();
  });

  it('week overview grid shows three-state coverage and a cell tap drops into the day builder for that role', async () => {
    await renderScheduler({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: twoDayOperatingHours },
      employees: [
        { id: '1', name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 5, status: 'active', availability: availableEveryDay },
        { id: '2', name: 'Sam Fox', roles: ['Server'], shiftsPerWeek: 5, status: 'active', availability: availableEveryDay },
      ],
      schedules: [
        {
          weekLabel: 'May 24 - May 30, 2026', startDate: '2026-05-24', endDate: '2026-05-30', role: 'Manager',
          status: 'draft',
          requirements: { ...grid(0), Monday: { Open: 1 }, Tuesday: { Open: 1 } },
          assignments: { 1: { ...emptyAssignments(), Monday: ['Open'] } },
        },
        {
          weekLabel: 'May 24 - May 30, 2026', startDate: '2026-05-24', endDate: '2026-05-30', role: 'Server',
          status: 'draft',
          requirements: { ...grid(0), Monday: { Open: 2 } },
          assignments: { 2: { ...emptyAssignments(), Monday: ['Open'] } },
        },
      ],
    });

    selectWeek('2026-05-24');
    fireEvent.click(screen.getByRole('tab', { name: 'Week overview' }));

    expect(screen.getByRole('button', { name: /Manager, Monday: 1 of 1 filled — Fully covered/ })).toBeInTheDocument();
    const managerTuesday = screen.getByRole('button', { name: /Manager, Tuesday: 0 of 1 filled — No one assigned/ });
    expect(managerTuesday).toHaveClass('scheduler__overview-cell', 'is-none');
    expect(screen.getByRole('button', { name: /Server, Monday: 1 of 2 filled — Short-staffed/ })).toHaveClass('is-partial');

    fireEvent.click(managerTuesday);

    expect(screen.getByRole('tab', { name: 'Day builder' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /^Manager/ })).toHaveAttribute('aria-selected', 'true');
    expect(getDayTab('Tuesday')).toHaveAttribute('aria-selected', 'true');
    expect(within(getShiftCard('Manager')).getByText('0/1')).toBeInTheDocument();
  });

  it('a single-role overview cell tap opens the candidate panel straight on the shift being fixed', async () => {
    await renderScheduler({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: singleDayOperatingHours },
      employees: [
        { id: '1', name: 'Jen Ray', roles: ['Server'], shiftsPerWeek: 5, status: 'active', availability: availableEveryDay },
        { id: '2', name: 'Sam Fox', roles: ['Server'], shiftsPerWeek: 5, status: 'active', availability: availableEveryDay },
      ],
      schedules: [{
        weekLabel: 'May 24 - May 30, 2026', startDate: '2026-05-24', endDate: '2026-05-30', role: 'Server',
        status: 'draft', requirements: grid(2), assignments: { 1: { ...emptyAssignments(), Monday: ['Open'] } },
      }],
    });

    selectWeek('2026-05-24');
    fireEvent.click(screen.getByRole('tab', { name: /^Server/ }));
    fireEvent.click(screen.getByRole('tab', { name: 'Week overview' }));

    fireEvent.click(screen.getByRole('button', { name: /Open, Monday: 1 of 2 filled — Short-staffed/ }));

    expect(screen.getByRole('tab', { name: 'Day builder' })).toHaveAttribute('aria-selected', 'true');
    const serverCard = getShiftCard('Server');
    expect(within(serverCard).getByLabelText(/Add someone to Server/)).toBeInTheDocument();
    expect(within(serverCard).getByRole('button', { name: /Sam Fox/ })).toBeEnabled();
  });

  it('a fresh week offers "Copy last week" / "Start fresh"; Start fresh dismisses it', async () => {
    await renderScheduler({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: singleDayOperatingHours },
      employees: [{ id: '1', name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 5, status: 'active', availability: availableEveryDay }],
      schedules: [{
        weekLabel: 'May 24 - May 30, 2026', startDate: '2026-05-24', endDate: '2026-05-30', role: 'Manager',
        status: 'published', requirements: grid(1), assignments: { 1: { ...emptyAssignments(), Monday: ['Open'] } },
      }],
    });

    selectWeek('2026-06-07');

    expect(screen.getByRole('button', { name: 'Copy last week' })).toBeInTheDocument();
    // The builder is not shown until a choice is made.
    expect(screen.queryByRole('tab', { name: 'Day builder' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start fresh' }));

    expect(screen.queryByRole('button', { name: 'Copy last week' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Day builder' })).toBeInTheDocument();
  });

  it('"Copy last week" surfaces a stale assignment as a conflict, and "Keep anyway" resolves it', async () => {
    await renderScheduler({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: singleDayOperatingHours },
      employees: [{
        id: '1', name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 5, status: 'active',
        availability: { ...availableEveryDay, Monday: [] }, // now off Mondays
      }],
      schedules: [{
        weekLabel: 'May 24 - May 30, 2026', startDate: '2026-05-24', endDate: '2026-05-30', role: 'Manager',
        status: 'published', requirements: grid(1), assignments: { 1: { ...emptyAssignments(), Monday: ['Open'] } },
      }],
    });

    selectWeek('2026-06-07');
    fireEvent.click(screen.getByRole('button', { name: 'Copy last week' }));

    expect(screen.getByText(/Copied last week · 1 conflict to review/)).toBeInTheDocument();

    fireEvent.click(getDayTab('Monday'));
    const card = getShiftCard('Manager');
    expect(within(card).getByText(/now off Mondays/)).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Replace' })).toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: 'Keep anyway' }));

    expect(screen.getByText('Copied from last week')).toBeInTheDocument();
    expect(screen.queryByText(/conflict to review/)).not.toBeInTheDocument();
  });

  it('the chip menu marks a call-out; the shift then needs coverage and "Find replacement" resolves it', async () => {
    await renderScheduler({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: singleDayOperatingHours },
      employees: [
        { id: '1', name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 5, status: 'active', availability: availableEveryDay },
        { id: '2', name: 'Ada Poe', roles: ['Manager'], shiftsPerWeek: 5, status: 'active', availability: availableEveryDay },
      ],
      schedules: [{
        weekLabel: 'May 24 - May 30, 2026', startDate: '2026-05-24', endDate: '2026-05-30', role: 'Manager',
        status: 'published', requirements: grid(1), assignments: { 1: { ...emptyAssignments(), Monday: ['Open'] } },
      }],
    });

    selectWeek('2026-05-24');
    fireEvent.click(getDayTab('Monday'));

    let card = getShiftCard('Manager');
    expect(within(card).getByText('Jen Ray')).toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: /Actions for Jen Ray/ }));
    fireEvent.click(within(card).getByRole('menuitem', { name: 'Mark called out' }));

    card = getShiftCard('Manager');
    expect(within(card).getByText(/Jen Ray called out — needs coverage/)).toBeInTheDocument();
    expect(within(card).getByText('0/1')).toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: 'Find replacement' }));
    fireEvent.click(within(getShiftCard('Manager')).getByRole('button', { name: /Ada Poe/ }));

    card = getShiftCard('Manager');
    expect(within(card).queryByText(/needs coverage/)).not.toBeInTheDocument();
    expect(within(card).getByText('Ada Poe')).toBeInTheDocument();
    expect(within(card).getByText('1/1')).toBeInTheDocument();
  });

  it('the action-bar stepper walks one week at a time', async () => {
    await renderScheduler({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: singleDayOperatingHours },
      employees: [{ id: '1', name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay }],
      schedules: [{
        weekLabel: 'May 24 - May 30, 2026', startDate: '2026-05-24', endDate: '2026-05-30', role: 'Manager',
        status: 'draft', requirements: grid(1), assignments: { 1: emptyAssignments() },
      }],
    });

    selectWeek('2026-05-24');
    expect(screen.getByRole('button', { name: /Change week — May 24/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    expect(screen.getByRole('button', { name: /Change week — May 31/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(screen.getByRole('button', { name: /Change week — May 17/ })).toBeInTheDocument();
  });

  it('the "Jump to a week" sheet lists weeks with their saved status', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-05-27T12:00:00'));

    await renderScheduler({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: singleDayOperatingHours },
      employees: [{ id: '1', name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay }],
      schedules: [{
        weekLabel: 'May 17 - May 23, 2026', startDate: '2026-05-17', endDate: '2026-05-23', role: 'Manager',
        status: 'published', requirements: grid(1), assignments: { 1: { ...emptyAssignments(), Monday: ['Open'] } },
      }],
    });

    fireEvent.click(screen.getByRole('button', { name: /^Change week/ }));
    const sheet = screen.getByRole('dialog', { name: 'Jump to a week' });

    const lastWeek = within(sheet).getByRole('button', { name: /May 17/ });
    expect(lastWeek).toHaveTextContent('Last week');
    expect(lastWeek).toHaveTextContent('Published');
    expect(within(sheet).getByRole('button', { name: /Change week|May 24|This week/ })).toBeInTheDocument();
  });

  it('first run: picking a week-start day drops onto the current week', async () => {
    await renderView(Scheduler);

    expect(screen.getByText('Which day does your week start?')).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole('group', { name: 'Week starts on' })).getByRole('button', { name: 'Sun' }));

    expect(await screen.findByRole('button', { name: 'Publish week' })).toBeInTheDocument();
    expect(screen.queryByText('Which day does your week start?')).not.toBeInTheDocument();
  });

  it('Manager notes live in the overflow menu, not on the page', async () => {
    await renderScheduler({
      settings: { shiftTypes: ['Open'], weekStartsOn: 'Sunday', operatingHours: singleDayOperatingHours },
      employees: [{ id: '1', name: 'Jen Ray', roles: ['Manager'], shiftsPerWeek: 2, status: 'active', availability: availableEveryDay }],
      schedules: [{
        weekLabel: 'May 24 - May 30, 2026', startDate: '2026-05-24', endDate: '2026-05-30', role: 'Manager',
        status: 'draft', requirements: grid(1), assignments: { 1: emptyAssignments() },
      }],
    });

    selectWeek('2026-05-24');
    expect(screen.queryByPlaceholderText(/Notes for this week/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Manager notes' }));

    expect(screen.getByPlaceholderText(/Notes for this week/)).toBeInTheDocument();
  });
});
