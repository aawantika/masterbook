import { RecipeSummary } from '../api/types';

type RecipeListRowProps = {
  recipe: RecipeSummary;
  onToggleWantToTry: (id: number, want: boolean) => void;
  onToggleFavorite: (id: number, favorite: boolean) => void;
  onToggleNeedsFixing: (id: number, needsFixing: boolean) => void;
  onSelect: (id: number) => void;
};

// A denser alternative to RecipeCard for scanning many recipes at once --
// same data/actions, no image, one row per recipe instead of a card grid.
export function RecipeListRow({
  recipe,
  onToggleWantToTry,
  onToggleFavorite,
  onToggleNeedsFixing,
  onSelect
}: RecipeListRowProps) {
  const inQueue = Boolean(recipe.wantToTryAt);
  const isFavorite = Boolean(recipe.favoritedAt);
  const needsFixing = Boolean(recipe.needsFixingAt);

  return (
    <div className="recipe-list-row">
      <div className="recipe-card-toggles">
        <button
          type="button"
          className={`heart-toggle${isFavorite ? ' active' : ''}`}
          onClick={() => onToggleFavorite(recipe.id, !isFavorite)}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <span className="heart-glyph">♥</span>
        </button>
        <button
          type="button"
          className={`star-toggle${inQueue ? ' active' : ''}`}
          onClick={() => onToggleWantToTry(recipe.id, !inQueue)}
          title={inQueue ? 'Remove from queue' : 'Add to queue'}
        >
          {inQueue ? '★' : '☆'}
        </button>
        <button
          type="button"
          className={`fix-toggle${needsFixing ? ' active' : ''}`}
          onClick={() => onToggleNeedsFixing(recipe.id, !needsFixing)}
          title={needsFixing ? 'Marked as needs fixing' : 'Mark as needs fixing'}
        >
          🔧
        </button>
      </div>
      <button type="button" className="recipe-list-title" onClick={() => onSelect(recipe.id)}>
        {recipe.title}
      </button>
      <div className="recipe-list-badges">
        <span className="badge">{recipe.sourceName || recipe.sourceType}</span>
        {recipe.mealTypes.map((mt) => (
          <span className="badge" key={mt}>
            {mt}
          </span>
        ))}
        {recipe.cuisines.map((c) => (
          <span className="badge badge-cuisine" key={c}>
            {c}
          </span>
        ))}
      </div>
      <div className="recipe-list-footer">
        {recipe.avgRating != null ? (
          <span>★ {recipe.avgRating.toFixed(1)}</span>
        ) : (
          <span className="muted">Not yet rated</span>
        )}
      </div>
    </div>
  );
}
