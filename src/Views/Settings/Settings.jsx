import { useEffect, useState } from 'react';

import {
  Button,
  ContentPanel,
  InputField,
} from '../../Components';
import { useAppState } from '../../state/AppState';

import './Settings.scss';

export const Settings = () => {
  const { state, dispatch } = useAppState();
  const [form, setForm] = useState(state.settings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm(state.settings);
  }, [state.settings]);

  const handleSave = (event) => {
    event.preventDefault();
    dispatch({ type: 'UPDATE_SETTINGS', payload: form });
    setSaved(true);
  };

  return (
    <div className="settings">
      <ContentPanel>
        <h2>Workspace Settings</h2>
        <form className="settings__form" onSubmit={handleSave}>
          <InputField label="Location Name" name="locationName" value={form.locationName} onChange={(value) => { setSaved(false); setForm((currentForm) => ({ ...currentForm, locationName: value })); }} />
          <InputField label="Current User" name="currentUserName" value={form.currentUserName} onChange={(value) => { setSaved(false); setForm((currentForm) => ({ ...currentForm, currentUserName: value })); }} />
          <InputField label="Scheduler Name" name="schedulerName" value={form.schedulerName} onChange={(value) => { setSaved(false); setForm((currentForm) => ({ ...currentForm, schedulerName: value })); }} />
          <Button type="submit">Save Settings</Button>
          {saved && <p className="settings__saved">Settings saved locally for this device.</p>}
        </form>
      </ContentPanel>
    </div>
  );
};