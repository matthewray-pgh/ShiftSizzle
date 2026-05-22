import { ContentPanel } from '../../Components';
import { useAppState } from '../../state/AppState';

import './Messages.scss';

export const Messages = () => {
  const { state, dispatch } = useAppState();

  return (
    <div className="messages">
      <ContentPanel>
        <h2>Team Updates</h2>
        <div className="messages__list">
          {state.messages.map((message) => (
            <article key={message.id} className={`messages__card messages__card--${message.status}`}>
              <div>
                <h3>{message.title}</h3>
                <p>{message.body}</p>
                <small>{new Date(message.createdAt).toLocaleString()}</small>
              </div>
              {message.status === 'unread' && (
                <button type="button" className="messages__action" onClick={() => dispatch({ type: 'MARK_MESSAGE_READ', payload: message.id })}>
                  Mark read
                </button>
              )}
            </article>
          ))}
        </div>
      </ContentPanel>
    </div>
  );
};