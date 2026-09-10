import { FormEvent, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import { createUser, listUsers } from '../api/client';
import { User } from '../api/types';
import { useAuth } from '../auth/AuthContext';

export function AdminUsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [resending, setResending] = useState<number | null>(null);

  const reload = () => {
    setLoading(true);
    listUsers()
      .then(setUsers)
      .finally(() => setLoading(false));
  };

  useEffect(reload, []);

  // Real enforcement is server-side (requireAdmin) -- this is just UX so a
  // non-admin never sees the form flash before being redirected.
  if (user && user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setCreating(true);
    try {
      const created = await createUser(email.trim(), role);
      // The server only creates the Firebase account (no password set) --
      // Admin SDK can generate a reset link but can't email it. The
      // *client* SDK's sendPasswordResetEmail does, via Firebase's own
      // hosted email delivery, no custom email infra needed.
      await sendPasswordResetEmail(auth, created.email);
      setNotice(`Created ${created.email} — a password-setup email was sent to them.`);
      setEmail('');
      setRole('user');
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user.');
    } finally {
      setCreating(false);
    }
  };

  const handleResendReset = async (target: User) => {
    setError(null);
    setNotice(null);
    setResending(target.id);
    try {
      await sendPasswordResetEmail(auth, target.email);
      setNotice(`Password reset email sent to ${target.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email.');
    } finally {
      setResending(null);
    }
  };

  return (
    <div className="detail-panel">
      <h1>Manage users</h1>

      <form onSubmit={handleCreate} className="field-row">
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          <span>Role</span>
          <select value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'user')}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button type="submit" disabled={creating}>
          {creating ? 'Creating...' : 'Add user'}
        </button>
      </form>
      {error && <div className="editor-error">{error}</div>}
      {notice && <div className="editor-notice">{notice}</div>}

      {loading ? (
        <div className="muted">Loading...</div>
      ) : (
        <ul className="epub-source-list">
          {users.map((u) => (
            <li key={u.id} className="epub-source-card">
              <div className="epub-source-title">{u.email}</div>
              <div className="muted epub-source-meta">{u.role}</div>
              <div className="editor-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => handleResendReset(u)}
                  disabled={resending === u.id}
                >
                  {resending === u.id ? 'Sending...' : 'Send password reset'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
