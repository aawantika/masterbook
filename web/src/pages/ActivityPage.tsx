import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getActivityLog } from '../api/client';
import { ActivityEntry } from '../api/types';

export function ActivityPage() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getActivityLog()
      .then(setEntries)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="detail-panel">
      <h1>Activity log</h1>
      {loading ? (
        <div className="muted">Loading...</div>
      ) : entries.length === 0 ? (
        <div className="muted">No cooking attempts logged yet — log one from a recipe's detail page.</div>
      ) : (
        <ul className="log-timeline">
          {entries.map((entry) => (
            <li key={entry.id}>
              <div className="log-entry-header">
                <strong>{entry.attemptedAt.slice(0, 10)}</strong>
                <Link to={`/recipes/${entry.recipeId}`} className="activity-recipe-link">
                  {entry.recipeTitle}
                </Link>
                {entry.rating != null && <span>{'★'.repeat(entry.rating)}</span>}
              </div>
              {entry.notes && <div className="log-entry-notes">{entry.notes}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
