import { useEffect, useRef, useState } from 'react';
import {
  deleteRecipe,
  fetchRecipeFromUrl,
  getCuisines,
  getMealTypes,
  getRecipe,
  setFavorite,
  setNeedsFixing,
  setWantToTry,
  updateRecipe
} from '../api/client';
import { MetaItem, RecipeDetail, RecipeDraft, SourceType } from '../api/types';
import { parseBaseServings, scaleQuantityString } from '../scaleQuantity';
import { getVideoEmbed } from '../sourceUrl';
import { useAuth } from '../auth/AuthContext';
import { RecipeDraftEditor } from './RecipeDraftEditor';
import { Button } from './Button';
import { ConfirmDialog } from './ConfirmDialog';

type RecipeDetailPanelProps = {
  recipeId: number;
  onDeleted: () => void;
  onChanged: () => void;
  // Lets the parent (RecipeDetailPage) know when the editor form is showing
  // in place of the normal detail view -- it hides the cooking-log section
  // it renders below this panel while editing, since a log entry sitting
  // underneath a half-finished edit form read as part of the editor.
  onEditingChange?: (editing: boolean) => void;
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

export function RecipeDetailPanel({ recipeId, onDeleted, onChanged, onEditingChange }: RecipeDetailPanelProps) {
  const { user } = useAuth();
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [mealTypes, setMealTypes] = useState<MetaItem[]>([]);
  const [cuisines, setCuisines] = useState<MetaItem[]>([]);
  const [editing, setEditingState] = useState(false);
  const setEditing = (value: boolean) => {
    setEditingState(value);
    onEditingChange?.(value);
  };
  const [targetServings, setTargetServings] = useState<number | null>(null);
  const [refreshedDraft, setRefreshedDraft] = useState<RecipeDraft | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Purely local display state -- which sectioned ingredient/instruction
  // groups are collapsed. Deliberately not saved anywhere (not to the
  // recipe, not to localStorage): a fresh mount always starts with
  // everything expanded, same as a page refresh.
  const [collapsedIngredientGroups, setCollapsedIngredientGroups] = useState<Set<number>>(new Set());
  const [collapsedInstructionGroups, setCollapsedInstructionGroups] = useState<Set<number>>(new Set());

  // Guards against a real race: navigating from recipe A to recipe B fires
  // a fetch for B, but the in-flight fetch for A (already pending) can
  // still resolve *after* B's if the network reorders them -- without this
  // check, A's stale response would land last and overwrite B's correct
  // one, silently showing the wrong recipe/favorite-state. Bumped every
  // time recipeId changes; a response is only applied if it's still for
  // the current recipeId when it comes back.
  const loadTokenRef = useRef(0);

  const load = async () => {
    const token = ++loadTokenRef.current;
    const [r, mt, c] = await Promise.all([getRecipe(recipeId), getMealTypes(), getCuisines()]);
    if (token !== loadTokenRef.current) return; // a newer navigation has already happened
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

  // A recipe can have a written source (sourceRef) and a separate video
  // (videoRef) at once — e.g. a blog post plus its companion YouTube demo.
  // Fall back to sourceRef itself for older/simpler recipes where the video
  // IS the source (a plain Instagram/YouTube link with no separate write-up).
  const videoEmbed = getVideoEmbed(recipe.videoRef) ?? getVideoEmbed(recipe.sourceRef);
  const baseServings = parseBaseServings(recipe.servings);
  const scaleFactor = baseServings && targetServings ? targetServings / baseServings : 1;

  const toggleCollapsedGroup = (setter: React.Dispatch<React.SetStateAction<Set<number>>>, groupIndex: number) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(groupIndex)) next.delete(groupIndex);
      else next.add(groupIndex);
      return next;
    });
  };

  const handleDelete = () => setConfirmingDelete(true);

  const confirmDelete = async () => {
    setConfirmingDelete(false);
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

  const handleToggleNeedsFixing = async () => {
    await setNeedsFixing(recipe.id, !recipe.needsFixingAt);
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

  // Temporarily disabled while a source-refresh parsing issue gets sorted
  // out -- was: recipe.sourceType === 'website' && !!recipe.sourceRef &&
  // /^https?:\/\//i.test(recipe.sourceRef) && !isUnfetchableRecipeUrl(recipe.sourceRef)
  const canRefreshFromSource = false;

  // UX mirror of the server's canDeleteRecipe/canEditRecipe checks
  // (server/src/auth/permissions.ts) -- the server is what actually
  // enforces this, this just avoids showing a button that would 403 if
  // clicked. Both currently use the same rule (owner or admin), but kept
  // as separate consts since the server exposes them as separate functions.
  const canDelete = !!user && (user.role === 'admin' || recipe.ownerId === user.id);
  const canEdit = !!user && (user.role === 'admin' || recipe.ownerId === user.id);

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
          videoRef: recipe.videoRef,
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
          videoRef: recipe.videoRef,
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
            ❤️ {recipe.favoritedAt ? 'Favorited' : 'Favorite'}
          </button>
          <button
            type="button"
            className={`star-toggle${recipe.wantToTryAt ? ' active' : ''}`}
            onClick={handleToggleWantToTry}
          >
            {recipe.wantToTryAt ? '★ In queue' : '☆ Add to queue'}
          </button>
          <button
            type="button"
            className={`fix-toggle${recipe.needsFixingAt ? ' active' : ''}`}
            onClick={handleToggleNeedsFixing}
          >
            🛠️ {recipe.needsFixingAt ? 'Needs fixing' : 'Mark as needs fixing'}
          </button>
        </div>
      </div>

      <div className="recipe-detail-top-row">
        <div className="recipe-detail-info-column">
          {recipe.totalTimeMinutes != null && <div>Total time {recipe.totalTimeMinutes} min</div>}
          {/* A static "Serves X" line alongside the scaler was redundant --
              the scaler's own input already shows the current count. Only
              fall back to plain text when servings isn't a parseable number
              (e.g. "4-6"), since then there's nothing to scale at all. */}
          {baseServings != null ? (
            <div className="servings-scaler">
              Serves
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
            </div>
          ) : (
            recipe.servings && <div>Serves {recipe.servings}</div>
          )}

          {/* Descriptive metadata about the recipe -- what it is, categorically. */}
          <div>
            <span className="badge">{recipe.sourceName || recipe.sourceType}</span>
          </div>
          {recipe.ownerName && <div className="muted">Added by {recipe.ownerName}</div>}
          {recipe.mealTypeIds.length > 0 && (
            <div className="badge-row">
              {mealTypes
                .filter((mt) => recipe.mealTypeIds.includes(mt.id))
                .map((mt) => (
                  <span className="badge" key={mt.id}>
                    {mt.name}
                  </span>
                ))}
            </div>
          )}
          {recipe.cuisineNames.length > 0 && (
            <div className="badge-row">
              {recipe.cuisineNames.map((c) => (
                <span className="badge badge-cuisine" key={c}>
                  {c}
                </span>
              ))}
            </div>
          )}

          {/* Clickable links -- where to go, not what it is. */}
          {(recipe.sourceRef || recipe.videoRef) && (
            <div className="info-column-group">
              {recipe.sourceRef &&
                (/^https?:\/\//i.test(recipe.sourceRef) ? (
                  <a href={recipe.sourceRef} target="_blank" rel="noopener noreferrer" className="muted source-link">
                    🔗 Recipe
                  </a>
                ) : (
                  <span className="muted">{recipe.sourceRef}</span>
                ))}
              {recipe.videoRef && (
                <a href={recipe.videoRef} target="_blank" rel="noopener noreferrer" className="muted source-link">
                  ▶ Video ({getVideoEmbed(recipe.videoRef)?.platform === 'instagram' ? 'Instagram' : 'YouTube'})
                </a>
              )}
            </div>
          )}

          <div className="recipe-detail-actions info-column-group">
            {canEdit && (
              <Button variant="primary" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            {canRefreshFromSource && (
              <Button variant="secondary" onClick={handleRefreshFromSource} disabled={refreshing}>
                {refreshing ? 'Refreshing...' : '↻ Refresh from source'}
              </Button>
            )}
            {canDelete && (
              <Button variant="danger" onClick={handleDelete}>
                Delete
              </Button>
            )}
          </div>
        </div>

        {confirmingDelete && (
          <ConfirmDialog
            title="Delete this recipe?"
            message={`"${recipe.title}" will be permanently deleted. This can't be undone.`}
            confirmLabel="Delete"
            onConfirm={confirmDelete}
            onCancel={() => setConfirmingDelete(false)}
          />
        )}

        {recipe.imageUrl && (
          <div className="recipe-detail-image-wrap">
            <img className="recipe-detail-image" src={recipe.imageUrl} alt={recipe.title} />
          </div>
        )}
        {videoEmbed && (
          <div className="recipe-detail-video-col">
            <div className="recipe-detail-video-wrap">
              <iframe
                className="recipe-detail-video"
                style={{ aspectRatio: videoEmbed.aspectRatio }}
                src={videoEmbed.url}
                title={recipe.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                loading="lazy"
              />
            </div>
            {/* Instagram's embed shows a login prompt (not an error, no
                onError-detectable failure) to anyone not logged into
                Instagram in that browser -- there's no reliable way to
                detect that from the parent page (cross-origin iframe, the
                embed still "loads" successfully), so this is said upfront
                instead of the video just silently reading as a black box. */}
            {videoEmbed.platform === 'instagram' && (
              <div className="video-embed-note muted">
                Blank box or login prompt instead of the video? Instagram requires being logged in for embeds --{' '}
                <a href={recipe.videoRef ?? recipe.sourceRef ?? '#'} target="_blank" rel="noopener noreferrer">
                  open it on Instagram directly
                </a>{' '}
                instead.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="recipe-detail-body">
        <div className="recipe-ingredients">
          <h3>Ingredients</h3>
          {groupIngredientsForDisplay(recipe.ingredients).map((group, groupIndex) => {
            const collapsed = collapsedIngredientGroups.has(groupIndex);
            return (
              <div className="ingredient-display-group" key={groupIndex}>
                {group.section && (
                  <button
                    type="button"
                    className="section-collapse-toggle ingredient-section-heading"
                    onClick={() => toggleCollapsedGroup(setCollapsedIngredientGroups, groupIndex)}
                  >
                    <span className="section-collapse-caret">{collapsed ? '▸' : '▾'}</span>
                    {group.section}
                  </button>
                )}
                {!collapsed && (
                  <ul>
                    {group.items.map((ing, i) => {
                      // "nos"/"no" is a bare count, not a real unit word —
                      // kept as the stored value, but left out of the
                      // display text.
                      const displayUnit = ing.unit === 'nos' ? null : ing.unit;
                      const text =
                        scaleFactor !== 1
                          ? [scaleQuantityString(ing.quantity, scaleFactor), displayUnit, ing.name]
                              .filter(Boolean)
                              .join(' ')
                          : ing.rawText || [ing.quantity, displayUnit, ing.name].filter(Boolean).join(' ');
                      return <li key={i}>{text}</li>;
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
        <div className="recipe-instructions">
          <h3>Instructions</h3>
          {groupInstructionsForDisplay(recipe.instructions).map((group, groupIndex) => {
            const collapsed = collapsedInstructionGroups.has(groupIndex);
            return (
              <div className="instruction-display-group" key={groupIndex}>
                {group.section && (
                  <button
                    type="button"
                    className="section-collapse-toggle instruction-section-heading"
                    onClick={() => toggleCollapsedGroup(setCollapsedInstructionGroups, groupIndex)}
                  >
                    <span className="section-collapse-caret">{collapsed ? '▸' : '▾'}</span>
                    {group.section}
                  </button>
                )}
                {!collapsed && (
                  <ol>
                    {group.items.map((step, i) => (
                      <li key={i}>{step.text}</li>
                    ))}
                  </ol>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {recipe.notes && (
        <div className="recipe-notes">
          <h3>Notes</h3>
          <p>{recipe.notes}</p>
        </div>
      )}

      {refreshError && <div className="editor-error">{refreshError}</div>}
    </div>
  );
}
