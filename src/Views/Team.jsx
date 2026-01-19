import { 
  ContentPanelHeader,
  ContentPanel 
} from "../Components";

import "./Team.scss";

export const Team = () => {
  return (
    <div className="team">
      <ContentPanelHeader title="Team" />
      <ContentPanel>
        <p>This is the team view.</p>
        <p>Manage your team members here.</p>
        <p>This should display a list of team members and their details.</p>
      </ContentPanel>
    </div>
  );
}
