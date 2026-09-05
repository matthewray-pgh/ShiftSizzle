import logo from '../../Assets/ShiftSizzle.Logo.OnDark.png';

import './LoadingScreen.scss';

// Full-screen branded loading state (auth / session / workspace hydration).
// The wordmark sits at the top; the centre carries the status message.
export const LoadingScreen = ({ message = 'Loading…', detail }) => (
  <div className="loading-screen" role="status" aria-live="polite">
    <svg
      className="loading-screen__flame"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 1.5c1.2 3-.5 5-1.7 6.6-1.3 1.7-2.4 3.5-2.4 5.6a4.1 4.1 0 0 0 8.2 0c0-1.5-.6-2.6-1.5-3.9 2.7.8 3.8 3.3 3.8 5.6A7.4 7.4 0 0 1 4.6 15C4.6 9.3 8.4 6 12 1.5z" />
    </svg>

    <img className="loading-screen__wordmark" src={logo} alt="ShiftSizzle" />

    <div className="loading-screen__body">
      <p className="loading-screen__message">{message}</p>
      {detail ? <p className="loading-screen__detail">{detail}</p> : null}
      <span className="loading-screen__dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </div>

    <svg
      className="loading-screen__waves"
      viewBox="0 0 390 170"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M0 78 C 70 30, 150 120, 255 72 S 390 52, 390 88 L390 170 L0 170 Z" fill="#e85a24" opacity="0.5" />
      <path d="M0 108 C 90 62, 175 142, 285 98 S 390 88, 390 116 L390 170 L0 170 Z" fill="#ff6b35" opacity="0.45" />
      <path d="M0 134 C 100 104, 205 162, 305 126 S 390 122, 390 140 L390 170 L0 170 Z" fill="#ff6b35" opacity="0.85" />
    </svg>
  </div>
);
