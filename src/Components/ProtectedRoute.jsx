import { Navigate, useLocation } from 'react-router-dom';

import { useAuth } from '../state/AuthState';

export const ProtectedRoute = ({ children, allow }) => {
  const { user, membership, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="protected-route__loading">Loading…</div>;
  }

  if (!user) {
    return <Navigate to="/sign-in" replace state={{ from: location }} />;
  }

  if (!membership) {
    return <Navigate to="/sign-up" replace />;
  }

  if (allow && !allow.includes(membership.accountRole)) {
    return <Navigate to="/" replace />;
  }

  return children;
};
