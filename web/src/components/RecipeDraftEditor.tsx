import { useState } from 'react';
import { MetaItem, ParsedIngredientLine, RecipeInput, SourceType } from '../api/types';

type RecipeDraftEditorProps = {
  initial?: Partial<RecipeInput>;
  mealTypes: MetaItem[];
  cuisineSuggestions: MetaItem[];
  onSave: (input: RecipeInput) => Promise<void>;
  onCancel?: () => void;
  saveLabel?: string;
};

function emptyIngredient(): ParsedIngredientLine {
  return { rawText: '', quantity: null, unit: null, name: '' };
}

export function RecipeDraftEditor({
  initial,
  mealTypes,
  cuisineSuggestions,
  onSave,
  onCancel,
  saveLabel = 'Save recipe'
}: RecipeDraftEditorProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [servings, setServings] = useState(initial?.servings ?? '');
  const [prepTimeMinutes, setPrepTimeMinutes] = useState<string>(
    initial?.prepTimeMinutes != null ? String(initial.prepTimeMinutes) : ''
  );
  const [cookTimeMinutes, setCookTimeMinutes] = useState<string>(
    initial?.cookTimeMinutes != null ? String(initial.cookTimeMinutes) : ''
  );
  const [ingredients, setIngredients] = useState<ParsedIngredientLine[]>(
    initial?.ingredients && initial.ingredients.length > 0 ? initial.ingredients : [emptyIngredient()]
  );
  const [instructions, setInstructions] = useState<string[]>(
    initial?.instructions && initial.instructions.length > 0 ? initial.instructions : ['']
  );
  const [mealTypeIds, setMealTypeIds] = useState<Set<number>>(new Set(initial?.mealTypeIds ?? []));
  const [cuisineText, setCuisineText] = useState((initial?.cuisineNames ?? []).join(', '));
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [sourceType] = useState<SourceType>(initial?.sourceType ?? 'manual');
  const [sourceRef, setSourceRef] = useState(initial?.sourceRef ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateIngredient = (index: number, patch: Partial<ParsedIngredientLine>) => {
    setIngredients((prev) => prev.map((ing, i) => (i === index ? { ...ing, ...patch } : ing)));
  };

  const removeIngredient = (index: number) => {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  };

  const updateInstruction = (index: number, value: string) => {
    setInstructions((prev) => prev.map((step, i) => (i === index ? value : step)));
  };

  const removeInstruction = (index: number) => {
    setInstructions((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleMealType = (id: number) => {
    setMealTypeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setError(null);
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    setSaving(true);
    try {
      const cleanedIngredients = ingredients
        .filter((ing) => ing.name.trim() || ing.rawText.trim())
        .map((ing) => ({ ...ing, rawText: ing.rawText || [ing.quantity, ing.unit, ing.name].filter(Boolean).join(' ') }));
      const cleanedInstructions = instructions.map((step) => step.trim()).filter(Boolean);
      const cuisineNames = cuisineText
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);

      const input: RecipeInput = {
        title: title.trim(),
        servings: servings.trim() || null,
        prepTimeMinutes: prepTimeMinutes.trim() ? Number(prepTimeMinutes) : null,
        cookTimeMinutes: cookTimeMinutes.trim() ? Number(cookTimeMinutes) : null,
        instructions: cleanedInstructions,
        ingredients: cleanedIngredients,
        rawText: initial?.rawText ?? '',
        sourceType,
        sourceRef: sourceRef.trim() || null,
        notes: notes.trim() || null,
        mealTypeIds: Array.from(mealTypeIds),
        cuisineNames
      };
      await onSave(input);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save recipe.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="recipe-editor">
      {error && <div className="editor-error">{error}</div>}

      <label className="field">
        <span>Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Recipe title" />
      </label>

      <div className="field-row">
        <label className="field">
          <span>Servings</span>
          <input value={servings ?? ''} onChange={(e) => setServings(e.target.value)} placeholder="e.g. 4" />
        </label>
        <label className="field">
          <span>Prep time (min)</span>
          <input
            type="number"
            min={0}
            value={prepTimeMinutes}
            onChange={(e) => setPrepTimeMinutes(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Cook time (min)</span>
          <input
            type="number"
            min={0}
            value={cookTimeMinutes}
            onChange={(e) => setCookTimeMinutes(e.target.value)}
          />
        </label>
      </div>

      <label className="field">
        <span>Source (URL, book title, etc.)</span>
        <input value={sourceRef ?? ''} onChange={(e) => setSourceRef(e.target.value)} placeholder="Optional" />
      </label>

      <fieldset className="field">
        <legend>Meal type</legend>
        <div className="chip-checkbox-row">
          {mealTypes.map((mt) => (
            <label key={mt.id} className={`chip-checkbox${mealTypeIds.has(mt.id) ? ' active' : ''}`}>
              <input type="checkbox" checked={mealTypeIds.has(mt.id)} onChange={() => toggleMealType(mt.id)} />
              {mt.name}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span>Cuisine (comma-separated)</span>
        <input
          value={cuisineText}
          onChange={(e) => setCuisineText(e.target.value)}
          placeholder="e.g. Italian, Fusion"
          list="cuisine-suggestions"
        />
        <datalist id="cuisine-suggestions">
          {cuisineSuggestions.map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>
      </label>

      <div className="field">
        <span>Ingredients</span>
        {ingredients.map((ingredient, index) => (
          <div className="ingredient-row" key={index}>
            <input
              className="ingredient-quantity"
              value={ingredient.quantity ?? ''}
              onChange={(e) => updateIngredient(index, { quantity: e.target.value })}
              placeholder="qty"
            />
            <input
              className="ingredient-unit"
              value={ingredient.unit ?? ''}
              onChange={(e) => updateIngredient(index, { unit: e.target.value })}
              placeholder="unit"
            />
            <input
              className="ingredient-name"
              value={ingredient.name}
              onChange={(e) => updateIngredient(index, { name: e.target.value })}
              placeholder="ingredient"
            />
            <button type="button" onClick={() => removeIngredient(index)} title="Remove ingredient">
              ×
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setIngredients((prev) => [...prev, emptyIngredient()])}>
          + Add ingredient
        </button>
      </div>

      <div className="field">
        <span>Instructions</span>
        {instructions.map((step, index) => (
          <div className="instruction-row" key={index}>
            <span className="instruction-index">{index + 1}.</span>
            <textarea
              value={step}
              onChange={(e) => updateInstruction(index, e.target.value)}
              placeholder={`Step ${index + 1}`}
              rows={2}
            />
            <button type="button" onClick={() => removeInstruction(index)} title="Remove step">
              ×
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setInstructions((prev) => [...prev, ''])}>
          + Add step
        </button>
      </div>

      <label className="field">
        <span>Notes</span>
        <textarea value={notes ?? ''} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </label>

      <div className="editor-actions">
        <button type="button" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : saveLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={saving} className="secondary">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
