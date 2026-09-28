import { ReactNode, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { sendEmailVerification } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from './AuthContext';
import { Button } from '../components/Button';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const location = useLocation();

  if (loading) return <div className="muted">Loading...</div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  // A real, Firebase-verified account with a local row (so requireAuth let
  // GET /me through), just not yet approved -- see requireApproved on the
  // server. Shown instead of the app shell rather than letting every API
  // call in the app 403 individually with the same message.
  if (!user.approvedAt) return <PendingApproval email={user.email} onLogout={logout} />;

  return <>{children}</>;
}

// The admin can't approve an account until its email is verified (the
// server checks with Firebase), so the pending screen leads with that step
// while it's still outstanding.
function PendingApproval({ email, onLogout }: { email: string; onLogout: () => Promise<void> }) {
  const [verified, setVerified] = useState(auth.currentUser?.emailVerified ?? false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleRecheck = async () => {
    setBusy(true);
    setMessage(null);
    try {
      // emailVerified is cached on the client until the user is reloaded.
      await auth.currentUser?.reload();
      const nowVerified = auth.currentUser?.emailVerified ?? false;
      setVerified(nowVerified);
      if (!nowVerified) setMessage("Still not verified -- make sure you clicked the link in the email.");
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    if (!auth.currentUser) return;
    setBusy(true);
    setMessage(null);
    try {
      await sendEmailVerification(auth.currentUser);
      setMessage(`Sent another verification email to ${email}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to send verification email.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-box">
        <h1>Almost there</h1>
        {verified ? (
          <p className="muted">
            Your account ({email}) is waiting on admin approval before you can start using masterbook.
          </p>
        ) : (
          <>
            <p className="muted">
              We sent a verification link to {email} (check your spam folder too). Click it to confirm your email,
              then an admin can approve your account.
            </p>
            <div className="editor-actions">
              <Button variant="primary" onClick={handleRecheck} disabled={busy}>
                I've verified my email
              </Button>
              <Button variant="secondary" onClick={handleResend} disabled={busy}>
                Resend email
              </Button>
            </div>
          </>
        )}
        {message && <div className="editor-notice">{message}</div>}
        <button type="button" className="link-button" onClick={onLogout}>
          Log out
        </button>
      </div>
    </div>
  );
}
