import { ParsedIngredientLine } from '../../types/recipe.js';

const UNIT_PATTERN =
  '(cups?|tbsp|tablespoons?|tsp|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|l|liters?|' +
  'cloves?|pinch(?:es)?|dash(?:es)?|to taste|sprigs?|stalks?|cans?|slices?|handfuls?)';

// Matches a leading quantity (digits, fractions like "1/2", or ranges like "1-2"),
// an optional unit, then the rest of the line as the ingredient name. Best-effort —
// always falls back to preserving the raw line as `name` if nothing matches, since
// losing the original text is worse than an imperfect structured guess.
const INGREDIENT_LINE_PATTERN = new RegExp(
  `^([\\d.\\/\\s]*(?:-\\s*[\\d.\\/\\s]+)?)\\s*${UNIT_PATTERN}?\\s*(.*)$`,
  'i'
);

export function parseIngredientLine(rawLine: string): ParsedIngredientLine {
  const rawText = rawLine.trim();
  const stripped = rawText.replace(/^[-*••]\s*/, '');

  const match = INGREDIENT_LINE_PATTERN.exec(stripped);
  if (!match) {
    return { rawText, quantity: null, unit: null, name: stripped };
  }

  const quantity = match[1]?.trim() || null;
  const unit = match[2]?.trim() || null;
  const name = match[3]?.trim() || stripped;

  return { rawText, quantity, unit, name };
}
