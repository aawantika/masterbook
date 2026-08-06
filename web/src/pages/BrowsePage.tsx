import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { ShellContext } from '../CookbookShell';
import { FilterBar, ViewMode } from '../components/FilterBar';
import { RecipeCard } from '../components/RecipeCard';
import { RecipeListRow } from '../components/RecipeListRow';

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
    toTryOnly,
    toggleToTryOnly,
    favoritesOnly,
    toggleFavoritesOnly,
    needsFixingOnly,
    toggleNeedsFixingOnly,
    results,
    loading,
    handleToggleWantToTry,
    handleToggleFavorite,
    handleToggleNeedsFixing
  } = useOutletContext<ShellContext>();

  const [viewMode, setViewMode] = useState<ViewMode>('grid');

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
        toTryOnly={toTryOnly}
        onToggleToTryOnly={toggleToTryOnly}
        favoritesOnly={favoritesOnly}
        onToggleFavoritesOnly={toggleFavoritesOnly}
        needsFixingOnly={needsFixingOnly}
        onToggleNeedsFixingOnly={toggleNeedsFixingOnly}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
      />

      {loading ? (
        <div className="muted">Loading...</div>
      ) : results.length === 0 ? (
        <div className="muted">No recipes match. Try adjusting filters, or add a new recipe.</div>
      ) : viewMode === 'grid' ? (
        <div className="recipe-grid">
          {results.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              onToggleWantToTry={handleToggleWantToTry}
              onToggleFavorite={handleToggleFavorite}
              onToggleNeedsFixing={handleToggleNeedsFixing}
              onSelect={(id) => navigate(`/recipes/${id}`)}
            />
          ))}
        </div>
      ) : (
        <div className="recipe-list">
          {results.map((recipe) => (
            <RecipeListRow
              key={recipe.id}
              recipe={recipe}
              onToggleWantToTry={handleToggleWantToTry}
              onToggleFavorite={handleToggleFavorite}
              onToggleNeedsFixing={handleToggleNeedsFixing}
              onSelect={(id) => navigate(`/recipes/${id}`)}
            />
          ))}
        </div>
      )}
    </>
  );
}
