import logo from '../../Assets/ShiftSizzle.Logo.OnDark.png';

import './LoadingScreen.scss';

// Full-screen branded loading state (auth / session / workspace hydration).
// The wordmark sits at the top; the status message sits in the centre; a
// bank of flames rises from the bottom edge.
export const LoadingScreen = ({ message = 'Loading…', detail }) => (
  <div className="loading-screen" role="status" aria-live="polite">
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
      className="loading-screen__flames"
      viewBox="0 0 390 220"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="ls-flame" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#5f1305" />
          <stop offset="0.32" stopColor="#b52a0d" />
          <stop offset="0.62" stopColor="#f2571c" />
          <stop offset="0.85" stopColor="#ff7c33" />
          <stop offset="1" stopColor="#ffb066" />
        </linearGradient>
      </defs>

      {/* back ridge — never a hard edge */}
      <path
        className="loading-screen__flame-layer loading-screen__flame-layer--back"
        fill="url(#ls-flame)"
        d="M0 220 C 26 172 44 184 60 158 C 74 178 88 170 104 176 C 120 158 132 182 150 170 C 168 158 182 184 202 170 C 222 156 236 184 256 170 C 276 156 292 182 312 168 C 330 156 346 180 366 168 C 378 162 386 168 390 164 L390 220 Z"
      />

      {/* mid tongues */}
      <path
        className="loading-screen__flame-layer loading-screen__flame-layer--mid"
        fill="url(#ls-flame)"
        d="M34 220 C 40 168 66 138 70 96 C 76 132 96 140 96 176 C 108 164 112 138 106 120 C 126 150 130 190 116 220 Z"
      />
      <path
        className="loading-screen__flame-layer loading-screen__flame-layer--mid"
        fill="url(#ls-flame)"
        d="M196 220 C 200 176 220 152 226 112 C 234 146 252 152 252 184 C 264 172 266 148 261 132 C 280 158 285 194 272 220 Z"
      />
      <path
        className="loading-screen__flame-layer loading-screen__flame-layer--mid"
        fill="url(#ls-flame)"
        d="M300 220 C 304 182 322 160 327 128 C 333 154 348 160 348 186 C 358 176 360 156 356 142 C 372 164 376 196 366 220 Z"
      />

      {/* front bright cluster (centre-left, like the splash) */}
      <path
        className="loading-screen__flame-layer loading-screen__flame-layer--front"
        fill="url(#ls-flame)"
        d="M92 220 C 84 148 120 104 118 44 C 146 78 162 70 156 26 C 196 74 210 150 190 220 Z"
      />
      <path
        className="loading-screen__flame-layer loading-screen__flame-layer--front"
        fill="url(#ls-flame)"
        d="M150 220 C 150 168 170 142 176 100 C 186 134 204 138 204 178 C 216 164 218 142 213 124 C 232 152 236 188 224 220 Z"
      />
    </svg>
  </div>
);
