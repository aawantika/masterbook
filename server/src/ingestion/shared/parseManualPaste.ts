import { groupIngredientLinesBySections } from './parseIngredientLine.js';
import { RecipeDraft } from '../../types/recipe.js';

const INGREDIENTS_HEADING = /^ingredients?\s*:?\s*$/i;
const INSTRUCTIONS_HEADING = /^(instructions?|directions?|method|steps?)\s*:?\s*$/i;

function stripLeadingMarker(line: string): string {
  return line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim();
}

// Best-effort splitter shared by manual-paste ingestion and (later) EPUB candidate
// review. Cookbook/recipe text layouts vary too much for guaranteed accuracy, so
// this always preserves `rawText` in full alongside its best guess — the caller
// (RecipeDraftEditor) is expected to let the user review/fix before saving.
export function parseManualPaste(input: string): RecipeDraft {
  const rawText = input;
  const lines = input.split('\n').map((line) => line.trim());

  const ingredientsIndex = lines.findIndex((line) => INGREDIENTS_HEADING.test(line));
  const instructionsIndex = lines.findIndex(
    (line, index) => (ingredientsIndex === -1 || index > ingredientsIndex) && INSTRUCTIONS_HEADING.test(line)
  );

  const titleLines = lines.slice(0, ingredientsIndex === -1 ? 1 : ingredientsIndex).filter(Boolean);
  const title = titleLines[0] || 'Untitled recipe';

  const ingredientLines =
    ingredientsIndex === -1
      ? []
      : lines.slice(ingredientsIndex + 1, instructionsIndex === -1 ? lines.length : instructionsIndex).filter(Boolean);

  const instructionLines =
    instructionsIndex === -1
      ? ingredientsIndex === -1
        ? lines.slice(1).filter(Boolean)
        : []
      : lines.slice(instructionsIndex + 1).filter(Boolean);

  return {
    title,
    ingredients: groupIngredientLinesBySections(ingredientLines.map(stripLeadingMarker)),
    instructions: instructionLines.map((line) => ({ text: stripLeadingMarker(line), section: null })),
    rawText
  };
}
