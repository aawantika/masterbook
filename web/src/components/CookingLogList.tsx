import { useState } from 'react';
import { RecipeAttempt } from '../api/types';

type CookingLogListProps = {
  attempts: RecipeAttempt[];
  onAddAttempt: (attemptedAt: string, rating: number | null, notes: string | null) => Promise<void>;
  onDeleteAttempt: (attemptId: number) => Promise<void>;
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CookingLogList({ attempts, onAddAttempt, onDeleteAttempt }: CookingLogListProps) {
  const [attemptedAt, setAttemptedAt] = useState(todayIsoDate());
  const [rating, setRating] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    setSaving(true);
    try {
      await onAddAttempt(attemptedAt, rating === '' ? null : Number(rating), notes.trim() || null);
      setNotes('');
      setRating('');
      setAttemptedAt(todayIsoDate());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cooking-log">
      <h3>Cooking log</h3>
      <div className="log-attempt-form">
        <input type="date" value={attemptedAt} onChange={(e) => setAttemptedAt(e.target.value)} />
        <select value={rating} onChange={(e) => setRating(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">No rating</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {'★'.repeat(n)}
            </option>
          ))}
        </select>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes / adjustments for next time"
          className="log-notes-input"
        />
        <button type="button" onClick={handleAdd} disabled={saving}>
          Log attempt
        </button>
      </div>

      {attempts.length === 0 ? (
        <div className="muted">No attempts logged yet.</div>
      ) : (
        <ul className="log-timeline">
          {attempts.map((attempt) => (
            <li key={attempt.id}>
              <div className="log-entry-header">
                <strong>{attempt.attemptedAt.slice(0, 10)}</strong>
                {attempt.rating != null && <span>{'★'.repeat(attempt.rating)}</span>}
                <button type="button" className="link-button" onClick={() => onDeleteAttempt(attempt.id)}>
                  Remove
                </button>
              </div>
              {attempt.notes && <div className="log-entry-notes">{attempt.notes}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
