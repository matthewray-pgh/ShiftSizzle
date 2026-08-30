import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderView } from '../../test/renderView';
import { Account } from './Account';

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

afterEach(() => {
  vi.useRealTimers();
});

describe('Account view (not linked to a roster employee)', () => {
  it('renders blank name fields by default and disables save', async () => {
    await renderView(Account, { employeeId: null });

    expect(screen.getByText('Update your profile')).toBeInTheDocument();
    expect(screen.getByLabelText('First Name')).toHaveValue('');
    expect(screen.getByLabelText('Last Name')).toHaveValue('');
    expect(screen.getByLabelText('Phone Number')).toHaveValue('');
    expect(screen.getByText('No changes to save')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('requires first and last name before allowing save, and leaves phone optional', async () => {
    await renderView(Account, { employeeId: null });

    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Jen' } });
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'Ray' } });
    expect(screen.getByRole('button', { name: 'Save changes' })).not.toBeDisabled();
  });

  it('discards unsaved edits', async () => {
    await renderView(Account, { employeeId: null });

    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Jen' } });
    fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'Ray' } });
    expect(screen.getAllByText('Unsaved changes').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

    expect(screen.getByLabelText('First Name')).toHaveValue('');
    expect(screen.getByLabelText('Last Name')).toHaveValue('');
    expect(screen.getByText('No changes to save')).toBeInTheDocument();
  });
});

describe('Account view (linked to a roster employee)', () => {
  it('shows the roster name read-only and pre-fills contact/email from the linked employee', async () => {
    await renderView(Account);

    expect(screen.getByLabelText('Name')).toHaveValue('Jen Ray');
    expect(screen.getByLabelText('Name')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Phone Number')).toHaveValue('(555) 010-1001');
    expect(screen.getByLabelText('Email')).toHaveValue('jen@shiftsizzle.app');
    expect(screen.getByText(/Linked to your roster profile/)).toBeInTheDocument();
    expect(screen.getByText(/General Manager/)).toBeInTheDocument();
  });

  it('saves phone/email edits to the linked employee record', async () => {
    await renderView(Account);

    // Fake timers only after the initial hydration above has settled (real
    // timers), same pattern as AppState.test.jsx's autosave test — mixing
    // fake timers in before that resolves would hang renderView's polling.
    vi.useFakeTimers();

    fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '(555) 999-0000' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jen.new@shiftsizzle.app' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(screen.getByText('All changes saved')).toBeInTheDocument();

    // Async variant: the debounced sync effect's setTimeout callback calls
    // upsertEmployeeRow, which itself awaits the fake client's upsert — a
    // plain advanceTimersByTime wouldn't flush that inner microtask.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    const employeeRow = supabase.__tables.employees.find((row) => row.id === '1');
    expect(employeeRow.contact).toBe('(555) 999-0000');
    expect(employeeRow.email).toBe('jen.new@shiftsizzle.app');
  });

  it('rejects an invalid email and discards reverts to the saved values', async () => {
    await renderView(Account);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } });
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.getByLabelText('Email')).toHaveValue('jen@shiftsizzle.app');
  });
});
