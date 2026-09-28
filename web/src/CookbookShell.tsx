import { useEffect, useState } from 'react';
import { Link, Outlet, useNavigate, useParams } from 'react-router-dom';
import {
  getContributors,
  getCuisines,
  getMealTypes,
  getSiteStatus,
  searchRecipes,
  setFavorite,
  setNeedsFixing,
  setWantToTry
} from './api/client';
import { Contributor, MetaItem, RecipeSummary, SiteStatus } from './api/types';
import { Sidebar } from './components/Sidebar';
import { useAuth } from './auth/AuthContext';

export type SortBy = 'title' | 'recent';
// "all" shows everything; the other two are mutually exclusive with each
// other (a recipe can't be both made and not-made), so this is a single
// tri-state value rather than two independent booleans like the other
// filter chips -- selecting one clears the other automatically.
export type MadeFilter = 'all' | 'made' | 'not-made';

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
  madeFilter: MadeFilter;
  setMadeFilter: (value: MadeFilter) => void;
  minRating: number | null;
  setMinRating: (value: number | null) => void;
  contributors: Contributor[];
  selectedOwnerIds: Set<number>;
  toggleOwner: (id: number) => void;
  sortBy: SortBy;
  setSortBy: (sort: SortBy) => void;
  results: RecipeSummary[];
  loading: boolean;
  handleToggleWantToTry: (id: number, want: boolean) => void;
  handleToggleFavorite: (id: number, favorite: boolean) => void;
  handleToggleNeedsFixing: (id: number, needsFixing: boolean) => void;
};

export function CookbookShell() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { id } = useParams<{ id: string }>();
  const selectedRecipeId = id ? Number(id) : null;

  const [reloadSignal, setReloadSignal] = useState(0);
  const bumpReload = () => setReloadSignal((n) => n + 1);

  // Off-canvas on mobile, collapsed by default (see the @media block in
  // index.css) -- irrelevant above that breakpoint since the CSS there is
  // what actually makes the toggle/backdrop visible at all.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query, 250);
  const [mealTypes, setMealTypes] = useState<MetaItem[]>([]);
  const [cuisines, setCuisines] = useState<MetaItem[]>([]);
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [selectedMealTypeIds, setSelectedMealTypeIds] = useState<Set<number>>(new Set());
  const [selectedCuisineIds, setSelectedCuisineIds] = useState<Set<number>>(new Set());
  const [toTryOnly, setToTryOnly] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [needsFixingOnly, setNeedsFixingOnly] = useState(false);
  const [madeFilter, setMadeFilter] = useState<MadeFilter>('all');
  const [minRating, setMinRating] = useState<number | null>(null);
  const [selectedOwnerIds, setSelectedOwnerIds] = useState<Set<number>>(new Set());
  const [sortBy, setSortBy] = useState<SortBy>('title');
  const [results, setResults] = useState<RecipeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [siteStatus, setSiteStatus] = useState<SiteStatus | null>(null);

  useEffect(() => {
    Promise.all([getMealTypes(), getCuisines(), getContributors()]).then(([mt, c, contrib]) => {
      setMealTypes(mt);
      setCuisines(c);
      setContributors(contrib);
    });
    // Only matters for non-admins (an admin's writes are never blocked --
    // see requireSiteNotFrozen), but harmless either way, and simplest to
    // just always check on load rather than branch on role first.
    getSiteStatus().then(setSiteStatus);
  }, []);

  const runSearch = async () => {
    // Only show the full-page "Loading..." swap for the very first load.
    // A toggle button (favorite/queue/needs-fixing) triggers a refresh via
    // bumpReload, and unconditionally flipping loading here made the whole
    // grid collapse to a single line and back on every click -- which reset
    // scroll position to the top. Once there's already a result set on
    // screen, keep showing it while the fresh one loads in the background.
    if (results.length === 0) setLoading(true);
    try {
      const data = await searchRecipes({
        q: debouncedQuery,
        mealTypeIds: Array.from(selectedMealTypeIds),
        cuisineIds: Array.from(selectedCuisineIds),
        toTry: toTryOnly,
        favorites: favoritesOnly,
        needsFixing: needsFixingOnly,
        made: madeFilter === 'made',
        notMade: madeFilter === 'not-made',
        minRating: minRating ?? undefined,
        ownerIds: Array.from(selectedOwnerIds),
        sort: sortBy
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
    madeFilter,
    minRating,
    selectedOwnerIds,
    sortBy,
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
    madeFilter,
    setMadeFilter,
    minRating,
    setMinRating,
    contributors,
    selectedOwnerIds,
    toggleOwner: (ownerId) => toggleInSet(setSelectedOwnerIds, ownerId),
    sortBy,
    setSortBy,
    results,
    loading,
    handleToggleWantToTry,
    handleToggleFavorite,
    handleToggleNeedsFixing
  };

  return (
    <div className="cookbook-shell">
      <div
        className={`sidebar-backdrop${sidebarOpen ? ' sidebar-open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />
      <aside className={`shell-pane shell-pane-left${sidebarOpen ? ' sidebar-open' : ''}`}>
        <Sidebar
          selectedRecipeId={selectedRecipeId}
          onSelectRecipe={(recipeId) => {
            setSidebarOpen(false);
            navigate(`/recipes/${recipeId}`);
          }}
          reloadSignal={reloadSignal}
        />
      </aside>

      <main className="shell-pane shell-pane-middle">
        <div className="middle-topbar">
          <button
            type="button"
            className="sidebar-toggle"
            aria-label={sidebarOpen ? 'Close recipe list' : 'Open recipe list'}
            onClick={() => setSidebarOpen((prev) => !prev)}
          >
            {sidebarOpen ? '✕' : '☰'}
          </button>
          <Link to="/" className="shell-title-link">
            <h1 className="shell-title">Masterbook</h1>
          </Link>
          <div className="middle-topbar-actions">
            {user?.role === 'admin' && (
              <Link to="/admin" className="button-link secondary-link">
                Admin
              </Link>
            )}
            {/* Temporarily hidden -- marked pending for now. The route
                itself (/epub) is untouched, so this is just a one-line
                revert whenever it's ready to come back. */}
            <Link to="/activity" className="button-link secondary-link">
              Activity log
            </Link>
            <Link to="/add" className="button-link">
              + Add recipe
            </Link>
            {user && (
              <span className="topbar-user">
                <Link to="/profile" className="topbar-profile-link">
                  {user.avatarUrl ? (
                    <img className="topbar-avatar" src={user.avatarUrl} alt="" />
                  ) : (
                    <span className="topbar-avatar topbar-avatar-placeholder">
                      {(user.displayName || user.email).slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="muted">{user.displayName || user.email}</span>
                </Link>
                <button type="button" className="logout-button" onClick={logout}>
                  Log out
                </button>
              </span>
            )}
          </div>
        </div>

        {siteStatus?.frozenAt && user?.role !== 'admin' && (
          <div className="site-frozen-banner">
            🧊 Masterbook is in maintenance mode right now -- browsing works, but adding/editing/deleting is
            temporarily paused.
            {siteStatus.frozenMessage && <> "{siteStatus.frozenMessage}"</>}
          </div>
        )}

        <div className="middle-content">
          <Outlet context={context} />
        </div>
      </main>
    </div>
  );
}
