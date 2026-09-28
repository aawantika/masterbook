import { FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../auth/AuthContext';

type LocationState = { from?: { pathname: string } };
type Mode = 'login' | 'signup';

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetNotice, setResetNotice] = useState<string | null>(null);

  // Already logged in -- redirect away rather than show the form again.
  // A freshly-signed-up-but-not-yet-approved account lands here too (still
  // "logged in" as far as Firebase/AuthContext are concerned) -- RequireAuth
  // is what shows the actual pending-approval screen once it redirects in.
  if (!loading && user) {
    const from = (location.state as LocationState | null)?.from?.pathname ?? '/';
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResetNotice(null);
    setSubmitting(true);
    try {
      if (mode === 'signup') {
        // Real self-service Firebase signup -- distinct from the admin's
        // createUser() (server-side, Admin SDK, no password set). This
        // account exists and can sign in immediately, but the server's
        // requireApproved leaves it pending until an admin approves it
        // (see RequireAuth's pending-approval screen). The verification
        // email proves they own the address they typed -- the server
        // refuses to approve an unverified account.
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await sendEmailVerification(credential.user);
      } else {
        await login(email.trim(), password);
      }
      const from = (location.state as LocationState | null)?.from?.pathname ?? '/';
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : mode === 'signup' ? 'Sign up failed.' : 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('Enter your email above first, then click "Forgot password."');
      return;
    }
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setResetNotice(`Password reset email sent to ${email.trim()} — check your inbox.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email.');
    }
  };

  return (
    <div className="login-page">
      <div className="login-box">
        <h1>Masterbook</h1>
        <form onSubmit={handleSubmit}>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <div className="editor-error">{error}</div>}
          {resetNotice && <div className="editor-notice">{resetNotice}</div>}
          {mode === 'signup' && (
            <div className="editor-notice">
              After signing up, we'll email you a verification link — check your spam/junk folder if it doesn't show
              up in a minute or two. Once you've verified, an admin needs to approve your account before you can
              start using masterbook.
            </div>
          )}
          <button type="submit" className="login-submit" disabled={submitting}>
            {submitting ? (mode === 'signup' ? 'Signing up...' : 'Logging in...') : mode === 'signup' ? 'Sign up' : 'Log in'}
          </button>
        </form>
        <div className="login-mode-toggle">
          {mode === 'login' ? (
            <button
              type="button"
              className="login-toggle-button"
              onClick={() => {
                setMode('signup');
                setError(null);
                setResetNotice(null);
              }}
            >
              Need an account? Sign up
            </button>
          ) : (
            <button
              type="button"
              className="login-toggle-button"
              onClick={() => {
                setMode('login');
                setError(null);
                setResetNotice(null);
              }}
            >
              Already have an account? Log in
            </button>
          )}
        </div>
        {/* Tucked away below the main actions, deliberately -- easy to reach
            if you actually need it, hard to fat-finger by accident right
            next to the primary Log in button the way it used to sit. */}
        {mode === 'login' && (
          <div className="login-forgot-password">
            <button type="button" className="link-button" onClick={handleForgotPassword}>
              Forgot password?
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
