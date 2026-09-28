import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { getSiteStats } from '../api/client';
import { SiteStats } from '../api/types';
import { useAuth } from '../auth/AuthContext';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export function AdminStatsPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSiteStats()
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load stats.'))
      .finally(() => setLoading(false));
  }, []);

  if (user && user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="detail-panel">
      <h1>Stats</h1>
      {loading ? (
        <div className="muted">Loading...</div>
      ) : error ? (
        <div className="editor-error">{error}</div>
      ) : stats ? (
        <>
          <div className="stats-summary-row">
            <div className="stats-tile">
              <div className="stats-tile-value">{stats.totalRecipes}</div>
              <div className="stats-tile-label">Total recipes</div>
            </div>
            <div className="stats-tile">
              <div className="stats-tile-value">{stats.totalUsers}</div>
              <div className="stats-tile-label">Total users</div>
            </div>
            <div className="stats-tile">
              <div className="stats-tile-value">{formatBytes(stats.storage.totalBytes)}</div>
              <div className="stats-tile-label">Total storage</div>
            </div>
          </div>

          <h2 className="field-section-heading">Storage breakdown</h2>
          <ul className="stats-storage-list">
            <li>
              <span>Database</span>
              <span>{formatBytes(stats.storage.databaseBytes)}</span>
            </li>
            <li>
              <span>Images</span>
              <span>{formatBytes(stats.storage.imagesBytes)}</span>
            </li>
            <li>
              <span>EPUB sources</span>
              <span>{formatBytes(stats.storage.epubSourcesBytes)}</span>
            </li>
          </ul>

          <h2 className="field-section-heading">Recipes by contributor</h2>
          <ul className="stats-storage-list">
            {stats.perUser.map((u) => (
              <li key={u.userId ?? 'unowned'}>
                <span>{u.name}</span>
                <span>{u.recipeCount}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
