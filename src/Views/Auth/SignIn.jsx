import { useState } from 'react';
import { Navigate, useLocation, useNavigate, Link } from 'react-router-dom';

import { Button, InputField } from '../../Components';
import { useAuth } from '../../state/AuthState';
import { supabase } from '../../lib/supabaseClient';
import logo from '../../Assets/ShiftSizzle.Logo.png';

import './Auth.scss';

export const SignIn = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    const redirectTo = location.state?.from?.pathname ?? '/';
    return <Navigate to={redirectTo} replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    setSubmitting(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    navigate(location.state?.from?.pathname ?? '/', { replace: true });
  };

  return (
    <div className="auth-page">
      <div className="auth-page__card">
        <img className="auth-page__logo" src={logo} alt="ShiftSizzle" />
        <div className="auth-page__heading">
          <h2>Sign in</h2>
          <p>Welcome back — sign in to your workspace.</p>
        </div>
        {error && <p className="auth-page__error">{error}</p>}
        <form className="auth-page__form" onSubmit={handleSubmit}>
          <InputField label="Email" name="email" type="email" value={email} onChange={setEmail} required autoComplete="email" />
          <InputField label="Password" name="password" type="password" value={password} onChange={setPassword} required autoComplete="current-password" />
          <Button type="submit" className="auth-page__submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="auth-page__footer-link">
          New here? <Link to="/sign-up">Create a workspace</Link>
        </p>
      </div>
    </div>
  );
};
