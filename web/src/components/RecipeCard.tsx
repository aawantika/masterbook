import { RecipeSummary } from '../api/types';

type RecipeCardProps = {
  recipe: RecipeSummary;
  onToggleWantToTry: (id: number, want: boolean) => void;
  onToggleFavorite: (id: number, favorite: boolean) => void;
  onSelect: (id: number) => void;
};

export function RecipeCard({ recipe, onToggleWantToTry, onToggleFavorite, onSelect }: RecipeCardProps) {
  const inQueue = Boolean(recipe.wantToTryAt);
  const isFavorite = Boolean(recipe.favoritedAt);

  return (
    <div className="recipe-card">
      {recipe.imageUrl && (
        <button type="button" className="recipe-card-image-button" onClick={() => onSelect(recipe.id)}>
          <img className="recipe-card-image" src={recipe.imageUrl} alt="" />
        </button>
      )}
      <div className="recipe-card-header">
        <button type="button" className="recipe-card-title" onClick={() => onSelect(recipe.id)}>
          {recipe.title}
        </button>
        <div className="recipe-card-toggles">
          <button
            type="button"
            className={`heart-toggle${isFavorite ? ' active' : ''}`}
            onClick={() => onToggleFavorite(recipe.id, !isFavorite)}
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            {isFavorite ? '❤' : '♡'}
          </button>
          <button
            type="button"
            className={`star-toggle${inQueue ? ' active' : ''}`}
            onClick={() => onToggleWantToTry(recipe.id, !inQueue)}
            title={inQueue ? 'Remove from queue' : 'Add to queue'}
          >
            {inQueue ? '★' : '☆'}
          </button>
        </div>
      </div>
      <div className="recipe-card-meta">
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
      <div className="recipe-card-footer">
        {recipe.avgRating != null ? (
          <span>★ {recipe.avgRating.toFixed(1)} avg</span>
        ) : (
          <span className="muted">Not yet rated</span>
        )}
        {recipe.lastCookedAt && <span className="muted">Last made {recipe.lastCookedAt.slice(0, 10)}</span>}
      </div>
    </div>
  );
}
