import { 
  ContentPanelHeader,
  ContentPanel 
} from "../Components";

import "./Settings.scss";

export const Settings = () => {
  return (
    <div className="settings">
      <ContentPanelHeader title="Settings" />
      <ContentPanel>
        <p>This is the settings view.</p>
      </ContentPanel>
    </div>
  );
}
