import { LoadingScreen } from './LoadingScreen/LoadingScreen';
import { useAppState } from '../state/AppState';

// Holds the branded loading screen until the org's data has loaded (or
// failed to, which also flips isHydrated so the app can show its empty
// state rather than spin forever). Sits inside ProtectedRoute, so auth is
// already resolved by the time this mounts.
export const HydrationGate = ({ children }) => {
  const { state } = useAppState();

  return state.isHydrated ? children : <LoadingScreen message="Loading your schedule…" />;
};
