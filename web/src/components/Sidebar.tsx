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

// Groups by the specific publication (site, cookbook, Instagram handle) via
// sourceName, e.g. every thewoksoflife.com recipe collapses under one
// "thewoksoflife.com" entry — not just a generic "Website" bucket. Recipes
// without a sourceName set (older entries, or ones the user didn't bother
// naming) fall back to the generic per-source-type label.
function groupBySource(recipes: RecipeSummary[]): Group[] {
  const named = new Map<string, RecipeSummary[]>();
  const unnamed = new Map<string, RecipeSummary[]>();

  for (const recipe of recipes) {
    const sourceName = recipe.sourceName?.trim();
    if (sourceName) {
      const list = named.get(sourceName) ?? [];
      list.push(recipe);
      named.set(sourceName, list);
    } else {
      const label = SOURCE_LABELS[recipe.sourceType] ?? recipe.sourceType;
      const list = unnamed.get(label) ?? [];
      list.push(recipe);
      unnamed.set(label, list);
    }
  }

  const groups: Group[] = Array.from(named.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, list]) => ({ label, recipes: list }));

  for (const label of ['EPUB', 'Instagram', 'Website', 'Manual']) {
    const list = unnamed.get(label);
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

function RecipeLinkList({
  recipes,
  selectedRecipeId,
  onSelectRecipe
}: {
  recipes: RecipeSummary[];
  selectedRecipeId: number | null;
  onSelectRecipe: (id: number) => void;
}) {
  return (
    <ul>
      {recipes.map((recipe) => (
        <li key={recipe.id}>
          <button
            type="button"
            className={`sidebar-recipe-link${recipe.id === selectedRecipeId ? ' active' : ''}`}
            onClick={() => onSelectRecipe(recipe.id)}
          >
            {recipe.favoritedAt ? '❤ ' : ''}
            {recipe.wantToTryAt ? '★ ' : ''}
            {recipe.title}
          </button>
        </li>
      ))}
    </ul>
  );
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

  const queueRecipes = useMemo(
    () =>
      recipes
        .filter((r) => r.wantToTryAt)
        .sort((a, b) => (a.wantToTryAt ?? '').localeCompare(b.wantToTryAt ?? '')),
    [recipes]
  );

  const favoriteRecipes = useMemo(
    () =>
      recipes
        .filter((r) => r.favoritedAt)
        .sort((a, b) => (b.favoritedAt ?? '').localeCompare(a.favoritedAt ?? '')),
    [recipes]
  );

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Recipes</h2>
      </div>

      <div className="sidebar-group-toggle">
        <button type="button" className={groupMode === 'source' ? 'active' : ''} onClick={() => setGroupMode('source')}>
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

      <details className="sidebar-quick-section">
        <summary>
          ★ Queue <span className="sidebar-count">({queueRecipes.length})</span>
        </summary>
        {queueRecipes.length === 0 ? (
          <div className="sidebar-empty muted">Nothing queued yet.</div>
        ) : (
          <RecipeLinkList recipes={queueRecipes} selectedRecipeId={selectedRecipeId} onSelectRecipe={onSelectRecipe} />
        )}
      </details>

      <details className="sidebar-quick-section">
        <summary>
          ❤ Favorites <span className="sidebar-count">({favoriteRecipes.length})</span>
        </summary>
        {favoriteRecipes.length === 0 ? (
          <div className="sidebar-empty muted">No favorites yet.</div>
        ) : (
          <RecipeLinkList
            recipes={favoriteRecipes}
            selectedRecipeId={selectedRecipeId}
            onSelectRecipe={onSelectRecipe}
          />
        )}
      </details>

      {recipes.length === 0 ? (
        <div className="sidebar-empty muted">No recipes yet.</div>
      ) : (
        <div className="sidebar-tree">
          {groups.map((group) => (
            <details key={group.label} open>
              <summary>
                {group.label} <span className="sidebar-count">({group.recipes.length})</span>
              </summary>
              <RecipeLinkList recipes={group.recipes} selectedRecipeId={selectedRecipeId} onSelectRecipe={onSelectRecipe} />
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
