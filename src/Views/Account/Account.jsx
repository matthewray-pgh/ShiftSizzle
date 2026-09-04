import { useEffect, useState } from 'react';

import { Button, ContentPanel, InputField } from '../../Components';
import { useAppState } from '../../state/AppState';
import { useAuth } from '../../state/AuthState';
import { supabase } from '../../lib/supabaseClient';

import './Account.scss';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getUnlinkedProfile = (user) => ({
  firstName: user?.user_metadata?.first_name ?? '',
  lastName: user?.user_metadata?.last_name ?? '',
  phone: user?.user_metadata?.phone ?? '',
});

const getLinkedProfile = (employee) => ({
  contact: employee.contact ?? '',
  email: employee.email ?? '',
});

export const Account = () => {
  const { user, membership, signOut } = useAuth();
  const { state, dispatch } = useAppState();
  const linkedEmployee = state.employees.find((employee) => employee.id === membership?.employeeId);
  const isLinked = Boolean(linkedEmployee);

  const displayName = linkedEmployee?.name
    || [user?.user_metadata?.first_name, user?.user_metadata?.last_name].filter(Boolean).join(' ')
    || user?.email
    || '';
  const avatarUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || '';
  const accountRoleLabel = membership?.accountRole === 'owner'
    ? 'Administrator'
    : membership?.accountRole
      ? membership.accountRole.charAt(0).toUpperCase() + membership.accountRole.slice(1)
      : '';
  const roleLabel = linkedEmployee?.title || accountRoleLabel;
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  const [form, setForm] = useState(() => (isLinked ? getLinkedProfile(linkedEmployee) : getUnlinkedProfile(user)));
  const [saved, setSaved] = useState(form);
  const [error, setError] = useState('');
  const [justSaved, setJustSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Paint the app shell to match the header while this view is mounted.
  useEffect(() => {
    document.body.classList.add('account-view');
    return () => document.body.classList.remove('account-view');
  }, []);

  useEffect(() => {
    const profile = isLinked ? getLinkedProfile(linkedEmployee) : getUnlinkedProfile(user);
    setForm(profile);
    setSaved(profile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isLinked, linkedEmployee?.contact, linkedEmployee?.email]);

  const isDirty = isLinked
    ? form.contact !== saved.contact || form.email !== saved.email
    : form.firstName !== saved.firstName || form.lastName !== saved.lastName || form.phone !== saved.phone;

  const emailValid = !form.email || EMAIL_PATTERN.test(form.email.trim());
  const canSave = isLinked
    ? isDirty && emailValid
    : isDirty && Boolean(form.firstName.trim()) && Boolean(form.lastName.trim());

  const updateForm = (field, value) => {
    setJustSaved(false);
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!canSave) {
      return;
    }

    setError('');
    setSubmitting(true);

    if (isLinked) {
      const nextProfile = { contact: form.contact.trim(), email: form.email.trim() };

      dispatch({ type: 'UPSERT_EMPLOYEE', payload: { ...linkedEmployee, ...nextProfile } });

      setSubmitting(false);
      setForm(nextProfile);
      setSaved(nextProfile);
      setJustSaved(true);
      return;
    }

    const nextProfile = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: form.phone.trim(),
    };

    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        first_name: nextProfile.firstName,
        last_name: nextProfile.lastName,
        phone: nextProfile.phone,
      },
    });

    setSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setForm(nextProfile);
    setSaved(nextProfile);
    setJustSaved(true);
  };

  const handleDiscard = () => {
    setForm(saved);
    setError('');
    setJustSaved(false);
  };

  return (
    <div className="account">
      <div className="account__identity">
        <div className="account__avatar">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" />
          ) : initials ? (
            <span aria-hidden="true">{initials}</span>
          ) : (
            <i className="fas fa-user-circle" aria-hidden="true" />
          )}
        </div>
        <div className="account__identity-copy">
          <span className="account__identity-name">{displayName}</span>
          {roleLabel && <span className="account__identity-role">{roleLabel}</span>}
        </div>
      </div>
      <ContentPanel>
        <form className="account__form" aria-label="Account settings" onSubmit={handleSubmit}>
          <div className="account__group" aria-label="Personal details">
            {error && <p className="account__field-error" role="alert">{error}</p>}
            {isLinked ? (
              <>
                <InputField
                  label="Name"
                  name="name"
                  value={linkedEmployee.name}
                  readOnly
                />
                <p className="account__field-hint">Managed by your manager.</p>
                <InputField
                  label="Phone Number"
                  name="contact"
                  type="tel"
                  value={form.contact}
                  onChange={(value) => updateForm('contact', value)}
                  placeholder="Optional"
                  autoComplete="tel"
                />
                <InputField
                  label="Email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={(value) => updateForm('email', value)}
                  placeholder="Optional"
                  autoComplete="email"
                />
                {!emailValid && <p className="account__field-error" role="alert">Enter a valid email address.</p>}
              </>
            ) : (
              <>
                <InputField
                  label="First Name"
                  name="firstName"
                  value={form.firstName}
                  onChange={(value) => updateForm('firstName', value)}
                  required
                  autoComplete="given-name"
                />
                <InputField
                  label="Last Name"
                  name="lastName"
                  value={form.lastName}
                  onChange={(value) => updateForm('lastName', value)}
                  required
                  autoComplete="family-name"
                />
                <InputField
                  label="Phone Number"
                  name="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(value) => updateForm('phone', value)}
                  placeholder="Optional"
                  autoComplete="tel"
                />
                <p className="account__field-hint">Login email: {user?.email}</p>
              </>
            )}

            <div className="account__save-bar" role="status">
              <div className="account__save-bar-copy">
                {isDirty ? (
                  <span className="account__dirty-indicator">Unsaved</span>
                ) : justSaved ? (
                  <span className="account__saved">Saved</span>
                ) : null}
              </div>
              <div className="account__save-bar-actions">
                <button type="button" className="button-outline" onClick={handleDiscard} disabled={!isDirty}>
                  <span className="account__action-icon" aria-hidden="true">
                    <i className="fas fa-rotate-left" />
                  </span>
                  Discard
                </button>
                <Button type="submit" className="account__save-bar-button" disabled={!canSave || submitting}>
                  <span className="account__action-icon" aria-hidden="true">
                    <i className="fas fa-floppy-disk" />
                  </span>
                  {submitting ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          </div>
        </form>

        <div className="account__session">
          <button type="button" className="account__signout" onClick={signOut}>
            <i className="fas fa-arrow-right-from-bracket" aria-hidden="true" />
            Sign out
          </button>
        </div>
      </ContentPanel>
    </div>
  );
};
