import { Contributor, MetaItem } from '../api/types';
import { MadeFilter, SortBy } from '../CookbookShell';

export type ViewMode = 'grid' | 'list';

type FilterBarProps = {
  query: string;
  onQueryChange: (value: string) => void;
  mealTypes: MetaItem[];
  selectedMealTypeIds: Set<number>;
  onToggleMealType: (id: number) => void;
  cuisines: MetaItem[];
  selectedCuisineIds: Set<number>;
  onToggleCuisine: (id: number) => void;
  toTryOnly: boolean;
  onToggleToTryOnly: () => void;
  favoritesOnly: boolean;
  onToggleFavoritesOnly: () => void;
  needsFixingOnly: boolean;
  onToggleNeedsFixingOnly: () => void;
  madeFilter: MadeFilter;
  onChangeMadeFilter: (value: MadeFilter) => void;
  minRating: number | null;
  onChangeMinRating: (value: number | null) => void;
  maxTimeMinutes: number | null;
  onChangeMaxTimeMinutes: (value: number | null) => void;
  contributors: Contributor[];
  selectedOwnerIds: Set<number>;
  onToggleOwner: (id: number) => void;
  currentUserId: number | null;
  onSetOwnerIds: (ids: number[]) => void;
  sortBy: SortBy;
  onChangeSortBy: (sort: SortBy) => void;
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  onClearFilters: () => void;
};

// One shared visual treatment for every control in this row -- plain
// toggles (Queue/Favorites/Grid/List) and disclosure groups (Meal
// type/Cuisine) used to each look different (a pill-shaped amber toggle, a
// bare rounded-rect summary with no active state, etc.) despite being the
// same kind of control conceptually. All of them are just "filter-chip",
// active or not.
function FilterGroup({
  label,
  items,
  selected,
  onToggle
}: {
  label: string;
  items: MetaItem[];
  selected: Set<number>;
  onToggle: (id: number) => void;
}) {
  if (items.length === 0) return null;
  return (
    // The shared `name` makes these into a native HTML exclusive-accordion
    // group -- opening one automatically closes any other <details> with
    // the same name, no JS state needed. Covers all three (Added by, Meal
    // type, Cuisine) since they all render through this one component.
    <details className="filter-group" name="filter-dropdown-group">
      <summary className={`filter-chip${selected.size > 0 ? ' active' : ''}`}>
        {label}
        {selected.size > 0 ? ` (${selected.size})` : ''}
      </summary>
      <div className="filter-group-chips">
        {items.map((item) => (
          <label key={item.id} className={`chip-checkbox${selected.has(item.id) ? ' active' : ''}`}>
            <input type="checkbox" checked={selected.has(item.id)} onChange={() => onToggle(item.id)} />
            {item.name}
          </label>
        ))}
      </div>
    </details>
  );
}

export function FilterBar({
  query,
  onQueryChange,
  mealTypes,
  selectedMealTypeIds,
  onToggleMealType,
  cuisines,
  selectedCuisineIds,
  onToggleCuisine,
  toTryOnly,
  onToggleToTryOnly,
  favoritesOnly,
  onToggleFavoritesOnly,
  needsFixingOnly,
  onToggleNeedsFixingOnly,
  madeFilter,
  onChangeMadeFilter,
  minRating,
  onChangeMinRating,
  maxTimeMinutes,
  onChangeMaxTimeMinutes,
  contributors,
  selectedOwnerIds,
  onToggleOwner,
  currentUserId,
  onSetOwnerIds,
  sortBy,
  onChangeSortBy,
  viewMode,
  onChangeViewMode,
  onClearFilters
}: FilterBarProps) {
  return (
    <div className="filter-bar">
      <input
        className="search-input"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search recipes..."
      />
      <div className="filter-groups">
        <button type="button" className={`filter-chip${toTryOnly ? ' active' : ''}`} onClick={onToggleToTryOnly}>
          ★ Queue
        </button>
        <button
          type="button"
          className={`filter-chip${favoritesOnly ? ' active' : ''}`}
          onClick={onToggleFavoritesOnly}
        >
          ❤️ Favorites
        </button>
        <button
          type="button"
          className={`filter-chip${needsFixingOnly ? ' active' : ''}`}
          onClick={onToggleNeedsFixingOnly}
        >
          🛠️ Needs fixing
        </button>
        {/* Quick shortcut for the single most common case -- narrows
            straight to your own recipes without opening the Added-by
            disclosure and finding yourself in the list. Toggling it off
            (clicking again while active) clears back to "everyone", same
            as clearing the Added-by group would. */}
        {currentUserId != null && (
          <button
            type="button"
            className={`filter-chip${selectedOwnerIds.size === 1 && selectedOwnerIds.has(currentUserId) ? ' active' : ''}`}
            onClick={() =>
              onSetOwnerIds(
                selectedOwnerIds.size === 1 && selectedOwnerIds.has(currentUserId) ? [] : [currentUserId]
              )
            }
          >
            Only me
          </button>
        )}
        <FilterGroup label="Meal type" items={mealTypes} selected={selectedMealTypeIds} onToggle={onToggleMealType} />
        <FilterGroup label="Cuisine" items={cuisines} selected={selectedCuisineIds} onToggle={onToggleCuisine} />
        {/* Was a single-select dropdown ("Added by: X") -- switched to the
            same multi-select disclosure pattern as Meal type/Cuisine above,
            so you can filter to any combination of people at once instead
            of just one. An empty selection means "everyone", same as it
            always has. */}
        <FilterGroup label="Added by" items={contributors} selected={selectedOwnerIds} onToggle={onToggleOwner} />
        {/* Was two separate mutually-exclusive chips (Made / Not made yet) --
            a 3-way choice reads more clearly as one dropdown than two
            buttons where clicking one has to silently un-click the other. */}
        <select
          className="sort-select"
          value={madeFilter}
          onChange={(e) => onChangeMadeFilter(e.target.value as MadeFilter)}
          aria-label="Made status"
        >
          <option value="all">Made: Any</option>
          <option value="made">🍳 Made</option>
          <option value="not-made">Not made yet</option>
        </select>
        <select
          className="sort-select"
          value={minRating ?? ''}
          onChange={(e) => onChangeMinRating(e.target.value === '' ? null : Number(e.target.value))}
          aria-label="Minimum rating"
        >
          <option value="">Rating: Any</option>
          <option value="5">★★★★★ only</option>
          <option value="4">★★★★+</option>
          <option value="3">★★★+</option>
          <option value="2">★★+</option>
          <option value="1">★+</option>
        </select>
        <select
          className="sort-select"
          value={maxTimeMinutes ?? ''}
          onChange={(e) => onChangeMaxTimeMinutes(e.target.value === '' ? null : Number(e.target.value))}
          aria-label="Maximum time"
        >
          <option value="">Time: Any</option>
          <option value="15">Under 15 min</option>
          <option value="30">Under 30 min</option>
          <option value="45">Under 45 min</option>
          <option value="60">Under 1 hour</option>
          <option value="120">Under 2 hours</option>
        </select>
        <div className="filter-group-divider" />
        <select
          className="sort-select"
          value={sortBy}
          onChange={(e) => onChangeSortBy(e.target.value as SortBy)}
          aria-label="Sort by"
        >
          <option value="title">Sort: A–Z</option>
          <option value="recent">Sort: Recently added</option>
        </select>
        <button type="button" className="filter-chip" onClick={onClearFilters}>
          Clear filters
        </button>
        <div className="filter-group-divider" />
        <button
          type="button"
          className={`filter-chip${viewMode === 'grid' ? ' active' : ''}`}
          onClick={() => onChangeViewMode('grid')}
        >
          Grid
        </button>
        <button
          type="button"
          className={`filter-chip${viewMode === 'list' ? ' active' : ''}`}
          onClick={() => onChangeViewMode('list')}
        >
          List
        </button>
      </div>
    </div>
  );
}
