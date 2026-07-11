import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { AppStateProvider } from './state/AppState';

import "@fortawesome/fontawesome-free/css/all.min.css";
import './Assets/BrandTheme.scss';

const root = createRoot(document.getElementById('root'));
root.render(
  <StrictMode>
    <AppStateProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </AppStateProvider>
  </StrictMode>
);