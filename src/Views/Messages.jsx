
import { 
  ContentPanelHeader,
  ContentPanel 
} from "../Components";

import "./Messages.scss";

export const Messages = () => {
  return (
    <div className="messages">
      <ContentPanelHeader title="Messages" />
      <ContentPanel>
        <p>This is the messages view.</p>
      </ContentPanel>
    </div>
  );
}
