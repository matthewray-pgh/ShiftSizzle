import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server.js';

import App from './App';

export function render(url) {
  const appHtml = renderToString(
    <StaticRouter location={url}>
      <App />
    </StaticRouter>
  );
  return { appHtml };
}
