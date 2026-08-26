import { useEffect, useState } from 'react';

import { Button, ContentPanel, InputField } from '../../Components';
import { useAuth } from '../../state/AuthState';
import { supabase } from '../../lib/supabaseClient';

import './Account.scss';

const getProfileFromUser = (user) => ({
  firstName: user?.user_metadata?.first_name ?? '',
  lastName: user?.user_metadata?.last_name ?? '',
  phone: user?.user_metadata?.phone ?? '',
});

export const Account = () => {
  const { user, signOut } = useAuth();
  const [form, setForm] = useState(getProfileFromUser(user));
  const [saved, setSaved] = useState(getProfileFromUser(user));
  const [error, setError] = useState('');
  const [justSaved, setJustSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const profile = getProfileFromUser(user);
    setForm(profile);
    setSaved(profile);
  }, [user]);

  const isDirty = form.firstName !== saved.firstName || form.lastName !== saved.lastName || form.phone !== saved.phone;
  const canSave = isDirty && Boolean(form.firstName.trim()) && Boolean(form.lastName.trim());

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
      <ContentPanel>
        <div className="account__page-header">
          <div className="account__page-copy">
            <span className="account__page-eyebrow">My account</span>
            <h2>Update your profile</h2>
            <p>This is personal to your login — it isn&apos;t shared with the rest of your team.</p>
          </div>
        </div>
        <form className="account__form" aria-label="Account settings" onSubmit={handleSubmit}>
          <div className="account__group" aria-label="Personal details">
            <div className="account__group-copy">
              <div className="account__group-heading">
                <h3>Personal Details</h3>
                {isDirty && <span className="account__dirty-indicator">Unsaved changes</span>}
              </div>
              <p>Your name and contact number.</p>
            </div>
            {error && <p className="account__field-error" role="alert">{error}</p>}
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
          </div>

          <div className="account__save-bar" role="status">
            <div className="account__save-bar-copy">
              {isDirty ? (
                <span className="account__dirty-indicator">Unsaved changes</span>
              ) : justSaved ? (
                <span className="account__saved">All changes saved</span>
              ) : (
                <span className="account__save-bar-hint">No changes to save</span>
              )}
            </div>
            <div className="account__save-bar-actions">
              <button type="button" className="button-outline" onClick={handleDiscard} disabled={!isDirty}>
                Discard changes
              </button>
              <Button type="submit" className="account__save-bar-button" disabled={!canSave || submitting}>
                <span className="account__action-icon" aria-hidden="true">
                  <i className="fas fa-floppy-disk" />
                </span>
                {submitting ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
        </form>

        <div className="account__group account__group--session" aria-label="Session">
          <div className="account__group-copy">
            <h3>Session</h3>
            <p>Sign out of ShiftSizzle on this device.</p>
          </div>
          <button type="button" className="button-outline account__signout-button" onClick={signOut}>
            <span className="account__action-icon" aria-hidden="true">
              <i className="fas fa-arrow-right-from-bracket" />
            </span>
            Sign Out
          </button>
        </div>
      </ContentPanel>
    </div>
  );
};
