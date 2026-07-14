import { RecipeSummary } from '../api/types';

type RecipeCardProps = {
  recipe: RecipeSummary;
  onToggleWantToTry: (id: number, want: boolean) => void;
  onSelect: (id: number) => void;
};

export function RecipeCard({ recipe, onToggleWantToTry, onSelect }: RecipeCardProps) {
  const wantsToTry = Boolean(recipe.wantToTryAt);

  return (
    <div className="recipe-card">
      <div className="recipe-card-header">
        <button type="button" className="recipe-card-title" onClick={() => onSelect(recipe.id)}>
          {recipe.title}
        </button>
        <button
          type="button"
          className={`star-toggle${wantsToTry ? ' active' : ''}`}
          onClick={() => onToggleWantToTry(recipe.id, !wantsToTry)}
          title={wantsToTry ? 'Remove from To Try queue' : 'Add to To Try queue'}
        >
          {wantsToTry ? '★' : '☆'}
        </button>
      </div>
      <div className="recipe-card-meta">
        <span className="badge">{recipe.sourceType}</span>
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
