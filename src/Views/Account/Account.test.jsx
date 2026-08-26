import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('Account view', () => {
  it('renders blank name fields by default and disables save', async () => {
    await renderView(Account);

    expect(screen.getByText('Update your profile')).toBeInTheDocument();
    expect(screen.getByLabelText('First Name')).toHaveValue('');
    expect(screen.getByLabelText('Last Name')).toHaveValue('');
    expect(screen.getByLabelText('Phone Number')).toHaveValue('');
    expect(screen.getByText('No changes to save')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('requires first and last name before allowing save, and leaves phone optional', async () => {
    await renderView(Account);

    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Jen' } });
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'Ray' } });
    expect(screen.getByRole('button', { name: 'Save changes' })).not.toBeDisabled();
  });

  it('discards unsaved edits', async () => {
    await renderView(Account);

    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Jen' } });
    fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'Ray' } });
    expect(screen.getAllByText('Unsaved changes').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

    expect(screen.getByLabelText('First Name')).toHaveValue('');
    expect(screen.getByLabelText('Last Name')).toHaveValue('');
    expect(screen.getByText('No changes to save')).toBeInTheDocument();
  });
});
