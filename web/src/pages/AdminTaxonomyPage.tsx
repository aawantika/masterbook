import { FormEvent, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  createCuisine,
  createMealType,
  deleteCuisine,
  deleteMealType,
  getCuisinesAdmin,
  getMealTypesAdmin,
  renameCuisine,
  renameMealType
} from '../api/client';
import { TaxonomyItem } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';

type Kind = 'mealType' | 'cuisine';

// One table component reused for both meal types and cuisines -- identical
// shape (name, recipe count, rename-which-merges-if-the-name-already-exists,
// delete-only-if-unused), just pointed at different API functions.
function TaxonomyTable({
  kind,
  title,
  helpText
}: {
  kind: Kind;
  title: string;
  helpText: string;
}) {
  const [items, setItems] = useState<TaxonomyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<TaxonomyItem | null>(null);

  const list = kind === 'mealType' ? getMealTypesAdmin : getCuisinesAdmin;
  const create = kind === 'mealType' ? createMealType : createCuisine;
  const rename = kind === 'mealType' ? renameMealType : renameCuisine;
  const remove = kind === 'mealType' ? deleteMealType : deleteCuisine;

  const reload = () => {
    setLoading(true);
    list()
      .then(setItems)
      .finally(() => setLoading(false));
  };

  useEffect(reload, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    setError(null);
    setCreating(true);
    try {
      setItems(await create(trimmed));
      setNewName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create.');
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (item: TaxonomyItem) => {
    const trimmed = (drafts[item.id] ?? item.name).trim();
    if (!trimmed || trimmed === item.name) return;
    setError(null);
    setSaving(item.id);
    try {
      setItems(await rename(item.id, trimmed));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename.');
    } finally {
      setSaving(null);
    }
  };

  const confirmDelete = async () => {
    if (!confirmingDelete) return;
    const item = confirmingDelete;
    setConfirmingDelete(null);
    setError(null);
    try {
      setItems(await remove(item.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete.');
    }
  };

  return (
    <div className="admin-taxonomy-section">
      <h2 className="field-section-heading">{title}</h2>
      <p className="muted">{helpText}</p>

      <form onSubmit={handleCreate} className="field-row">
        <label className="field">
          <span>Add new</span>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Filipino" />
        </label>
        <Button type="submit" variant="secondary" disabled={creating || !newName.trim()}>
          {creating ? 'Adding...' : 'Add'}
        </Button>
      </form>

      {loading ? (
        <div className="muted">Loading...</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Recipes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <input
                      className="admin-table-name-input"
                      value={drafts[item.id] ?? item.name}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    />
                    {(drafts[item.id] ?? item.name) !== item.name && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="admin-table-save-name"
                        onClick={() => handleRename(item)}
                        disabled={saving === item.id}
                      >
                        {saving === item.id ? 'Saving...' : 'Save'}
                      </Button>
                    )}
                  </td>
                  <td className="muted">{item.recipeCount}</td>
                  <td>
                    <button
                      type="button"
                      className="link-button danger"
                      onClick={() => setConfirmingDelete(item)}
                      disabled={item.recipeCount > 0}
                      title={item.recipeCount > 0 ? 'Still used by recipes -- rename it into another entry first' : undefined}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && <div className="editor-error">{error}</div>}

      {confirmingDelete && (
        <ConfirmDialog
          title={`Delete "${confirmingDelete.name}"?`}
          message="This can't be undone."
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setConfirmingDelete(null)}
        />
      )}
    </div>
  );
}

export function AdminTaxonomyPage() {
  const { user } = useAuth();

  // Real enforcement is server-side (requireAdmin) -- this is just UX so a
  // non-admin never sees the form flash before being redirected.
  if (user && user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="detail-panel">
      <h1>Meal types &amp; cuisines</h1>
      <p className="muted">
        Renaming to a name that already exists merges into it -- every recipe tagged with the old name ends up
        tagged with the one you renamed it to. Use this to clean up stray entries parsing introduced (e.g. "Middle
        Eastern-inspired" instead of "Middle Eastern").
      </p>

      <TaxonomyTable kind="mealType" title="Meal types" helpText="What a recipe is, categorically (Breakfast, Dessert, ...)." />
      <TaxonomyTable kind="cuisine" title="Cuisines" helpText="Where a recipe is from." />
    </div>
  );
}
