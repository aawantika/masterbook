import { FormEvent, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { getServerVersion, getSiteStatus, setSiteFrozen } from '../api/client';
import { ServerVersion, SiteStatus } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button, ButtonLink } from '../components/Button';

// Hub page linked from the topbar's "Admin" button -- everything
// admin-only lives under here (manage users, stats, and the site
// freeze/unfreeze toggle) instead of scattering separate topbar links for
// each one.
// "2 hours ago" / "3 days ago" -- coarse on purpose, this is answering
// "is the hourly auto-deploy keeping up," not a precise countdown.
function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function AdminPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<SiteStatus | null>(null);
  const [version, setVersion] = useState<ServerVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    setLoading(true);
    getSiteStatus()
      .then(setStatus)
      .finally(() => setLoading(false));
    getServerVersion().then(setVersion);
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

      {version?.commitTime && (
        <p className="muted admin-version-line">
          Server last updated {formatRelativeTime(version.commitTime)} ({new Date(version.commitTime).toLocaleString()})
        </p>
      )}

      <div className="admin-hub-links">
        <ButtonLink to="/admin/users" variant="secondary">
          Manage users
        </ButtonLink>
        <ButtonLink to="/admin/stats" variant="secondary">
          Stats
        </ButtonLink>
        <ButtonLink to="/admin/taxonomy" variant="secondary">
          Meal types &amp; cuisines
        </ButtonLink>
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
            <Button variant="primary" onClick={handleUnfreeze} disabled={saving}>
              {saving ? 'Unfreezing...' : 'Unfreeze site'}
            </Button>
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
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Freezing...' : 'Freeze site'}
          </Button>
        </form>
      )}
      {error && <div className="editor-error">{error}</div>}
    </div>
  );
}
