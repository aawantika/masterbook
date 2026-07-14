import { useEffect, useMemo, useState } from 'react';
import { searchRecipes } from '../api/client';
import { RecipeSummary } from '../api/types';

type SidebarProps = {
  selectedRecipeId: number | null;
  onSelectRecipe: (id: number) => void;
  reloadSignal: number;
};

type GroupMode = 'source' | 'cuisine';

const SOURCE_LABELS: Record<string, string> = {
  epub: 'EPUB',
  instagram: 'Instagram',
  website: 'Website',
  manual: 'Manual'
};

type Group = { label: string; recipes: RecipeSummary[] };

function groupBySource(recipes: RecipeSummary[]): Group[] {
  const bookGroups = new Map<string, RecipeSummary[]>();
  const flatGroups = new Map<string, RecipeSummary[]>();

  for (const recipe of recipes) {
    if (recipe.sourceType === 'epub' && recipe.sourceRef) {
      const list = bookGroups.get(recipe.sourceRef) ?? [];
      list.push(recipe);
      bookGroups.set(recipe.sourceRef, list);
    } else {
      const label = SOURCE_LABELS[recipe.sourceType] ?? recipe.sourceType;
      const list = flatGroups.get(label) ?? [];
      list.push(recipe);
      flatGroups.set(label, list);
    }
  }

  const groups: Group[] = [];
  if (bookGroups.size > 0) {
    for (const [book, list] of Array.from(bookGroups.entries()).sort(([a], [b]) => a.localeCompare(b))) {
      groups.push({ label: `EPUB — ${book}`, recipes: list });
    }
  }
  for (const label of ['Instagram', 'Website', 'Manual']) {
    const list = flatGroups.get(label);
    if (list) groups.push({ label, recipes: list });
  }
  return groups;
}

function groupByCuisine(recipes: RecipeSummary[]): Group[] {
  const groups = new Map<string, RecipeSummary[]>();
  for (const recipe of recipes) {
    const cuisines = recipe.cuisines.length > 0 ? recipe.cuisines : ['Uncategorized'];
    for (const cuisine of cuisines) {
      const list = groups.get(cuisine) ?? [];
      list.push(recipe);
      groups.set(cuisine, list);
    }
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => (a === 'Uncategorized' ? 1 : b === 'Uncategorized' ? -1 : a.localeCompare(b)))
    .map(([label, list]) => ({ label, recipes: list }));
}

export function Sidebar({ selectedRecipeId, onSelectRecipe, reloadSignal }: SidebarProps) {
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [groupMode, setGroupMode] = useState<GroupMode>('source');

  useEffect(() => {
    searchRecipes({}).then(setRecipes);
  }, [reloadSignal]);

  const groups = useMemo(
    () => (groupMode === 'source' ? groupBySource(recipes) : groupByCuisine(recipes)),
    [recipes, groupMode]
  );

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Recipes</h2>
        <div className="sidebar-group-toggle">
          <button
            type="button"
            className={groupMode === 'source' ? 'active' : ''}
            onClick={() => setGroupMode('source')}
          >
            By source
          </button>
          <button
            type="button"
            className={groupMode === 'cuisine' ? 'active' : ''}
            onClick={() => setGroupMode('cuisine')}
          >
            By cuisine
          </button>
        </div>
      </div>

      {recipes.length === 0 ? (
        <div className="sidebar-empty muted">No recipes yet.</div>
      ) : (
        <div className="sidebar-tree">
          {groups.map((group) => (
            <details key={group.label} open>
              <summary>
                {group.label} <span className="sidebar-count">({group.recipes.length})</span>
              </summary>
              <ul>
                {group.recipes.map((recipe) => (
                  <li key={recipe.id}>
                    <button
                      type="button"
                      className={`sidebar-recipe-link${recipe.id === selectedRecipeId ? ' active' : ''}`}
                      onClick={() => onSelectRecipe(recipe.id)}
                    >
                      {recipe.wantToTryAt ? '★ ' : ''}
                      {recipe.title}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
