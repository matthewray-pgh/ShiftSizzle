import { useState } from 'react';
import { Navigate, useNavigate, Link } from 'react-router-dom';

import { Button, InputField } from '../../Components';
import { useAuth } from '../../state/AuthState';
import { supabase } from '../../lib/supabaseClient';
import logo from '../../Assets/ShiftSizzle.Logo.png';

import './Auth.scss';

export const SignUp = () => {
  const { user, membership, loading, refreshMembership } = useAuth();
  const navigate = useNavigate();
  const [orgName, setOrgName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user && membership) {
    return <Navigate to="/" replace />;
  }

  // Signed in (e.g. landed here via ProtectedRoute after confirming their
  // email) but no organization yet — just need the business name.
  const createOrganization = async (event) => {
    event.preventDefault();
    const trimmedName = orgName.trim();

    if (!trimmedName) {
      setError('Enter a business name.');
      return;
    }

    setError('');
    setSubmitting(true);

    const { error: rpcError } = await supabase.rpc('create_organization', { org_name: trimmedName });

    if (rpcError) {
      setSubmitting(false);
      setError(rpcError.message);
      return;
    }

    await refreshMembership();
    setSubmitting(false);
    navigate('/', { replace: true });
  };

  // Not signed in yet — create the account, then create the organization.
  const createAccount = async (event) => {
    event.preventDefault();
    const trimmedName = orgName.trim();

    if (!trimmedName) {
      setError('Enter a business name.');
      return;
    }

    setError('');
    setSubmitting(true);

    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });

    if (signUpError) {
      setSubmitting(false);
      setError(signUpError.message);
      return;
    }

    if (!data.session) {
      setSubmitting(false);
      setNotice('Check your email to confirm your account, then sign in to finish setting up your workspace.');
      return;
    }

    const { error: rpcError } = await supabase.rpc('create_organization', { org_name: trimmedName });

    if (rpcError) {
      setSubmitting(false);
      setError(rpcError.message);
      return;
    }

    await refreshMembership();
    setSubmitting(false);
    navigate('/', { replace: true });
  };

  if (notice) {
    return (
      <div className="auth-page">
        <div className="auth-page__card">
          <img className="auth-page__logo" src={logo} alt="ShiftSizzle" />
          <p className="auth-page__notice">{notice}</p>
        </div>
      </div>
    );
  }

  const alreadySignedIn = !loading && user && !membership;

  return (
    <div className="auth-page">
      <div className="auth-page__card">
        <img className="auth-page__logo" src={logo} alt="ShiftSizzle" />
        <div className="auth-page__heading">
          <h2>{alreadySignedIn ? 'Set up your workspace' : 'Create your workspace'}</h2>
          <p>{alreadySignedIn ? 'One last step — name your business.' : 'Set up ShiftSizzle for your business.'}</p>
        </div>
        {error && <p className="auth-page__error">{error}</p>}
        <form className="auth-page__form" onSubmit={alreadySignedIn ? createOrganization : createAccount}>
          <InputField label="Business Name" name="orgName" value={orgName} onChange={setOrgName} required />
          {!alreadySignedIn && (
            <>
              <InputField label="Email" name="email" type="email" value={email} onChange={setEmail} required autoComplete="email" />
              <InputField label="Password" name="password" type="password" value={password} onChange={setPassword} required autoComplete="new-password" minLength={6} />
            </>
          )}
          <Button type="submit" className="auth-page__submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create workspace'}
          </Button>
        </form>
        {!alreadySignedIn && (
          <p className="auth-page__footer-link">
            Already have a workspace? <Link to="/sign-in">Sign in</Link>
          </p>
        )}
      </div>
    </div>
  );
};
