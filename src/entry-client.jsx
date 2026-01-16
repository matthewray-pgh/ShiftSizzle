import React, { StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

import "@fortawesome/fontawesome-free/css/all.min.css";

hydrateRoot(
  document.getElementById('root'),
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
