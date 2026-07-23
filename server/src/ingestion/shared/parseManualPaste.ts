import { groupIngredientLinesBySections } from './parseIngredientLine.js';
import { RecipeDraft } from '../../types/recipe.js';

// Loose word-start match rather than "the whole line is exactly this word"
// — real recipe captions write "Ingredients (4 servings):" or "How:" as
// often as a bare "Ingredients:". The length check keeps this from
// matching a sentence that merely happens to start with one of these words
// ("How to fix a broken roux: whisk harder" isn't a section heading).
const INGREDIENTS_HEADING = /^ingredients?\b/i;
const INSTRUCTIONS_HEADING = /^(instructions?|directions?|method|steps?|how(?:\s+to)?)\b/i;

function isHeadingLike(line: string, pattern: RegExp): boolean {
  return line.length <= 50 && pattern.test(line);
}

function stripLeadingMarker(line: string): string {
  return line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim();
}

// Groups consecutive non-blank lines, splitting on one or more blank
// lines — the fallback signal used when no "Ingredients"/"Instructions"
// heading is found at all. A lot of pasted captions rely on paragraph
// spacing alone to separate sections rather than labeling them.
function splitIntoBlocks(lines: string[]): string[][] {
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line === '') {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current);
  return blocks;
}

// Best-effort splitter shared by manual-paste ingestion and (later) EPUB candidate
// review. Cookbook/recipe text layouts vary too much for guaranteed accuracy, so
// this always preserves `rawText` in full alongside its best guess — the caller
// (RecipeDraftEditor) is expected to let the user review/fix before saving.
export function parseManualPaste(input: string): RecipeDraft {
  const rawText = input;
  const lines = input.split('\n').map((line) => line.trim());

  const firstNonBlankIndex = lines.findIndex((line) => line !== '');
  const title = firstNonBlankIndex === -1 ? 'Untitled recipe' : lines[firstNonBlankIndex];

  const ingredientsIndex = lines.findIndex((line) => isHeadingLike(line, INGREDIENTS_HEADING));
  const instructionsIndex = lines.findIndex(
    (line, index) => (ingredientsIndex === -1 || index > ingredientsIndex) && isHeadingLike(line, INSTRUCTIONS_HEADING)
  );

  let ingredientLines: string[];
  let instructionLines: string[];

  if (ingredientsIndex !== -1 || instructionsIndex !== -1) {
    // At least one explicit heading found — trust it.
    ingredientLines =
      ingredientsIndex === -1
        ? []
        : lines.slice(ingredientsIndex + 1, instructionsIndex === -1 ? lines.length : instructionsIndex).filter(Boolean);
    instructionLines = instructionsIndex === -1 ? [] : lines.slice(instructionsIndex + 1).filter(Boolean);
  } else if (firstNonBlankIndex === -1) {
    ingredientLines = [];
    instructionLines = [];
  } else {
    // No headings at all — fall back to blank-line-separated paragraph
    // blocks: the first block after the title is ingredients, everything
    // after that is instructions. Matches how these get typed/copied in
    // practice (title, blank line, ingredient list, blank line, steps)
    // even when nothing is explicitly labeled.
    const blocks = splitIntoBlocks(lines.slice(firstNonBlankIndex + 1));
    ingredientLines = blocks[0] ?? [];
    instructionLines = blocks.slice(1).flat();
  }

  return {
    title,
    ingredients: groupIngredientLinesBySections(ingredientLines.map(stripLeadingMarker)),
    instructions: instructionLines.map((line) => ({ text: stripLeadingMarker(line), section: null })),
    rawText
  };
}
