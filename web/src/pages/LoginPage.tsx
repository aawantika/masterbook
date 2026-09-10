import { FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../auth/AuthContext';

type LocationState = { from?: { pathname: string } };

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetNotice, setResetNotice] = useState<string | null>(null);

  // Already logged in -- redirect away rather than show the form again.
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
      await login(email.trim(), password);
      const from = (location.state as LocationState | null)?.from?.pathname ?? '/';
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
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
          <div className="editor-actions">
            <button type="submit" disabled={submitting}>
              {submitting ? 'Logging in...' : 'Log in'}
            </button>
            <button type="button" className="link-button" onClick={handleForgotPassword}>
              Forgot password?
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
