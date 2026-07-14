import { useEffect, useState } from 'react';
import { createRecipe, fetchRecipeFromUrl, getCuisines, getMealTypes, parseManualPaste } from '../api/client';
import { MetaItem, RecipeDraft, RecipeInput, SourceType } from '../api/types';
import { RecipeDraftEditor } from './RecipeDraftEditor';

type ImportPanelProps = {
  onCreated: (recipeId: number) => void;
  onCancel: () => void;
};

export function ImportPanel({ onCreated, onCancel }: ImportPanelProps) {
  const [pasteText, setPasteText] = useState('');
  const [fetchUrl, setFetchUrl] = useState('');
  const [sourceType, setSourceType] = useState<SourceType>('instagram');
  const [sourceRef, setSourceRef] = useState('');
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [mealTypes, setMealTypes] = useState<MetaItem[]>([]);
  const [cuisines, setCuisines] = useState<MetaItem[]>([]);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchNotice, setFetchNotice] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getMealTypes(), getCuisines()]).then(([mt, c]) => {
      setMealTypes(mt);
      setCuisines(c);
    });
  }, []);

  const handleParse = async () => {
    if (!pasteText.trim()) return;
    const parsed = await parseManualPaste(pasteText);
    setDraft(parsed);
  };

  const handleFetch = async () => {
    if (!fetchUrl.trim()) return;
    setFetching(true);
    setFetchError(null);
    setFetchNotice(null);
    try {
      const result = await fetchRecipeFromUrl(fetchUrl.trim());
      setSourceRef(fetchUrl.trim());
      setDraft(result);
      if (!result.usedStructuredData) {
        setFetchNotice(
          "This page didn't have structured recipe data — split from the page text instead, so double-check it carefully."
        );
      }
    } catch (err) {
      setFetchError(
        err instanceof Error
          ? `${err.message}. Try pasting the recipe text instead.`
          : 'Failed to fetch that page. Try pasting the recipe text instead.'
      );
    } finally {
      setFetching(false);
    }
  };

  const handleSave = async (input: RecipeInput) => {
    const recipe = await createRecipe({ ...input, sourceType, sourceRef: sourceRef.trim() || null });
    onCreated(recipe.id);
  };

  return (
    <div className="detail-panel">
      <h1>Add a recipe</h1>

      {!draft ? (
        <div className="import-paste-box">
          <label className="field">
            <span>Source</span>
            <select value={sourceType} onChange={(e) => setSourceType(e.target.value as SourceType)}>
              <option value="instagram">Instagram</option>
              <option value="website">Website</option>
              <option value="manual">Manual</option>
            </select>
          </label>

          {sourceType === 'website' && (
            <>
              <label className="field">
                <span>Fetch from URL</span>
                <input
                  value={fetchUrl}
                  onChange={(e) => setFetchUrl(e.target.value)}
                  placeholder="https://www.example.com/some-recipe"
                />
              </label>
              {fetchError && <div className="editor-error">{fetchError}</div>}
              <button type="button" onClick={handleFetch} disabled={fetching}>
                {fetching ? 'Fetching...' : 'Fetch recipe'}
              </button>
              <div className="import-divider">— or paste the recipe text below —</div>
            </>
          )}

          <label className="field">
            <span>Source URL / reference (optional)</span>
            <input value={sourceRef} onChange={(e) => setSourceRef(e.target.value)} placeholder="https://..." />
          </label>
          <label className="field">
            <span>Paste recipe text</span>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={12}
              placeholder={'Title\n\nIngredients:\n1 cup flour\n...\n\nInstructions:\n1. Mix...\n...'}
            />
          </label>
          <div className="editor-actions">
            <button type="button" onClick={handleParse}>
              Parse recipe
            </button>
            <button type="button" className="secondary" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {fetchNotice && <div className="editor-notice">{fetchNotice}</div>}
          <RecipeDraftEditor
            initial={{
              ...draft,
              sourceType,
              sourceRef,
              mealTypeIds: [],
              cuisineNames: draft.cuisineNames ?? []
            }}
            mealTypes={mealTypes}
            cuisineSuggestions={cuisines}
            onSave={handleSave}
            onCancel={() => setDraft(null)}
          />
        </>
      )}
    </div>
  );
}
