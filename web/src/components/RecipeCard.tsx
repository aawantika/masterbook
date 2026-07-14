import { Link } from 'react-router-dom';
import { RecipeSummary } from '../api/types';

type RecipeCardProps = {
  recipe: RecipeSummary;
  onToggleWantToTry: (id: number, want: boolean) => void;
};

export function RecipeCard({ recipe, onToggleWantToTry }: RecipeCardProps) {
  const wantsToTry = Boolean(recipe.wantToTryAt);

  return (
    <div className="recipe-card">
      <div className="recipe-card-header">
        <Link to={`/recipes/${recipe.id}`} className="recipe-card-title">
          {recipe.title}
        </Link>
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
