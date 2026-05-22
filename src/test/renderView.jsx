import { render } from '@testing-library/react';

import { AppStateProvider } from '../state/AppState';

export const renderView = (ViewComponent) => {
  window.localStorage.clear();

  return render(
    <AppStateProvider>
      <ViewComponent />
    </AppStateProvider>
  );
};