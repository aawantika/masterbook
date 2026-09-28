import { FormEvent, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import { approveUser, createUser, listUsers, updateDisplayName } from '../api/client';
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
  const [approving, setApproving] = useState<number | null>(null);
  const [nameDrafts, setNameDrafts] = useState<Record<number, string>>({});
  const [savingName, setSavingName] = useState<number | null>(null);

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

  const pending = users.filter((u) => !u.approvedAt);
  const approved = users.filter((u) => u.approvedAt);

  const handleApprove = async (target: User) => {
    setError(null);
    setNotice(null);
    setApproving(target.id);
    try {
      await approveUser(target.id);
      setNotice(`Approved ${target.email}.`);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve user.');
    } finally {
      setApproving(null);
    }
  };

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

  const handleSaveName = async (target: User) => {
    setError(null);
    setNotice(null);
    setSavingName(target.id);
    try {
      const draft = (nameDrafts[target.id] ?? target.displayName ?? '').trim();
      await updateDisplayName(target.id, draft || null);
      setNotice(`Updated name for ${target.email}.`);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update name.');
    } finally {
      setSavingName(null);
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
        <button type="submit" className="primary-button" disabled={creating}>
          {creating ? 'Creating...' : 'Add user'}
        </button>
      </form>
      {error && <div className="editor-error">{error}</div>}
      {notice && <div className="editor-notice">{notice}</div>}

      {loading ? (
        <div className="muted">Loading...</div>
      ) : (
        <>
          {pending.length > 0 && (
            <>
              <h2 className="field-section-heading">Pending approval</h2>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Status</th>
                      <th>Joined</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((u) => (
                      <tr key={u.id}>
                        <td>{u.email}</td>
                        <td className="muted">
                          {u.emailVerified
                            ? 'Verified, not yet approved'
                            : "Email not verified -- can't approve yet"}
                        </td>
                        <td className="muted">{u.createdAt.slice(0, 10)}</td>
                        <td>
                          <button
                            type="button"
                            onClick={() => handleApprove(u)}
                            disabled={approving === u.id || !u.emailVerified}
                          >
                            {approving === u.id ? 'Approving...' : 'Approve'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <h2 className="field-section-heading">Users</h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {approved.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <input
                        className="admin-table-name-input"
                        value={nameDrafts[u.id] ?? u.displayName ?? ''}
                        onChange={(e) => setNameDrafts((prev) => ({ ...prev, [u.id]: e.target.value }))}
                        placeholder={u.email.split('@')[0]}
                      />
                      <button
                        type="button"
                        className="secondary admin-table-save-name"
                        onClick={() => handleSaveName(u)}
                        disabled={savingName === u.id}
                      >
                        {savingName === u.id ? 'Saving...' : 'Save'}
                      </button>
                    </td>
                    <td className="muted">{u.email}</td>
                    <td className="muted">{u.role}</td>
                    <td className="muted">{u.createdAt.slice(0, 10)}</td>
                    <td>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => handleResendReset(u)}
                        disabled={resending === u.id}
                      >
                        {resending === u.id ? 'Sending...' : 'Send password reset'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
