import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  addAttempt,
  deleteAttempt,
  deleteRecipe,
  getCuisines,
  getMealTypes,
  getRecipe,
  setWantToTry,
  updateRecipe
} from '../api/client';
import { MetaItem, RecipeDetail, SourceType } from '../api/types';
import { RecipeDraftEditor } from '../components/RecipeDraftEditor';
import { CookingLogList } from '../components/CookingLogList';

export function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const recipeId = Number(id);
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [mealTypes, setMealTypes] = useState<MetaItem[]>([]);
  const [cuisines, setCuisines] = useState<MetaItem[]>([]);
  const [editing, setEditing] = useState(false);

  const load = async () => {
    const [r, mt, c] = await Promise.all([getRecipe(recipeId), getMealTypes(), getCuisines()]);
    setRecipe(r);
    setMealTypes(mt);
    setCuisines(c);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId]);

  if (!recipe) return <div className="page muted">Loading...</div>;

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${recipe.title}"? This can't be undone.`)) return;
    await deleteRecipe(recipe.id);
    navigate('/');
  };

  const handleToggleWantToTry = async () => {
    await setWantToTry(recipe.id, !recipe.wantToTryAt);
    load();
  };

  if (editing) {
    return (
      <div className="page">
        <header className="page-header">
          <h1>Edit recipe</h1>
        </header>
        <RecipeDraftEditor
          initial={{
            title: recipe.title,
            servings: recipe.servings,
            prepTimeMinutes: recipe.prepTimeMinutes,
            cookTimeMinutes: recipe.cookTimeMinutes,
            instructions: recipe.instructions,
            ingredients: recipe.ingredients,
            rawText: recipe.rawText,
            sourceType: recipe.sourceType as SourceType,
            sourceRef: recipe.sourceRef,
            notes: recipe.notes,
            mealTypeIds: recipe.mealTypeIds,
            cuisineNames: recipe.cuisineNames
          }}
          mealTypes={mealTypes}
          cuisineSuggestions={cuisines}
          saveLabel="Save changes"
          onSave={async (input) => {
            await updateRecipe(recipe.id, input);
            setEditing(false);
            load();
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <Link to="/" className="back-link">
          ← Back to search
        </Link>
      </header>

      <div className="recipe-detail-header">
        <h1>{recipe.title}</h1>
        <button
          type="button"
          className={`star-toggle${recipe.wantToTryAt ? ' active' : ''}`}
          onClick={handleToggleWantToTry}
        >
          {recipe.wantToTryAt ? '★ Want to try' : '☆ Want to try'}
        </button>
      </div>

      <div className="recipe-detail-meta">
        {recipe.servings && <span>Serves {recipe.servings}</span>}
        {recipe.prepTimeMinutes != null && <span>Prep {recipe.prepTimeMinutes} min</span>}
        {recipe.cookTimeMinutes != null && <span>Cook {recipe.cookTimeMinutes} min</span>}
        <span className="badge">{recipe.sourceType}</span>
        {recipe.sourceRef && <span className="muted">{recipe.sourceRef}</span>}
      </div>

      <div className="recipe-detail-body">
        <div className="recipe-ingredients">
          <h3>Ingredients</h3>
          <ul>
            {recipe.ingredients.map((ing, i) => (
              <li key={i}>{ing.rawText || [ing.quantity, ing.unit, ing.name].filter(Boolean).join(' ')}</li>
            ))}
          </ul>
        </div>
        <div className="recipe-instructions">
          <h3>Instructions</h3>
          <ol>
            {recipe.instructions.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      </div>

      {recipe.notes && (
        <div className="recipe-notes">
          <h3>Notes</h3>
          <p>{recipe.notes}</p>
        </div>
      )}

      <div className="recipe-detail-actions">
        <button type="button" onClick={() => setEditing(true)}>
          Edit
        </button>
        <button type="button" className="danger" onClick={handleDelete}>
          Delete
        </button>
      </div>

      <CookingLogList
        attempts={recipe.attempts}
        onAddAttempt={async (attemptedAt, rating, notes) => {
          await addAttempt(recipe.id, attemptedAt, rating, notes);
          load();
        }}
        onDeleteAttempt={async (attemptId) => {
          await deleteAttempt(attemptId);
          load();
        }}
      />
    </div>
  );
}
