import { MetaItem } from '../api/types';
import { SortBy } from '../CookbookShell';

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
  sortBy: SortBy;
  onChangeSortBy: (sort: SortBy) => void;
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
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
    <details className="filter-group">
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
  sortBy,
  onChangeSortBy,
  viewMode,
  onChangeViewMode
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
          <span className="heart-icon">♥</span> Favorites
        </button>
        <button
          type="button"
          className={`filter-chip${needsFixingOnly ? ' active' : ''}`}
          onClick={onToggleNeedsFixingOnly}
        >
          🔧 Needs fixing
        </button>
        <FilterGroup label="Meal type" items={mealTypes} selected={selectedMealTypeIds} onToggle={onToggleMealType} />
        <FilterGroup label="Cuisine" items={cuisines} selected={selectedCuisineIds} onToggle={onToggleCuisine} />
        <div className="filter-group-divider" />
        <button
          type="button"
          className={`filter-chip${sortBy === 'title' ? ' active' : ''}`}
          onClick={() => onChangeSortBy('title')}
        >
          A–Z
        </button>
        <button
          type="button"
          className={`filter-chip${sortBy === 'recent' ? ' active' : ''}`}
          onClick={() => onChangeSortBy('recent')}
        >
          Recently added
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
