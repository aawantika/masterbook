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
import { Button, ButtonLink } from './components/Button';
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
  maxTimeMinutes: number | null;
  setMaxTimeMinutes: (value: number | null) => void;
  contributors: Contributor[];
  selectedOwnerIds: Set<number>;
  toggleOwner: (id: number) => void;
  currentUserId: number | null;
  setOwnerIds: (ids: number[]) => void;
  clearFilters: () => void;
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

  // Two independent flags driving the SAME toggle button, each meaningful
  // only within its own breakpoint's CSS (see index.css): sidebarOpen is
  // the mobile off-canvas drawer (default closed), sidebarCollapsed is the
  // desktop persistent-column rail (default expanded). Toggling both
  // together from one click still produces the right behavior at both
  // sizes, since each breakpoint's CSS only reads its own flag and ignores
  // the other.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const toggleSidebar = () => {
    setSidebarOpen((prev) => !prev);
    setSidebarCollapsed((prev) => !prev);
  };

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
  const [maxTimeMinutes, setMaxTimeMinutes] = useState<number | null>(null);
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
        maxTimeMinutes: maxTimeMinutes ?? undefined,
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
    maxTimeMinutes,
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

  // Resets every filter back to its default -- deliberately leaves sortBy
  // and viewMode alone, since those are display preferences, not filters
  // narrowing down which recipes show up.
  const clearFilters = () => {
    setQuery('');
    setSelectedMealTypeIds(new Set());
    setSelectedCuisineIds(new Set());
    setToTryOnly(false);
    setFavoritesOnly(false);
    setNeedsFixingOnly(false);
    setMadeFilter('all');
    setMinRating(null);
    setMaxTimeMinutes(null);
    setSelectedOwnerIds(new Set());
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
    maxTimeMinutes,
    setMaxTimeMinutes,
    contributors,
    selectedOwnerIds,
    toggleOwner: (ownerId) => toggleInSet(setSelectedOwnerIds, ownerId),
    currentUserId: user?.id ?? null,
    setOwnerIds: (ids) => setSelectedOwnerIds(new Set(ids)),
    clearFilters,
    sortBy,
    setSortBy,
    results,
    loading,
    handleToggleWantToTry,
    handleToggleFavorite,
    handleToggleNeedsFixing
  };

  return (
    <div className={`cookbook-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <div
        className={`sidebar-backdrop${sidebarOpen ? ' sidebar-open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />
      <aside
        className={`shell-pane shell-pane-left${sidebarOpen ? ' sidebar-open' : ''}${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}
      >
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
        {/* Lives in the topbar, not inside the collapsible/off-canvas
            <aside> above -- it was moved in there once already and that
            broke re-opening entirely (the only "show it again" button was
            inside the very panel it had just hidden -- on mobile, which
            starts closed, that broke opening it the very first time too).
            Always reachable here instead; .shell-title-link is absolutely
            centered (see index.css) specifically so this button's presence
            doesn't knock the title off-center the way a plain flex
            space-between row did before. */}
        <div className="middle-topbar">
          <button
            type="button"
            className="sidebar-toggle"
            aria-label="Toggle recipe list panel"
            onClick={toggleSidebar}
          >
            ☰
          </button>
          <Link to="/" className="shell-title-link">
            <h1 className="shell-title">Masterbook</h1>
          </Link>
          <div className="middle-topbar-actions">
            {user?.role === 'admin' && (
              <ButtonLink to="/admin" variant="secondary">
                Admin
              </ButtonLink>
            )}
            {/* Admin-only, on purpose -- not "hidden for now" anymore, the
                backend actually enforces this too (see requireAdmin on
                /api/epub in server/src/index.ts). A known vulnerability in
                a transitive EPUB-parsing dependency made "any approved
                user can upload a zip" a real attack surface, so this stays
                a personal, admin-only side feature until that's resolved. */}
            {user?.role === 'admin' && (
              <ButtonLink to="/epub" variant="secondary">
                EPUB library
              </ButtonLink>
            )}
            <ButtonLink to="/activity" variant="secondary">
              Activity log
            </ButtonLink>
            <ButtonLink to="/add" variant="primary">
              + Add recipe
            </ButtonLink>
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
                <Button variant="secondary" size="sm" onClick={logout}>
                  Log out
                </Button>
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
