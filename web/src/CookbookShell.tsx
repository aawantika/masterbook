import { useEffect, useState } from 'react';
import { getCuisines, getIngredientNames, getMealTypes, searchRecipes, setFavorite, setWantToTry } from './api/client';
import { MetaItem, RecipeSummary } from './api/types';
import { Sidebar } from './components/Sidebar';
import { FilterBar } from './components/FilterBar';
import { RecipeCard } from './components/RecipeCard';
import { RecipeDetailPanel } from './components/RecipeDetailPanel';
import { ImportPanel } from './components/ImportPanel';
import { CookingLogPanel } from './components/CookingLogPanel';

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

type ViewMode = 'list' | 'detail' | 'import';

export function CookbookShell() {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedRecipeId, setSelectedRecipeId] = useState<number | null>(null);
  const [reloadSignal, setReloadSignal] = useState(0);
  const bumpReload = () => setReloadSignal((n) => n + 1);

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query, 250);
  const [mealTypes, setMealTypes] = useState<MetaItem[]>([]);
  const [cuisines, setCuisines] = useState<MetaItem[]>([]);
  const [ingredients, setIngredients] = useState<MetaItem[]>([]);
  const [selectedMealTypeIds, setSelectedMealTypeIds] = useState<Set<number>>(new Set());
  const [selectedCuisineIds, setSelectedCuisineIds] = useState<Set<number>>(new Set());
  const [selectedIngredientIds, setSelectedIngredientIds] = useState<Set<number>>(new Set());
  const [toTryOnly, setToTryOnly] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [results, setResults] = useState<RecipeSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getMealTypes(), getCuisines(), getIngredientNames()]).then(([mt, c, i]) => {
      setMealTypes(mt);
      setCuisines(c);
      setIngredients(i);
    });
  }, []);

  const runSearch = async () => {
    setLoading(true);
    try {
      const data = await searchRecipes({
        q: debouncedQuery,
        mealTypeIds: Array.from(selectedMealTypeIds),
        cuisineIds: Array.from(selectedCuisineIds),
        ingredientIds: Array.from(selectedIngredientIds),
        toTry: toTryOnly,
        favorites: favoritesOnly
      });
      setResults(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    debouncedQuery,
    selectedMealTypeIds,
    selectedCuisineIds,
    selectedIngredientIds,
    toTryOnly,
    favoritesOnly,
    reloadSignal
  ]);

  const toggleInSet = (setter: React.Dispatch<React.SetStateAction<Set<number>>>, id: number) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleWantToTry = async (id: number, want: boolean) => {
    await setWantToTry(id, want);
    bumpReload();
  };

  const handleToggleFavorite = async (id: number, favorite: boolean) => {
    await setFavorite(id, favorite);
    bumpReload();
  };

  const handleSelectRecipe = (id: number) => {
    setSelectedRecipeId(id);
    setViewMode('detail');
  };

  return (
    <div className="cookbook-shell">
      <aside className="shell-pane shell-pane-left">
        <Sidebar selectedRecipeId={selectedRecipeId} onSelectRecipe={handleSelectRecipe} reloadSignal={reloadSignal} />
      </aside>

      <main className="shell-pane shell-pane-middle">
        <div className="middle-topbar">
          <h1 className="shell-title">Local Cookbook</h1>
          <button type="button" className="button-link" onClick={() => setViewMode('import')}>
            + Add recipe
          </button>
        </div>

        <FilterBar
          query={query}
          onQueryChange={(value) => {
            setQuery(value);
            setViewMode('list');
          }}
          mealTypes={mealTypes}
          selectedMealTypeIds={selectedMealTypeIds}
          onToggleMealType={(id) => toggleInSet(setSelectedMealTypeIds, id)}
          cuisines={cuisines}
          selectedCuisineIds={selectedCuisineIds}
          onToggleCuisine={(id) => toggleInSet(setSelectedCuisineIds, id)}
          ingredients={ingredients}
          selectedIngredientIds={selectedIngredientIds}
          onToggleIngredient={(id) => toggleInSet(setSelectedIngredientIds, id)}
          toTryOnly={toTryOnly}
          onToggleToTryOnly={() => setToTryOnly((prev) => !prev)}
          favoritesOnly={favoritesOnly}
          onToggleFavoritesOnly={() => setFavoritesOnly((prev) => !prev)}
        />

        <div className="middle-content">
          {viewMode === 'import' && (
            <ImportPanel
              onCreated={(id) => {
                bumpReload();
                handleSelectRecipe(id);
              }}
              onCancel={() => setViewMode('list')}
            />
          )}

          {viewMode === 'detail' && selectedRecipeId != null && (
            <>
              <RecipeDetailPanel
                recipeId={selectedRecipeId}
                onDeleted={() => {
                  setSelectedRecipeId(null);
                  setViewMode('list');
                  bumpReload();
                }}
                onChanged={bumpReload}
              />
              <CookingLogPanel recipeId={selectedRecipeId} onChanged={bumpReload} />
            </>
          )}

          {viewMode === 'list' &&
            (loading ? (
              <div className="muted">Loading...</div>
            ) : results.length === 0 ? (
              <div className="muted">No recipes match. Try adjusting filters, or add a new recipe.</div>
            ) : (
              <div className="recipe-grid">
                {results.map((recipe) => (
                  <RecipeCard
                    key={recipe.id}
                    recipe={recipe}
                    onToggleWantToTry={handleToggleWantToTry}
                    onToggleFavorite={handleToggleFavorite}
                    onSelect={handleSelectRecipe}
                  />
                ))}
              </div>
            ))}
        </div>
      </main>
    </div>
  );
}
