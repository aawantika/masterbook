import { useEffect, useState } from 'react';
import {
  deleteRecipe,
  fetchRecipeFromUrl,
  getCuisines,
  getMealTypes,
  getRecipe,
  setFavorite,
  setWantToTry,
  updateRecipe
} from '../api/client';
import { MetaItem, RecipeDetail, RecipeDraft, SourceType } from '../api/types';
import { parseBaseServings, scaleQuantityString } from '../scaleQuantity';
import { isUnfetchableRecipeUrl } from '../sourceUrl';
import { RecipeDraftEditor } from './RecipeDraftEditor';

type RecipeDetailPanelProps = {
  recipeId: number;
  onDeleted: () => void;
  onChanged: () => void;
};

type IngredientDisplayGroup = { section: string | null; items: RecipeDetail['ingredients'] };

function groupIngredientsForDisplay(ingredients: RecipeDetail['ingredients']): IngredientDisplayGroup[] {
  const groups: IngredientDisplayGroup[] = [];
  for (const ing of ingredients) {
    const last = groups[groups.length - 1];
    if (last && last.section === ing.section) {
      last.items.push(ing);
    } else {
      groups.push({ section: ing.section, items: [ing] });
    }
  }
  return groups;
}

type InstructionDisplayGroup = { section: string | null; items: RecipeDetail['instructions'] };

// Renders each section ("To Make the Tartar Sauce") as its own numbered
// list, restarting at 1 — matching how the source site itself presents
// sub-recipes, and making clear these are a distinct sequence rather than a
// continuation of the main steps.
function groupInstructionsForDisplay(instructions: RecipeDetail['instructions']): InstructionDisplayGroup[] {
  const groups: InstructionDisplayGroup[] = [];
  for (const step of instructions) {
    const last = groups[groups.length - 1];
    if (last && last.section === step.section) {
      last.items.push(step);
    } else {
      groups.push({ section: step.section, items: [step] });
    }
  }
  return groups;
}

export function RecipeDetailPanel({ recipeId, onDeleted, onChanged }: RecipeDetailPanelProps) {
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [mealTypes, setMealTypes] = useState<MetaItem[]>([]);
  const [cuisines, setCuisines] = useState<MetaItem[]>([]);
  const [editing, setEditing] = useState(false);
  const [targetServings, setTargetServings] = useState<number | null>(null);
  const [refreshedDraft, setRefreshedDraft] = useState<RecipeDraft | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const load = async () => {
    const [r, mt, c] = await Promise.all([getRecipe(recipeId), getMealTypes(), getCuisines()]);
    setRecipe(r);
    setMealTypes(mt);
    setCuisines(c);
  };

  useEffect(() => {
    setEditing(false);
    setTargetServings(null);
    setRefreshedDraft(null);
    setRefreshError(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId]);

  if (!recipe) return <div className="muted">Loading...</div>;

  const baseServings = parseBaseServings(recipe.servings);
  const scaleFactor = baseServings && targetServings ? targetServings / baseServings : 1;

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${recipe.title}"? This can't be undone.`)) return;
    await deleteRecipe(recipe.id);
    onDeleted();
  };

  const handleToggleWantToTry = async () => {
    await setWantToTry(recipe.id, !recipe.wantToTryAt);
    load();
    onChanged();
  };

  const handleToggleFavorite = async () => {
    await setFavorite(recipe.id, !recipe.favoritedAt);
    load();
    onChanged();
  };

  // Re-runs the site fetch/parse against the recipe's original source link,
  // then opens the editor pre-filled with the fresh result — the point is
  // to pick up parser bug fixes (like a since-fixed ingredient section)
  // without having to delete and re-add the whole recipe. Notes/meal
  // types/cuisines are the user's own curation, not something parsing
  // produces, so those stay untouched; only the content fields (title,
  // ingredients, instructions, servings, time, image) come from the fresh
  // fetch. Nothing is saved until the user reviews and hits "Save changes".
  const handleRefreshFromSource = async () => {
    if (!recipe.sourceRef) return;
    setRefreshError(null);
    setRefreshing(true);
    try {
      const fresh = await fetchRecipeFromUrl(recipe.sourceRef);
      setRefreshedDraft(fresh);
      setEditing(true);
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : 'Failed to refresh from source.');
    } finally {
      setRefreshing(false);
    }
  };

  const canRefreshFromSource =
    recipe.sourceType === 'website' &&
    !!recipe.sourceRef &&
    /^https?:\/\//i.test(recipe.sourceRef) &&
    !isUnfetchableRecipeUrl(recipe.sourceRef);

  if (editing) {
    const editorInitial = refreshedDraft
      ? {
          title: refreshedDraft.title,
          servings: refreshedDraft.servings ?? recipe.servings,
          totalTimeMinutes: refreshedDraft.totalTimeMinutes ?? recipe.totalTimeMinutes,
          instructions: refreshedDraft.instructions,
          ingredients: refreshedDraft.ingredients,
          rawText: refreshedDraft.rawText,
          sourceType: recipe.sourceType as SourceType,
          sourceRef: recipe.sourceRef,
          sourceName: refreshedDraft.sourceName ?? recipe.sourceName,
          imageUrl: refreshedDraft.imageUrl ?? recipe.imageUrl,
          notes: recipe.notes,
          mealTypeIds: recipe.mealTypeIds,
          cuisineNames: recipe.cuisineNames
        }
      : {
          title: recipe.title,
          servings: recipe.servings,
          totalTimeMinutes: recipe.totalTimeMinutes,
          instructions: recipe.instructions,
          ingredients: recipe.ingredients,
          rawText: recipe.rawText,
          sourceType: recipe.sourceType as SourceType,
          sourceRef: recipe.sourceRef,
          sourceName: recipe.sourceName,
          imageUrl: recipe.imageUrl,
          notes: recipe.notes,
          mealTypeIds: recipe.mealTypeIds,
          cuisineNames: recipe.cuisineNames
        };

    return (
      <div className="detail-panel">
        <h1>Edit recipe</h1>
        {refreshedDraft && (
          <div className="editor-notice">Showing a fresh parse from the source link — review before saving.</div>
        )}
        <RecipeDraftEditor
          initial={editorInitial}
          mealTypes={mealTypes}
          cuisineSuggestions={cuisines}
          saveLabel="Save changes"
          onSave={async (input) => {
            await updateRecipe(recipe.id, input);
            setEditing(false);
            setRefreshedDraft(null);
            load();
            onChanged();
          }}
          onCancel={() => {
            setEditing(false);
            setRefreshedDraft(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="detail-panel">
      <div className="recipe-detail-header">
        <h1>{recipe.title}</h1>
        <div className="recipe-card-toggles">
          <button
            type="button"
            className={`heart-toggle${recipe.favoritedAt ? ' active' : ''}`}
            onClick={handleToggleFavorite}
          >
            <span className="heart-glyph">♥</span> {recipe.favoritedAt ? 'Favorited' : 'Favorite'}
          </button>
          <button
            type="button"
            className={`star-toggle${recipe.wantToTryAt ? ' active' : ''}`}
            onClick={handleToggleWantToTry}
          >
            {recipe.wantToTryAt ? '★ In queue' : '☆ Add to queue'}
          </button>
        </div>
      </div>

      {recipe.imageUrl && (
        <div className="recipe-detail-image-wrap">
          <img className="recipe-detail-image" src={recipe.imageUrl} alt={recipe.title} />
        </div>
      )}

      <div className="recipe-detail-meta">
        {recipe.servings && <span>Serves {recipe.servings}</span>}
        {baseServings != null && (
          <span className="servings-scaler">
            Scale to
            <button
              type="button"
              onClick={() => setTargetServings(Math.max(1, (targetServings ?? baseServings) - 1))}
            >
              −
            </button>
            <input
              type="number"
              min={1}
              value={targetServings ?? baseServings}
              onChange={(e) => {
                const n = Number(e.target.value);
                setTargetServings(Number.isFinite(n) && n > 0 ? n : baseServings);
              }}
            />
            <button type="button" onClick={() => setTargetServings((targetServings ?? baseServings) + 1)}>
              +
            </button>
            {targetServings != null && targetServings !== baseServings && (
              <button type="button" className="link-button" onClick={() => setTargetServings(null)}>
                Reset
              </button>
            )}
          </span>
        )}
        {recipe.totalTimeMinutes != null && <span>Total time {recipe.totalTimeMinutes} min</span>}
        <span className="badge">{recipe.sourceName || recipe.sourceType}</span>
        {recipe.sourceRef &&
          (/^https?:\/\//i.test(recipe.sourceRef) ? (
            <a href={recipe.sourceRef} target="_blank" rel="noopener noreferrer" className="muted source-link">
              {recipe.sourceRef}
            </a>
          ) : (
            <span className="muted">{recipe.sourceRef}</span>
          ))}
      </div>

      <div className="recipe-detail-body">
        <div className="recipe-ingredients">
          <h3>Ingredients</h3>
          {groupIngredientsForDisplay(recipe.ingredients).map((group, groupIndex) => (
            <div className="ingredient-display-group" key={groupIndex}>
              {group.section && <h4 className="ingredient-section-heading">{group.section}</h4>}
              <ul>
                {group.items.map((ing, i) => {
                  const text =
                    scaleFactor !== 1
                      ? [scaleQuantityString(ing.quantity, scaleFactor), ing.unit, ing.name].filter(Boolean).join(' ')
                      : ing.rawText || [ing.quantity, ing.unit, ing.name].filter(Boolean).join(' ');
                  return <li key={i}>{text}</li>;
                })}
              </ul>
            </div>
          ))}
        </div>
        <div className="recipe-instructions">
          <h3>Instructions</h3>
          {groupInstructionsForDisplay(recipe.instructions).map((group, groupIndex) => (
            <div className="instruction-display-group" key={groupIndex}>
              {group.section && <h4 className="instruction-section-heading">{group.section}</h4>}
              <ol>
                {group.items.map((step, i) => (
                  <li key={i}>{step.text}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </div>

      {recipe.notes && (
        <div className="recipe-notes">
          <h3>Notes</h3>
          <p>{recipe.notes}</p>
        </div>
      )}

      {refreshError && <div className="editor-error">{refreshError}</div>}

      <div className="recipe-detail-actions">
        <button type="button" onClick={() => setEditing(true)}>
          Edit
        </button>
        {canRefreshFromSource && (
          <button type="button" className="secondary" onClick={handleRefreshFromSource} disabled={refreshing}>
            {refreshing ? 'Refreshing...' : '↻ Refresh from source'}
          </button>
        )}
        <button type="button" className="danger" onClick={handleDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}
