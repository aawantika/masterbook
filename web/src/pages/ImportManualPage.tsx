import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRecipe, getCuisines, getMealTypes, parseManualPaste } from '../api/client';
import { MetaItem, RecipeDraft, RecipeInput, SourceType } from '../api/types';
import { RecipeDraftEditor } from '../components/RecipeDraftEditor';

export function ImportManualPage() {
  const navigate = useNavigate();
  const [pasteText, setPasteText] = useState('');
  const [sourceType, setSourceType] = useState<SourceType>('instagram');
  const [sourceRef, setSourceRef] = useState('');
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [mealTypes, setMealTypes] = useState<MetaItem[]>([]);
  const [cuisines, setCuisines] = useState<MetaItem[]>([]);

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

  const handleSave = async (input: RecipeInput) => {
    const recipe = await createRecipe({ ...input, sourceType, sourceRef: sourceRef.trim() || null });
    navigate(`/recipes/${recipe.id}`);
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Add a recipe</h1>
      </header>

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
          <button type="button" onClick={handleParse}>
            Parse recipe
          </button>
        </div>
      ) : (
        <RecipeDraftEditor
          initial={{ ...draft, sourceType, sourceRef, mealTypeIds: [], cuisineNames: [] }}
          mealTypes={mealTypes}
          cuisineSuggestions={cuisines}
          onSave={handleSave}
          onCancel={() => setDraft(null)}
        />
      )}
    </div>
  );
}
