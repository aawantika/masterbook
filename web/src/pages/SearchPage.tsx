import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCuisines, getIngredientNames, getMealTypes, searchRecipes, setWantToTry } from '../api/client';
import { MetaItem, RecipeSummary } from '../api/types';
import { FilterBar } from '../components/FilterBar';
import { RecipeCard } from '../components/RecipeCard';

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function SearchPage() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query, 250);
  const [mealTypes, setMealTypes] = useState<MetaItem[]>([]);
  const [cuisines, setCuisines] = useState<MetaItem[]>([]);
  const [ingredients, setIngredients] = useState<MetaItem[]>([]);
  const [selectedMealTypeIds, setSelectedMealTypeIds] = useState<Set<number>>(new Set());
  const [selectedCuisineIds, setSelectedCuisineIds] = useState<Set<number>>(new Set());
  const [selectedIngredientIds, setSelectedIngredientIds] = useState<Set<number>>(new Set());
  const [toTryOnly, setToTryOnly] = useState(false);
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
        toTry: toTryOnly
      });
      setResults(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, selectedMealTypeIds, selectedCuisineIds, selectedIngredientIds, toTryOnly]);

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
    runSearch();
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Local Cookbook</h1>
        <Link to="/import" className="button-link">
          + Add recipe
        </Link>
      </header>

      <FilterBar
        query={query}
        onQueryChange={setQuery}
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
      />

      {loading ? (
        <div className="muted">Loading...</div>
      ) : results.length === 0 ? (
        <div className="muted">No recipes match. Try adjusting filters, or add a new recipe.</div>
      ) : (
        <div className="recipe-grid">
          {results.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} onToggleWantToTry={handleToggleWantToTry} />
          ))}
        </div>
      )}
    </div>
  );
}
