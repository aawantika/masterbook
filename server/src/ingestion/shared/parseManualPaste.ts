import { groupIngredientLinesBySections } from './parseIngredientLine.js';
import { RecipeDraft } from '../../types/recipe.js';

// Whole-line match with room for a trailing parenthetical and/or colon —
// real recipe captions write "Ingredients (4 servings):" or "How:" as often
// as a bare "Ingredients:", so the heading word alone isn't enough to
// require. But anchoring both ends (rather than just word-start) matters:
// an earlier word-start-only version matched "How to fix a broken roux:
// whisk harder" as an instructions heading, since it starts with "how to"
// and the length guard (<=50 chars) doesn't reliably rule out a short
// sentence like that one. Requiring nothing but an optional "(...)" and ":"
// after the keyword rejects real sentence content while still accepting
// "Ingredients (4 servings):".
const INGREDIENTS_HEADING = /^ingredients?\s*(\([^)]*\))?\s*:?\s*$/i;
const INSTRUCTIONS_HEADING = /^(instructions?|directions?|method|steps?|how(?:\s+to)?)\s*(\([^)]*\))?\s*:?\s*$/i;

function isHeadingLike(line: string, pattern: RegExp): boolean {
  return line.length <= 50 && pattern.test(line);
}

// Recipe-plugin checkbox glyphs (WP Recipe Maker's ▢ being the most common)
// alongside the usual bullet/dash/numbered-list markers — all of these sit
// glued to the front of a copy-pasted ingredient line with no space, which
// otherwise defeats the quantity/unit regex entirely (it expects the line
// to start with the quantity itself). The `(?!\d)` after the numbered-marker
// alternative matters: without it, a decimal ingredient quantity like
// "3.5 tbsp flour" gets misread as list marker "3." + remainder "5 tbsp
// flour" — silently corrupting the actual number, not just the formatting.
function stripLeadingMarker(line: string): string {
  return line.replace(/^\s*(?:[-*•▢□☐◦▪▫]|\d+[.)](?!\d))\s*/, '').trim();
}

// Some sites lay out instructions as a bare "Step 1" / "STEP 2:" label on
// its own line, followed by the actual instruction text on the next
// line(s) -- unlike a leading marker glued to the front of the real content
// (which stripLeadingMarker handles), this is a whole separate line with
// nothing else on it, so it needs to be dropped entirely rather than just
// trimmed, or it becomes its own bogus "instruction" with no content.
const STEP_LABEL_LINE = /^step\s*\d+\.?:?\s*$/i;

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
    instructions: instructionLines
      .map(stripLeadingMarker)
      .filter((line) => !STEP_LABEL_LINE.test(line))
      .map((text) => ({ text, section: null })),
    rawText
  };
}
