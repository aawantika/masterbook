import { useNavigate, useOutletContext } from 'react-router-dom';
import { ShellContext } from '../CookbookShell';
import { FilterBar } from '../components/FilterBar';
import { RecipeCard } from '../components/RecipeCard';

export function BrowsePage() {
  const navigate = useNavigate();
  const {
    query,
    setQuery,
    mealTypes,
    selectedMealTypeIds,
    toggleMealType,
    cuisines,
    selectedCuisineIds,
    toggleCuisine,
    ingredients,
    selectedIngredientIds,
    toggleIngredient,
    toTryOnly,
    toggleToTryOnly,
    favoritesOnly,
    toggleFavoritesOnly,
    results,
    loading,
    handleToggleWantToTry,
    handleToggleFavorite
  } = useOutletContext<ShellContext>();

  return (
    <>
      <FilterBar
        query={query}
        onQueryChange={setQuery}
        mealTypes={mealTypes}
        selectedMealTypeIds={selectedMealTypeIds}
        onToggleMealType={toggleMealType}
        cuisines={cuisines}
        selectedCuisineIds={selectedCuisineIds}
        onToggleCuisine={toggleCuisine}
        ingredients={ingredients}
        selectedIngredientIds={selectedIngredientIds}
        onToggleIngredient={toggleIngredient}
        toTryOnly={toTryOnly}
        onToggleToTryOnly={toggleToTryOnly}
        favoritesOnly={favoritesOnly}
        onToggleFavoritesOnly={toggleFavoritesOnly}
      />

      {loading ? (
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
              onSelect={(id) => navigate(`/recipes/${id}`)}
            />
          ))}
        </div>
      )}
    </>
  );
}
