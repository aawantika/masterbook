import { useEffect, useState } from 'react';
import { Link, Outlet, useNavigate, useParams } from 'react-router-dom';
import { getCuisines, getMealTypes, searchRecipes, setFavorite, setNeedsFixing, setWantToTry } from './api/client';
import { MetaItem, RecipeSummary } from './api/types';
import { Sidebar } from './components/Sidebar';

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export type ShellContext = {
  bumpReload: () => void;
  query: string;
  setQuery: (value: string) => void;
  mealTypes: MetaItem[];
  cuisines: MetaItem[];
  selectedMealTypeIds: Set<number>;
  toggleMealType: (id: number) => void;
  selectedCuisineIds: Set<number>;
  toggleCuisine: (id: number) => void;
  toTryOnly: boolean;
  toggleToTryOnly: () => void;
  favoritesOnly: boolean;
  toggleFavoritesOnly: () => void;
  needsFixingOnly: boolean;
  toggleNeedsFixingOnly: () => void;
  results: RecipeSummary[];
  loading: boolean;
  handleToggleWantToTry: (id: number, want: boolean) => void;
  handleToggleFavorite: (id: number, favorite: boolean) => void;
  handleToggleNeedsFixing: (id: number, needsFixing: boolean) => void;
};

export function CookbookShell() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const selectedRecipeId = id ? Number(id) : null;

  const [reloadSignal, setReloadSignal] = useState(0);
  const bumpReload = () => setReloadSignal((n) => n + 1);

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query, 250);
  const [mealTypes, setMealTypes] = useState<MetaItem[]>([]);
  const [cuisines, setCuisines] = useState<MetaItem[]>([]);
  const [selectedMealTypeIds, setSelectedMealTypeIds] = useState<Set<number>>(new Set());
  const [selectedCuisineIds, setSelectedCuisineIds] = useState<Set<number>>(new Set());
  const [toTryOnly, setToTryOnly] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [needsFixingOnly, setNeedsFixingOnly] = useState(false);
  const [results, setResults] = useState<RecipeSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getMealTypes(), getCuisines()]).then(([mt, c]) => {
      setMealTypes(mt);
      setCuisines(c);
    });
  }, []);

  const runSearch = async () => {
    setLoading(true);
    try {
      const data = await searchRecipes({
        q: debouncedQuery,
        mealTypeIds: Array.from(selectedMealTypeIds),
        cuisineIds: Array.from(selectedCuisineIds),
        toTry: toTryOnly,
        favorites: favoritesOnly,
        needsFixing: needsFixingOnly
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
    toTryOnly,
    favoritesOnly,
    needsFixingOnly,
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

  const handleToggleWantToTry = async (recipeId: number, want: boolean) => {
    await setWantToTry(recipeId, want);
    bumpReload();
  };

  const handleToggleFavorite = async (recipeId: number, favorite: boolean) => {
    await setFavorite(recipeId, favorite);
    bumpReload();
  };

  const handleToggleNeedsFixing = async (recipeId: number, needsFixing: boolean) => {
    await setNeedsFixing(recipeId, needsFixing);
    bumpReload();
  };

  const context: ShellContext = {
    bumpReload,
    query,
    setQuery,
    mealTypes,
    cuisines,
    selectedMealTypeIds,
    toggleMealType: (mealTypeId) => toggleInSet(setSelectedMealTypeIds, mealTypeId),
    selectedCuisineIds,
    toggleCuisine: (cuisineId) => toggleInSet(setSelectedCuisineIds, cuisineId),
    toTryOnly,
    toggleToTryOnly: () => setToTryOnly((prev) => !prev),
    favoritesOnly,
    toggleFavoritesOnly: () => setFavoritesOnly((prev) => !prev),
    needsFixingOnly,
    toggleNeedsFixingOnly: () => setNeedsFixingOnly((prev) => !prev),
    results,
    loading,
    handleToggleWantToTry,
    handleToggleFavorite,
    handleToggleNeedsFixing
  };

  return (
    <div className="cookbook-shell">
      <aside className="shell-pane shell-pane-left">
        <Sidebar
          selectedRecipeId={selectedRecipeId}
          onSelectRecipe={(recipeId) => navigate(`/recipes/${recipeId}`)}
          reloadSignal={reloadSignal}
        />
      </aside>

      <main className="shell-pane shell-pane-middle">
        <div className="middle-topbar">
          <Link to="/" className="shell-title-link">
            <h1 className="shell-title">Local Cookbook</h1>
          </Link>
          <div className="middle-topbar-actions">
            <Link to="/activity" className="button-link secondary-link">
              Activity log
            </Link>
            <Link to="/add" className="button-link">
              + Add recipe
            </Link>
          </div>
        </div>

        <div className="middle-content">
          <Outlet context={context} />
        </div>
      </main>
    </div>
  );
}
