import { FormEvent, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { auth } from '../firebase';

// Reached from the link in Firebase's password-reset email -- requires
// Firebase Console's Authentication > Templates > Password reset >
// "Customize action URL" to point at this page (https://<domain>/reset-password),
// otherwise the email links to Firebase's own default hosted page instead,
// which only has a single password field with no confirmation. Firebase
// appends oobCode (the one-time reset code) as a query param either way.
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const oobCode = searchParams.get('oobCode');

  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [codeError, setCodeError] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!oobCode) {
      setCodeError('This reset link is missing its code -- copy the whole link from the email, or request a new one.');
      setChecking(false);
      return;
    }
    verifyPasswordResetCode(auth, oobCode)
      .then(setEmail)
      .catch((err) => {
        setCodeError(
          err instanceof Error
            ? err.message
            : 'This reset link is invalid or has expired -- request a new one from the login page.'
        );
      })
      .finally(() => setChecking(false));
  }, [oobCode]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      await confirmPasswordReset(auth, oobCode!, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-box">
        <h1>Reset password</h1>
        {checking ? (
          <p className="muted">Checking your reset link...</p>
        ) : codeError ? (
          <>
            <div className="editor-error">{codeError}</div>
            <div className="login-mode-toggle">
              <Link to="/login" className="login-toggle-button">
                Back to login
              </Link>
            </div>
          </>
        ) : done ? (
          <>
            <p className="muted">Your password's been reset. You can log in with it now.</p>
            <div className="login-mode-toggle">
              <Link to="/login" className="login-toggle-button">
                Back to login
              </Link>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <p className="muted">Setting a new password for {email}.</p>
            <label className="field">
              <span>New password</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
            </label>
            <label className="field">
              <span>Confirm new password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </label>
            {error && <div className="editor-error">{error}</div>}
            <button type="submit" className="login-submit" disabled={submitting}>
              {submitting ? 'Saving...' : 'Set new password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
