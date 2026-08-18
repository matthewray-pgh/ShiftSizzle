import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, InputField } from '../../Components';
import { useAuth } from '../../state/AuthState';
import { supabase } from '../../lib/supabaseClient';
import logo from '../../Assets/ShiftSizzle.Logo.png';

import './Auth.scss';

// Lands here from a Supabase invite email link. The Supabase client's
// default `detectSessionInUrl` already exchanges the link's token for a
// session before this renders, and the invite-acceptance DB trigger already
// flipped the membership to 'active' at invite-send time — so all this
// screen has to do is let the invitee set a password.
export const AcceptInvite = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setError('');
    setSubmitting(true);

    const { error: updateError } = await supabase.auth.updateUser({ password });

    setSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    navigate('/', { replace: true });
  };

  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-page__card">
          <img className="auth-page__logo" src={logo} alt="ShiftSizzle" />
          <p>Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="auth-page">
        <div className="auth-page__card">
          <img className="auth-page__logo" src={logo} alt="ShiftSizzle" />
          <p className="auth-page__error">This invite link is invalid or has expired.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-page__card">
        <img className="auth-page__logo" src={logo} alt="ShiftSizzle" />
        <div className="auth-page__heading">
          <h2>Welcome to the team</h2>
          <p>Set a password to finish joining your workspace.</p>
        </div>
        {error && <p className="auth-page__error">{error}</p>}
        <form className="auth-page__form" onSubmit={handleSubmit}>
          <InputField label="Password" name="password" type="password" value={password} onChange={setPassword} required autoComplete="new-password" minLength={6} />
          <InputField label="Confirm Password" name="confirmPassword" type="password" value={confirmPassword} onChange={setConfirmPassword} required autoComplete="new-password" minLength={6} />
          <Button type="submit" className="auth-page__submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Set password & continue'}
          </Button>
        </form>
      </div>
    </div>
  );
};
