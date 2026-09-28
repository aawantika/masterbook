import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { getSiteStatus, setSiteFrozen } from '../api/client';
import { SiteStatus } from '../api/types';
import { useAuth } from '../auth/AuthContext';

// Hub page linked from the topbar's "Admin" button -- everything
// admin-only lives under here (manage users, stats, and the site
// freeze/unfreeze toggle) instead of scattering separate topbar links for
// each one.
export function AdminPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<SiteStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    setLoading(true);
    getSiteStatus()
      .then(setStatus)
      .finally(() => setLoading(false));
  };

  useEffect(reload, []);

  // Real enforcement is server-side -- this just avoids flashing the page
  // before a non-admin gets redirected.
  if (user && user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  const frozen = !!status?.frozenAt;

  const handleFreeze = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const next = await setSiteFrozen(true, message.trim() || null);
      setStatus(next);
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to freeze the site.');
    } finally {
      setSaving(false);
    }
  };

  const handleUnfreeze = async () => {
    setError(null);
    setSaving(true);
    try {
      const next = await setSiteFrozen(false, null);
      setStatus(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unfreeze the site.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="detail-panel">
      <h1>Admin</h1>

      <div className="admin-hub-links">
        <Link to="/admin/users" className="button-link secondary-link">
          Manage users
        </Link>
        <Link to="/admin/stats" className="button-link secondary-link">
          Stats
        </Link>
      </div>

      <h2 className="field-section-heading">Site freeze</h2>
      <p className="muted">
        While frozen, everyone except admins is blocked from adding, editing, or deleting recipes (and everything
        else that writes data) -- browsing still works for everyone. Use this while you're fixing something and don't
        want new changes landing mid-fix.
      </p>

      {loading ? (
        <div className="muted">Loading...</div>
      ) : frozen ? (
        <div className="editor-notice">
          <div>
            <strong>The site is currently frozen.</strong>
            {status?.frozenMessage && <div>"{status.frozenMessage}"</div>}
            {status?.frozenAt && <div className="muted">Since {status.frozenAt.slice(0, 16).replace('T', ' ')}</div>}
          </div>
          <div className="editor-actions" style={{ marginTop: 10 }}>
            <button type="button" onClick={handleUnfreeze} disabled={saving}>
              {saving ? 'Unfreezing...' : 'Unfreeze site'}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleFreeze} className="field-row">
          <label className="field" style={{ flex: 1 }}>
            <span>Message shown to everyone else (optional)</span>
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. fixing a parsing bug, back in 10 minutes"
            />
          </label>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? 'Freezing...' : 'Freeze site'}
          </button>
        </form>
      )}
      {error && <div className="editor-error">{error}</div>}
    </div>
  );
}
