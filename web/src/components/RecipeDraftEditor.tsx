import { CSSProperties, useMemo, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MetaItem, ParsedIngredientLine, ParsedInstructionStep, RecipeInput, SourceType } from '../api/types';
import { fetchRemoteImage } from '../api/client';
import { CANONICAL_UNITS } from '../constants';
import { AutoGrowTextarea } from './AutoGrowTextarea';

// dnd-kit needs a stable id per row that survives reordering — array index
// doesn't work since that's exactly what changes on drag. This is purely a
// client-side editing concern, stripped back out before saving.
type EditableIngredient = ParsedIngredientLine & { dndId: string };

function makeDndId(): string {
  return crypto.randomUUID();
}

function emptyEditableIngredient(section: string | null = null): EditableIngredient {
  return { rawText: '', quantity: null, unit: null, name: '', section, dndId: makeDndId() };
}

// A freshly-created, not-yet-named section used to be tagged with a bare
// '' — but two blank sections created back to back (e.g. "+ Add section"
// clicked twice before naming the first one) would then sit adjacent with
// the *same* '' value and collapse into a single group, since consecutive
// same-section rows are treated as one group. Each blank section instead
// gets its own unique marker (invisible in the label input, since it
// renders as '') so two blank sections never accidentally merge, while
// still resolving to null at save time if left unnamed.
const BLANK_SECTION_PREFIX = '​';

function makeBlankSectionValue(): string {
  return BLANK_SECTION_PREFIX + makeDndId();
}

function isBlankSectionValue(section: string | null): boolean {
  return !!section && section.startsWith(BLANK_SECTION_PREFIX);
}

function sectionInputValue(section: string | null): string {
  return isBlankSectionValue(section) ? '' : (section ?? '');
}

function normalizeSectionForSave(section: string | null | undefined): string | null {
  if (isBlankSectionValue(section ?? null)) return null;
  return section?.trim() || null;
}

type RecipeDraftEditorProps = {
  initial?: Partial<RecipeInput>;
  mealTypes: MetaItem[];
  cuisineSuggestions: MetaItem[];
  onSave: (input: RecipeInput) => Promise<void>;
  onCancel?: () => void;
  saveLabel?: string;
};

type IngredientGroup = { section: string | null; indices: number[] };

// Consecutive ingredients sharing the same section value render as one
// visual group with a single editable header — matches how sections are
// actually stored (a flat list, each row tagged with its section) without
// needing a separate nested data shape just for the editor.
function groupIngredientsBySection(ingredients: EditableIngredient[]): IngredientGroup[] {
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

// Separate component because useSortable is a hook — can't call it inside
// the .map() callback that renders each row.
function SortableIngredientRow({
  ingredient,
  unitOptions,
  onUpdate,
  onRemove,
  onInsertSectionBreak
}: {
  ingredient: EditableIngredient;
  unitOptions: string[];
  onUpdate: (patch: Partial<ParsedIngredientLine>) => void;
  onRemove: () => void;
  onInsertSectionBreak: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ingredient.dndId
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  return (
    <div ref={setNodeRef} style={style} className="ingredient-row">
      <button type="button" className="drag-handle" title="Drag to reorder" {...attributes} {...listeners}>
        ⠿
      </button>
      <button
        type="button"
        className="insert-section-btn"
        title="Insert a section header here"
        onClick={onInsertSectionBreak}
      >
        + section
      </button>
      <input
        className="ingredient-quantity"
        value={ingredient.quantity ?? ''}
        onChange={(e) => onUpdate({ quantity: e.target.value })}
        placeholder="qty"
      />
      <select
        className="ingredient-unit"
        value={ingredient.unit ?? ''}
        onChange={(e) => onUpdate({ unit: e.target.value || null })}
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
        onChange={(e) => onUpdate({ name: e.target.value })}
        placeholder="ingredient"
      />
      <button type="button" onClick={onRemove} title="Remove ingredient">
        ×
      </button>
    </div>
  );
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
  const [ingredients, setIngredients] = useState<EditableIngredient[]>(() =>
    initial?.ingredients && initial.ingredients.length > 0
      ? initial.ingredients.map((ing) => ({ ...ing, dndId: makeDndId() }))
      : [emptyEditableIngredient()]
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
  const [savingImage, setSavingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clears rawText on any manual edit — handleSave falls back to
  // reconstructing it from quantity/unit/name only when rawText is empty,
  // so leaving a stale rawText in place after editing a field meant the
  // save silently kept showing the *old* text regardless of what was typed.
  const updateIngredient = (index: number, patch: Partial<ParsedIngredientLine>) => {
    setIngredients((prev) => prev.map((ing, i) => (i === index ? { ...ing, ...patch, rawText: '' } : ing)));
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
      next.splice(afterIndex + 1, 0, emptyEditableIngredient(section));
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
      const blank = makeBlankSectionValue();
      return prev.map((ing, i) => (i >= index && i < end ? { ...ing, section: blank } : ing));
    });
  };

  const addSection = () => {
    setIngredients((prev) => [...prev, emptyEditableIngredient(makeBlankSectionValue())]);
  };

  // Ungroups every ingredient in the section back to unlabeled — for an
  // empty/unwanted section this effectively removes it (the blank row gets
  // filtered out on save anyway); for a named section with real ingredients
  // it just drops the header while keeping the ingredients themselves.
  const removeIngredientGroupSection = (indices: number[]) => {
    setIngredients((prev) => prev.map((ing, i) => (indices.includes(i) ? { ...ing, section: null } : ing)));
  };

  // Moves an entire section (every ingredient in it, as one block) past its
  // neighboring section in the given direction — swaps two contiguous
  // blocks in the flat array rather than reordering individual rows.
  const moveIngredientGroup = (groupIndex: number, direction: -1 | 1) => {
    setIngredients((prev) => {
      const groups = groupIngredientsBySection(prev);
      const targetIndex = groupIndex + direction;
      if (targetIndex < 0 || targetIndex >= groups.length) return prev;
      const blocks = groups.map((g) => g.indices.map((i) => prev[i]));
      return arrayMove(blocks, groupIndex, targetIndex).flat();
    });
  };

  // Cross-section drag: the dragged item adopts the section of whatever
  // item it's dropped onto, captured *before* the reorder. (Inferring the
  // new section from the post-move array neighbor instead — "whichever
  // item ended up next to it" — broke specifically when dropping onto a
  // section's first item: after the move, the item now sitting right
  // before the dragged one is the *previous* section's last item, not the
  // target section, so it silently joined the wrong group.)
  const handleIngredientDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setIngredients((prev) => {
      const oldIndex = prev.findIndex((ing) => ing.dndId === active.id);
      const overIndex = prev.findIndex((ing) => ing.dndId === over.id);
      if (oldIndex === -1 || overIndex === -1) return prev;

      const targetSection = prev[overIndex].section;
      const reordered = arrayMove(prev, oldIndex, overIndex);
      const newIndex = reordered.findIndex((ing) => ing.dndId === active.id);
      reordered[newIndex] = { ...reordered[newIndex], section: targetSection };
      return reordered;
    });
  };

  const dragSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

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
      const blank = makeBlankSectionValue();
      return prev.map((step, i) => (i >= index && i < end ? { ...step, section: blank } : step));
    });
  };

  const removeInstructionGroupSection = (indices: number[]) => {
    setInstructions((prev) => prev.map((step, i) => (indices.includes(i) ? { ...step, section: null } : step)));
  };

  const moveInstructionGroup = (groupIndex: number, direction: -1 | 1) => {
    setInstructions((prev) => {
      const groups = groupInstructionsBySection(prev);
      const targetIndex = groupIndex + direction;
      if (targetIndex < 0 || targetIndex >= groups.length) return prev;
      const blocks = groups.map((g) => g.indices.map((i) => prev[i]));
      return arrayMove(blocks, groupIndex, targetIndex).flat();
    });
  };

  const addInstructionSection = () => {
    setInstructions((prev) => [...prev, emptyInstruction(makeBlankSectionValue())]);
  };

  const saveImageLocally = async () => {
    const trimmed = imageUrl.trim();
    if (!trimmed) return;
    setSavingImage(true);
    setError(null);
    try {
      const result = await fetchRemoteImage(trimmed);
      setImageUrl(result.imageUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save image locally.');
    } finally {
      setSavingImage(false);
    }
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
      const cleanedIngredients: ParsedIngredientLine[] = ingredients
        .filter((ing) => ing.name.trim() || ing.rawText.trim())
        .map(({ dndId: _dndId, ...ing }) => ({
          ...ing,
          rawText: ing.rawText || [ing.quantity, ing.unit, ing.name].filter(Boolean).join(' '),
          section: normalizeSectionForSave(ing.section)
        }));
      const cleanedInstructions = instructions
        .map((step) => ({ text: step.text.trim(), section: normalizeSectionForSave(step.section) }))
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
        <div className="editor-image-url-row">
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://... (paste an image link, e.g. from Instagram)"
          />
          {imageUrl.trim() && !imageUrl.trim().startsWith('/api/images/') && (
            <button type="button" onClick={saveImageLocally} disabled={savingImage}>
              {savingImage ? 'Saving…' : 'Save locally'}
            </button>
          )}
        </div>
        {imageUrl.trim().startsWith('/api/images/') && (
          <span className="muted">Saved locally — this copy won't expire.</span>
        )}
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
          <button type="button" onClick={() => setIngredients([emptyEditableIngredient()])}>
            + Add ingredient
          </button>
        )}
        <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={handleIngredientDragEnd}>
          <SortableContext items={ingredients.map((ing) => ing.dndId)} strategy={verticalListSortingStrategy}>
            {ingredientGroups.map((group, groupIndex) => (
              <div className="ingredient-group" key={groupIndex}>
                {group.section !== null && (
                  <div className="ingredient-group-header">
                    <input
                      className="ingredient-section-label"
                      value={sectionInputValue(group.section)}
                      onChange={(e) => updateGroupSection(group.indices, e.target.value)}
                      placeholder="Section name (e.g. For the chicken)"
                    />
                    <button
                      type="button"
                      className="section-move-btn"
                      title="Move section up"
                      disabled={groupIndex === 0}
                      onClick={() => moveIngredientGroup(groupIndex, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="section-move-btn"
                      title="Move section down"
                      disabled={groupIndex === ingredientGroups.length - 1}
                      onClick={() => moveIngredientGroup(groupIndex, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => removeIngredientGroupSection(group.indices)}
                    >
                      Remove section
                    </button>
                  </div>
                )}
                {group.indices.map((index) => {
                  const ingredient = ingredients[index];
                  const unitOptions =
                    ingredient.unit && !CANONICAL_UNITS.includes(ingredient.unit)
                      ? [ingredient.unit, ...CANONICAL_UNITS]
                      : CANONICAL_UNITS;
                  return (
                    <SortableIngredientRow
                      key={ingredient.dndId}
                      ingredient={ingredient}
                      unitOptions={unitOptions}
                      onUpdate={(patch) => updateIngredient(index, patch)}
                      onRemove={() => removeIngredient(index)}
                      onInsertSectionBreak={() => insertSectionBreak(index)}
                    />
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
          </SortableContext>
        </DndContext>
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
              <div className="ingredient-group-header">
                <input
                  className="ingredient-section-label"
                  value={sectionInputValue(group.section)}
                  onChange={(e) => updateInstructionGroupSection(group.indices, e.target.value)}
                  placeholder="Section name (e.g. To Make the Tartar Sauce)"
                />
                <button
                  type="button"
                  className="section-move-btn"
                  title="Move section up"
                  disabled={groupIndex === 0}
                  onClick={() => moveInstructionGroup(groupIndex, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="section-move-btn"
                  title="Move section down"
                  disabled={groupIndex === instructionGroups.length - 1}
                  onClick={() => moveInstructionGroup(groupIndex, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => removeInstructionGroupSection(group.indices)}
                >
                  Remove section
                </button>
              </div>
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
