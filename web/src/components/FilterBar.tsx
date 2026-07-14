import { MetaItem } from '../api/types';

type FilterBarProps = {
  query: string;
  onQueryChange: (value: string) => void;
  mealTypes: MetaItem[];
  selectedMealTypeIds: Set<number>;
  onToggleMealType: (id: number) => void;
  cuisines: MetaItem[];
  selectedCuisineIds: Set<number>;
  onToggleCuisine: (id: number) => void;
  ingredients: MetaItem[];
  selectedIngredientIds: Set<number>;
  onToggleIngredient: (id: number) => void;
  toTryOnly: boolean;
  onToggleToTryOnly: () => void;
  favoritesOnly: boolean;
  onToggleFavoritesOnly: () => void;
};

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
      <summary>
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
  ingredients,
  selectedIngredientIds,
  onToggleIngredient,
  toTryOnly,
  onToggleToTryOnly,
  favoritesOnly,
  onToggleFavoritesOnly
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
        <button
          type="button"
          className={`chip-checkbox to-try-toggle${toTryOnly ? ' active' : ''}`}
          onClick={onToggleToTryOnly}
        >
          ★ Queue
        </button>
        <button
          type="button"
          className={`chip-checkbox to-try-toggle${favoritesOnly ? ' active' : ''}`}
          onClick={onToggleFavoritesOnly}
        >
          ❤ Favorites
        </button>
        <FilterGroup label="Meal type" items={mealTypes} selected={selectedMealTypeIds} onToggle={onToggleMealType} />
        <FilterGroup label="Cuisine" items={cuisines} selected={selectedCuisineIds} onToggle={onToggleCuisine} />
        <FilterGroup
          label="Ingredient"
          items={ingredients}
          selected={selectedIngredientIds}
          onToggle={onToggleIngredient}
        />
      </div>
    </div>
  );
}
