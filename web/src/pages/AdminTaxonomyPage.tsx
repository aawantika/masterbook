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
function TaxonomyTable({ kind, helpText }: { kind: Kind; helpText: string }) {
  const [items, setItems] = useState<TaxonomyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<TaxonomyItem | null>(null);
  // Resets whenever the active tab changes (see the `key` prop in
  // AdminTaxonomyPage below, which remounts this component per tab) --
  // switching tabs with a filter still typed in from the other section
  // would be a confusing stale-looking empty state otherwise.
  const [filter, setFilter] = useState('');

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

  // Client-side, not a server round-trip -- the full list is already
  // loaded (there's no pagination), and this is purely a "find the one
  // entry I'm here for" aid, not a real search feature.
  const filtered = items.filter((item) => item.name.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <div className="admin-taxonomy-section">
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

      {!loading && items.length > 5 && (
        <label className="field admin-taxonomy-filter">
          <span>Filter</span>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Start typing a name..." />
        </label>
      )}

      {loading ? (
        <div className="muted">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="muted">{items.length === 0 ? 'None yet.' : 'No matches.'}</div>
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
              {filtered.map((item) => (
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

const TABS: Array<{ kind: Kind; label: string; helpText: string }> = [
  { kind: 'mealType', label: 'Meal types', helpText: 'What a recipe is, categorically (Breakfast, Dessert, ...).' },
  { kind: 'cuisine', label: 'Cuisines', helpText: 'Where a recipe is from.' }
];

export function AdminTaxonomyPage() {
  const { user } = useAuth();
  // One section visible at a time instead of every table stacked on one
  // long page -- stacking gets harder to keep track of as more sections
  // get added here later, not just as each table's own row count grows.
  const [activeTab, setActiveTab] = useState<Kind>('mealType');

  // Real enforcement is server-side (requireAdmin) -- this is just UX so a
  // non-admin never sees the form flash before being redirected.
  if (user && user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  const active = TABS.find((t) => t.kind === activeTab)!;

  return (
    <div className="detail-panel">
      <h1>Meal types &amp; cuisines</h1>
      <p className="muted">
        Renaming to a name that already exists merges into it -- every recipe tagged with the old name ends up
        tagged with the one you renamed it to. Use this to clean up stray entries parsing introduced (e.g. "Middle
        Eastern-inspired" instead of "Middle Eastern").
      </p>

      <div className="admin-taxonomy-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.kind}
            type="button"
            className={tab.kind === activeTab ? 'active' : ''}
            onClick={() => setActiveTab(tab.kind)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* key forces a remount on tab switch -- each tab's filter/draft/
          error state starts fresh instead of carrying over from the other
          section. */}
      <TaxonomyTable key={active.kind} kind={active.kind} helpText={active.helpText} />
    </div>
  );
}
