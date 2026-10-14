import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '../../state/AuthState';
import { SignUp } from './SignUp';
import { passwordProblem } from './passwordRules';

vi.mock('../../lib/supabaseClient', async () => {
  const { createFakeSupabaseClient } = await import('../../test/fakeSupabaseClient');
  return { supabase: createFakeSupabaseClient() };
});

const { supabase } = await import('../../lib/supabaseClient');

const renderSignUp = () => render(
  <MemoryRouter>
    <AuthProvider>
      <SignUp />
    </AuthProvider>
  </MemoryRouter>,
);

const fillForm = ({ name = 'Corner Cafe', email = 'owner@example.com', password }) => {
  fireEvent.change(screen.getByLabelText('Business Name'), { target: { value: name } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
};

beforeEach(() => {
  supabase.__setSession(null);
  vi.restoreAllMocks();
});

describe('passwordProblem', () => {
  it('requires eight characters with letters and numbers', () => {
    expect(passwordProblem('abc123')).toMatch(/at least 8/);
    expect(passwordProblem('abcdefgh')).toMatch(/letters and numbers/);
    expect(passwordProblem('12345678')).toMatch(/letters and numbers/);
    expect(passwordProblem('sizzle2026')).toBe('');
  });
});

describe('SignUp', () => {
  it('rejects a weak password before contacting the server', async () => {
    const signUp = vi.spyOn(supabase.auth, 'signUp');
    renderSignUp();

    fillForm({ password: 'short1' });

    expect(await screen.findByText('Password must be at least 8 characters.')).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('keeps the business name on the account and asks the user to confirm their email', async () => {
    const signUp = vi.spyOn(supabase.auth, 'signUp').mockResolvedValue({ data: { session: null, user: null }, error: null });
    renderSignUp();

    fillForm({ password: 'sizzle2026' });

    expect(await screen.findByText(/We sent a confirmation link to owner@example\.com/)).toBeInTheDocument();
    expect(signUp).toHaveBeenCalledWith(expect.objectContaining({
      email: 'owner@example.com',
      options: expect.objectContaining({ data: { pending_org_name: 'Corner Cafe' } }),
    }));
  });

  it('pre-fills the business name after the email is confirmed', async () => {
    supabase.__setSession({ user: { id: 'u1', email: 'owner@example.com', user_metadata: { pending_org_name: 'Corner Cafe' } } });
    renderSignUp();

    await waitFor(() => expect(screen.getByLabelText('Business Name')).toHaveValue('Corner Cafe'));
    expect(screen.getByRole('heading', { name: 'Set up your workspace' })).toBeInTheDocument();
  });
});
