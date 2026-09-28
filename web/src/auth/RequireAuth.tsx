import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const location = useLocation();

  if (loading) return <div className="muted">Loading...</div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  // A real, Firebase-verified account with a local row (so requireAuth let
  // GET /me through), just not yet approved -- see requireApproved on the
  // server. Shown instead of the app shell rather than letting every API
  // call in the app 403 individually with the same message.
  if (!user.approvedAt) {
    return (
      <div className="login-page">
        <div className="login-box">
          <h1>Almost there</h1>
          <p className="muted">
            Your account ({user.email}) is waiting on admin approval before you can start using masterbook.
          </p>
          <button type="button" className="link-button" onClick={logout}>
            Log out
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
