import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AppStateProvider } from '../../state/AppState';
import { renderView } from '../../test/renderView';
import { Team } from './Team';

const STORAGE_KEY = 'shiftsizzle.app-state.v1';

describe('Team view', () => {
  it('renders the team page', () => {
    renderView(Team);

    expect(screen.getByText('Add Employee')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search employees')).toBeInTheDocument();
  });

  it('can archive and reactivate a team member', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderView(Team);

    fireEvent.click(screen.getAllByText('Archive')[0]);
    fireEvent.click(screen.getByRole('button', { name: /Archived/ }));

    expect(screen.getByText('Reactivate')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Reactivate'));

    expect(screen.queryByText('Reactivate')).not.toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it('does not archive a team member when confirmation is cancelled', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderView(Team);

    fireEvent.click(screen.getAllByText('Archive')[0]);
    fireEvent.click(screen.getByRole('button', { name: /Archived/ }));

    expect(screen.queryByText('Reactivate')).not.toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it('filters team members by role', () => {
    renderView(Team);

    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'Bartender' } });

    expect(screen.getByText('Kayla Brooks')).toBeInTheDocument();
    expect(screen.queryByText('Jen Ray')).not.toBeInTheDocument();
  });

  it('shows counts in the status control', () => {
    renderView(Team);

    expect(screen.getByRole('button', { name: /Active 7/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Archived 0/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /All 7/ })).toBeInTheDocument();
  });

  it('shows shifts per week in both card and list roster views', () => {
    renderView(Team);

    const jenCard = screen.getByText('Jen Ray').closest('.team__member-panel');

    expect(jenCard).not.toBeNull();
    expect(within(jenCard).getByText('5 shifts/week')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'List view' }));

    const jenRow = screen.getByText('Jen Ray').closest('tr');

    expect(screen.getByText('Shifts / Week')).toBeInTheDocument();
    expect(jenRow).not.toBeNull();
    expect(within(jenRow).getByText('5 shifts/week')).toBeInTheDocument();
  });

  it('persists day-specific availability updates when editing a team member', () => {
    renderView(Team);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Jen Ray' }));
    fireEvent.click(screen.getByRole('tab', { name: /Availability/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Sunday Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sunday Mid' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sunday Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Update Employee' }));

    const jenCard = screen.getByText('Jen Ray').closest('.team__member-panel');

    expect(jenCard).not.toBeNull();
    expect(within(jenCard).getByText(/Availability: Open, Mid, Close \(Mon, Tue, Wed, Thu, Fri, Sat\)/)).toBeInTheDocument();
  });

  it('switches between details and availability tabs in the editor', () => {
    renderView(Team);

    fireEvent.click(screen.getByText('Add Employee'));

    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Name')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Availability/ }));

    expect(screen.getByRole('tab', { name: /Availability/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Sunday Open' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('shows a compact availability summary on the details tab', () => {
    renderView(Team);

    fireEvent.click(screen.getByText('Add Employee'));

    const availabilitySummary = screen.getByLabelText('Availability summary');

    expect(screen.getByText('Availability snapshot')).toBeInTheDocument();
    expect(screen.getByText('21 shifts selected')).toBeInTheDocument();
    expect(within(availabilitySummary).getByText(/Open, Mid, Close \(Sun, Mon, Tue, Wed, Thu, Fri, Sat\)/)).toBeInTheDocument();
  });

  it('applies availability quick actions from the availability tab', () => {
    renderView(Team);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Jen Ray' }));
    fireEvent.click(screen.getByRole('tab', { name: /Availability/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear week' }));
    fireEvent.click(screen.getByRole('button', { name: 'Update Employee' }));

    const jenCard = screen.getByText('Jen Ray').closest('.team__member-panel');

    expect(jenCard).not.toBeNull();
    expect(within(jenCard).getByText('Availability: Unavailable all week')).toBeInTheDocument();
  });

  it('selects every shift in the availability tab with the select all quick action', () => {
    renderView(Team);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Jen Ray' }));
    fireEvent.click(screen.getByRole('tab', { name: /Availability/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear week' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Update Employee' }));

    const jenCard = screen.getByText('Jen Ray').closest('.team__member-panel');

    expect(jenCard).not.toBeNull();
    expect(within(jenCard).getByText(/Availability: Open, Mid, Close \(Sun, Mon, Tue, Wed, Thu, Fri, Sat\)/)).toBeInTheDocument();
  });

  it('shows an empty state when filters exclude all employees', () => {
    renderView(Team);

    fireEvent.change(screen.getByPlaceholderText('Search employees'), { target: { value: 'zzzz-no-match' } });

    expect(screen.getByText('No team members match these filters.')).toBeInTheDocument();
  });

  it('shows a first-run empty state before any employees have been added', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ employees: [] }));

    render(
      <AppStateProvider>
        <Team />
      </AppStateProvider>
    );

    expect(screen.getByText('Add your first employee to build the team roster.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add first employee' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import roster' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download blank template' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Search employees')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Role')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Filter by status' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Team view mode' })).not.toBeInTheDocument();
    expect(screen.queryByText('No team members match these filters.')).not.toBeInTheDocument();
  });

  it('filters as you type without needing to submit', () => {
    renderView(Team);

    fireEvent.change(screen.getByPlaceholderText('Search employees'), { target: { value: 'Jen Ray' } });

    expect(screen.getByText('Jen Ray')).toBeInTheDocument();
    expect(screen.queryByText('Ryan Sutton')).not.toBeInTheDocument();
  });

  it('shows inline validation errors on blur', () => {
    renderView(Team);

    fireEvent.click(screen.getByText('Add Employee'));
    fireEvent.blur(screen.getByLabelText('Name'));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } });
    fireEvent.blur(screen.getByLabelText('Email'));

    expect(screen.getByText('Name is required.')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
  });

  it('saves shifts per week when creating a team member', () => {
    renderView(Team);

    fireEvent.click(screen.getAllByText('Add Employee')[0]);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Taylor Lee' } });
    fireEvent.change(screen.getByLabelText('Shifts Per Week'), { target: { value: '3' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Employee' })[1]);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Taylor Lee' }));

    expect(screen.getByLabelText('Shifts Per Week')).toHaveValue(3);
  });

  it('toggles between card and list views', () => {
    renderView(Team);

    fireEvent.click(screen.getByRole('button', { name: 'List view' }));

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Availability')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Card view' }));

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getAllByText('Archive').length).toBeGreaterThan(0);
  });

  it('uses card view only on mobile and hides the toggle control', () => {
    window.innerWidth = 768;
    window.dispatchEvent(new Event('resize'));

    renderView(Team);

    expect(screen.queryByRole('group', { name: 'Team view mode' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Jen Ray' })).toHaveClass('team__edit-link--card');

    window.innerWidth = 1024;
    window.dispatchEvent(new Event('resize'));
  });

  it('shows a roster data menu with export and import actions', () => {
    renderView(Team);

    expect(screen.queryByRole('button', { name: 'Export roster' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Import roster' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Roster data' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Roster data' }));

    expect(screen.getByRole('menu', { name: 'Roster data menu' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Export roster' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Import roster' })).toBeInTheDocument();
  });

  it('imports a roster csv from the modal workflow', async () => {
    renderView(Team);

    fireEvent.click(screen.getByRole('button', { name: 'Roster data' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Import roster' }));

    expect(screen.getByRole('heading', { name: 'Import roster' })).toBeInTheDocument();

    const rosterFile = new File([
      [
        'name,title,role,contact,email,status',
        'Taylor Lee,Lead Server,Server,(555) 010-2001,taylor@shiftsizzle.app,active',
      ].join('\n'),
    ], 'roster.csv', { type: 'text/csv' });

    fireEvent.change(screen.getByLabelText('Roster CSV file'), {
      target: { files: [rosterFile] },
    });

    expect(await screen.findByText('Loaded roster.csv')).toBeInTheDocument();
    expect(screen.getByText('1 new')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import 1 roster row' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Import 1 roster row' }));

    expect(screen.getByText('Taylor Lee')).toBeInTheDocument();

    window.innerWidth = 1024;
    window.dispatchEvent(new Event('resize'));
  });

  it('downloads a blank roster template csv from the onboarding empty state', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ employees: [] }));

    const createObjectUrlSpy = vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:template');
    const revokeObjectUrlSpy = vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => {});
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement');
    const clickSpy = vi.fn();

    createElementSpy.mockImplementation((tagName) => {
      if (tagName === 'a') {
        return {
          click: clickSpy,
          set href(value) {
            this._href = value;
          },
          get href() {
            return this._href;
          },
          set download(value) {
            this._download = value;
          },
          get download() {
            return this._download;
          },
        };
      }

        return originalCreateElement(tagName);
    });

    render(
      <AppStateProvider>
        <Team />
      </AppStateProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Download blank template' }));

    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:template');

    createElementSpy.mockRestore();
    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
  });

  it('downloads the blank template from inside the import modal', () => {
    const createObjectUrlSpy = vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:template-modal');
    const revokeObjectUrlSpy = vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => {});
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement');
    const clickSpy = vi.fn();

    createElementSpy.mockImplementation((tagName) => {
      if (tagName === 'a') {
        return {
          click: clickSpy,
          set href(value) {
            this._href = value;
          },
          get href() {
            return this._href;
          },
          set download(value) {
            this._download = value;
          },
          get download() {
            return this._download;
          },
        };
      }

      return originalCreateElement(tagName);
    });

    renderView(Team);

    fireEvent.click(screen.getByRole('button', { name: 'Roster data' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Import roster' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download template' }));

    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:template-modal');

    createElementSpy.mockRestore();
    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
  });
});