import { useState } from 'react';
import { MetaItem, ParsedIngredientLine, RecipeInput, SourceType } from '../api/types';
import { CANONICAL_UNITS } from '../constants';
import { AutoGrowTextarea } from './AutoGrowTextarea';

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
  const [totalTimeMinutes, setTotalTimeMinutes] = useState<string>(
    initial?.totalTimeMinutes != null ? String(initial.totalTimeMinutes) : ''
  );
  const [ingredients, setIngredients] = useState<ParsedIngredientLine[]>(
    initial?.ingredients && initial.ingredients.length > 0 ? initial.ingredients : [emptyIngredient()]
  );
  const [instructions, setInstructions] = useState<string[]>(
    initial?.instructions && initial.instructions.length > 0 ? initial.instructions : ['']
  );
  const [mealTypeIds, setMealTypeIds] = useState<Set<number>>(new Set(initial?.mealTypeIds ?? []));
  const [cuisineNames, setCuisineNames] = useState<Set<string>>(new Set(initial?.cuisineNames ?? []));
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [sourceType] = useState<SourceType>(initial?.sourceType ?? 'manual');
  const [sourceRef, setSourceRef] = useState(initial?.sourceRef ?? '');
  const [sourceName, setSourceName] = useState(initial?.sourceName ?? '');
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? '');
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

  const toggleCuisine = (name: string) => {
    setCuisineNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
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

      const input: RecipeInput = {
        title: title.trim(),
        servings: servings.trim() || null,
        totalTimeMinutes: totalTimeMinutes.trim() ? Number(totalTimeMinutes) : null,
        instructions: cleanedInstructions,
        ingredients: cleanedIngredients,
        rawText: initial?.rawText ?? '',
        sourceType,
        sourceRef: sourceRef.trim() || null,
        sourceName: sourceName.trim() || null,
        imageUrl: imageUrl.trim() || null,
        notes: notes.trim() || null,
        mealTypeIds: Array.from(mealTypeIds),
        cuisineNames: Array.from(cuisineNames)
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
          <span>Total time (min)</span>
          <input
            type="number"
            min={0}
            value={totalTimeMinutes}
            onChange={(e) => setTotalTimeMinutes(e.target.value)}
          />
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span>Source name</span>
          <input
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
            placeholder="e.g. The Woks of Life, @handle, cookbook title"
          />
        </label>
        <label className="field">
          <span>Source link</span>
          <input value={sourceRef ?? ''} onChange={(e) => setSourceRef(e.target.value)} placeholder="Optional" />
        </label>
      </div>

      <label className="field">
        <span>Image URL</span>
        <input
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://... (optional — never downloaded, just linked)"
        />
        {imageUrl.trim() && <img className="editor-image-preview" src={imageUrl.trim()} alt="" />}
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

      <fieldset className="field">
        <legend>Cuisine</legend>
        <div className="chip-checkbox-row">
          {cuisineSuggestions.map((c) => (
            <label key={c.id} className={`chip-checkbox${cuisineNames.has(c.name) ? ' active' : ''}`}>
              <input type="checkbox" checked={cuisineNames.has(c.name)} onChange={() => toggleCuisine(c.name)} />
              {c.name}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <span>Ingredients</span>
        {ingredients.map((ingredient, index) => {
          const unitOptions =
            ingredient.unit && !CANONICAL_UNITS.includes(ingredient.unit)
              ? [ingredient.unit, ...CANONICAL_UNITS]
              : CANONICAL_UNITS;
          return (
            <div className="ingredient-row" key={index}>
              <input
                className="ingredient-quantity"
                value={ingredient.quantity ?? ''}
                onChange={(e) => updateIngredient(index, { quantity: e.target.value })}
                placeholder="qty"
              />
              <select
                className="ingredient-unit"
                value={ingredient.unit ?? ''}
                onChange={(e) => updateIngredient(index, { unit: e.target.value || null })}
              >
                <option value="">unit</option>
                {unitOptions.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
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
          );
        })}
        <button type="button" onClick={() => setIngredients((prev) => [...prev, emptyIngredient()])}>
          + Add ingredient
        </button>
      </div>

      <div className="field">
        <span>Instructions</span>
        {instructions.map((step, index) => (
          <div className="instruction-row" key={index}>
            <span className="instruction-index">{index + 1}.</span>
            <AutoGrowTextarea
              value={step}
              onChange={(value) => updateInstruction(index, value)}
              placeholder={`Step ${index + 1}`}
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
