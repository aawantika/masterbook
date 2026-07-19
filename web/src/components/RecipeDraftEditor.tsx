import { useMemo, useState } from 'react';
import { MetaItem, ParsedIngredientLine, ParsedInstructionStep, RecipeInput, SourceType } from '../api/types';
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

function emptyIngredient(section: string | null = null): ParsedIngredientLine {
  return { rawText: '', quantity: null, unit: null, name: '', section };
}

type IngredientGroup = { section: string | null; indices: number[] };

// Consecutive ingredients sharing the same section value render as one
// visual group with a single editable header — matches how sections are
// actually stored (a flat list, each row tagged with its section) without
// needing a separate nested data shape just for the editor.
function groupIngredientsBySection(ingredients: ParsedIngredientLine[]): IngredientGroup[] {
  const groups: IngredientGroup[] = [];
  ingredients.forEach((ing, index) => {
    const last = groups[groups.length - 1];
    if (last && last.section === ing.section) {
      last.indices.push(index);
    } else {
      groups.push({ section: ing.section, indices: [index] });
    }
  });
  return groups;
}

function emptyInstruction(section: string | null = null): ParsedInstructionStep {
  return { text: '', section };
}

type InstructionGroup = { section: string | null; indices: number[] };

// Same grouping/editing pattern as ingredient sections — see
// groupIngredientsBySection above for the rationale.
function groupInstructionsBySection(instructions: ParsedInstructionStep[]): InstructionGroup[] {
  const groups: InstructionGroup[] = [];
  instructions.forEach((step, index) => {
    const last = groups[groups.length - 1];
    if (last && last.section === step.section) {
      last.indices.push(index);
    } else {
      groups.push({ section: step.section, indices: [index] });
    }
  });
  return groups;
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
  const [instructions, setInstructions] = useState<ParsedInstructionStep[]>(
    initial?.instructions && initial.instructions.length > 0 ? initial.instructions : [emptyInstruction()]
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

  const ingredientGroups = useMemo(() => groupIngredientsBySection(ingredients), [ingredients]);

  // Stores exactly what's typed (including empty string mid-edit) rather
  // than normalizing to null right away — collapsing to null the moment the
  // field is empty would reclassify the group as "ungrouped" while the user
  // is still typing. Empty sections get normalized to null at save time.
  const updateGroupSection = (indices: number[], newLabel: string) => {
    setIngredients((prev) => prev.map((ing, i) => (indices.includes(i) ? { ...ing, section: newLabel } : ing)));
  };

  const addIngredientToGroup = (afterIndex: number, section: string | null) => {
    setIngredients((prev) => {
      const next = [...prev];
      next.splice(afterIndex + 1, 0, emptyIngredient(section));
      return next;
    });
  };

  // Splits the run of ingredients that share `index`'s section into a new,
  // separately-labeled section starting at `index` — so a correctly-parsed
  // ingredient list only needs section headers dropped in at the right
  // spots, not retyped from scratch. Only the ingredients from `index` to
  // the end of the current run are affected; anything before, or any
  // already-named section after, is untouched.
  const insertSectionBreak = (index: number) => {
    setIngredients((prev) => {
      const runSection = prev[index].section;
      let end = index;
      while (end < prev.length && prev[end].section === runSection) end++;
      return prev.map((ing, i) => (i >= index && i < end ? { ...ing, section: '' } : ing));
    });
  };

  const addSection = () => {
    setIngredients((prev) => [...prev, emptyIngredient('')]);
  };

  const updateInstruction = (index: number, value: string) => {
    setInstructions((prev) => prev.map((step, i) => (i === index ? { ...step, text: value } : step)));
  };

  const removeInstruction = (index: number) => {
    setInstructions((prev) => prev.filter((_, i) => i !== index));
  };

  const instructionGroups = useMemo(() => groupInstructionsBySection(instructions), [instructions]);

  const updateInstructionGroupSection = (indices: number[], newLabel: string) => {
    setInstructions((prev) => prev.map((step, i) => (indices.includes(i) ? { ...step, section: newLabel } : step)));
  };

  const addInstructionToGroup = (afterIndex: number, section: string | null) => {
    setInstructions((prev) => {
      const next = [...prev];
      next.splice(afterIndex + 1, 0, emptyInstruction(section));
      return next;
    });
  };

  const insertInstructionSectionBreak = (index: number) => {
    setInstructions((prev) => {
      const runSection = prev[index].section;
      let end = index;
      while (end < prev.length && prev[end].section === runSection) end++;
      return prev.map((step, i) => (i >= index && i < end ? { ...step, section: '' } : step));
    });
  };

  const addInstructionSection = () => {
    setInstructions((prev) => [...prev, emptyInstruction('')]);
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
        .map((ing) => ({
          ...ing,
          rawText: ing.rawText || [ing.quantity, ing.unit, ing.name].filter(Boolean).join(' '),
          section: ing.section?.trim() || null
        }));
      const cleanedInstructions = instructions
        .map((step) => ({ text: step.text.trim(), section: step.section?.trim() || null }))
        .filter((step) => step.text);

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
        {ingredients.length === 0 && (
          <button type="button" onClick={() => setIngredients([emptyIngredient()])}>
            + Add ingredient
          </button>
        )}
        {ingredientGroups.map((group, groupIndex) => (
          <div className="ingredient-group" key={groupIndex}>
            {group.section !== null && (
              <input
                className="ingredient-section-label"
                value={group.section}
                onChange={(e) => updateGroupSection(group.indices, e.target.value)}
                placeholder="Section name (e.g. For the chicken)"
              />
            )}
            {group.indices.map((index) => {
              const ingredient = ingredients[index];
              const unitOptions =
                ingredient.unit && !CANONICAL_UNITS.includes(ingredient.unit)
                  ? [ingredient.unit, ...CANONICAL_UNITS]
                  : CANONICAL_UNITS;
              return (
                <div className="ingredient-row" key={index}>
                  <button
                    type="button"
                    className="insert-section-btn"
                    title="Insert a section header here"
                    onClick={() => insertSectionBreak(index)}
                  >
                    + section
                  </button>
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
            <button
              type="button"
              className="ingredient-group-add"
              onClick={() => addIngredientToGroup(group.indices[group.indices.length - 1], group.section)}
            >
              + Add ingredient
            </button>
          </div>
        ))}
        <button type="button" className="secondary" onClick={addSection}>
          + Add section
        </button>
      </div>

      <div className="field">
        <span>Instructions</span>
        {instructions.length === 0 && (
          <button type="button" onClick={() => setInstructions([emptyInstruction()])}>
            + Add step
          </button>
        )}
        {instructionGroups.map((group, groupIndex) => (
          <div className="instruction-group" key={groupIndex}>
            {group.section !== null && (
              <input
                className="ingredient-section-label"
                value={group.section}
                onChange={(e) => updateInstructionGroupSection(group.indices, e.target.value)}
                placeholder="Section name (e.g. To Make the Tartar Sauce)"
              />
            )}
            {group.indices.map((index, i) => (
              <div className="instruction-row" key={index}>
                <button
                  type="button"
                  className="insert-section-btn"
                  title="Insert a section header here"
                  onClick={() => insertInstructionSectionBreak(index)}
                >
                  + section
                </button>
                <span className="instruction-index">{i + 1}.</span>
                <AutoGrowTextarea
                  value={instructions[index].text}
                  onChange={(value) => updateInstruction(index, value)}
                  placeholder={`Step ${i + 1}`}
                />
                <button type="button" onClick={() => removeInstruction(index)} title="Remove step">
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="ingredient-group-add"
              onClick={() => addInstructionToGroup(group.indices[group.indices.length - 1], group.section)}
            >
              + Add step
            </button>
          </div>
        ))}
        <button type="button" className="secondary" onClick={addInstructionSection}>
          + Add section
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
