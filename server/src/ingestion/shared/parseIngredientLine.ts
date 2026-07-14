import { ParsedIngredientLine } from '../../types/recipe.js';

// Canonical short units offered in the editor's unit dropdown. Order here
// also drives the recognition regex below — each entry's `pattern` lists the
// source-text variants that should normalize to `canonical` (longer/more
// specific alternatives first within a group, since JS regex alternation
// tries branches in order and a short prefix like "g" would otherwise
// swallow just the first letter of "grams" and leave "rams" dangling).
export const UNIT_ALIASES: Array<{ canonical: string; pattern: string }> = [
  { canonical: 'tbsp', pattern: 'tbsp|tablespoons?' },
  { canonical: 'tsp', pattern: 'tsp|teaspoons?' },
  { canonical: 'cup', pattern: 'cups?' },
  { canonical: 'oz', pattern: 'oz|ounces?' },
  { canonical: 'lb', pattern: 'lbs?|pounds?' },
  { canonical: 'kg', pattern: 'kilograms?|kg' },
  { canonical: 'g', pattern: 'grams?|g' },
  { canonical: 'l', pattern: 'liters?|litres?|l' },
  { canonical: 'ml', pattern: 'ml' },
  { canonical: 'clove', pattern: 'cloves?' },
  { canonical: 'pinch', pattern: 'pinch(?:es)?' },
  { canonical: 'dash', pattern: 'dash(?:es)?' },
  { canonical: 'sprig', pattern: 'sprigs?' },
  { canonical: 'stalk', pattern: 'stalks?' },
  { canonical: 'can', pattern: 'cans?' },
  { canonical: 'slice', pattern: 'slices?' },
  { canonical: 'handful', pattern: 'handfuls?' },
  { canonical: 'bunch', pattern: 'bunch(?:es)?' },
  { canonical: 'package', pattern: 'packages?|pkgs?' },
  { canonical: 'quart', pattern: 'quarts?|qts?' },
  { canonical: 'pint', pattern: 'pints?|pts?' },
  { canonical: 'gallon', pattern: 'gallons?|gals?' }
];

export const CANONICAL_UNITS = UNIT_ALIASES.map((u) => u.canonical);

const UNIT_PATTERN = `(${UNIT_ALIASES.map((u) => u.pattern).join('|')})`;

function canonicalizeUnit(rawUnit: string): string {
  const normalized = rawUnit.trim().toLowerCase();
  for (const { canonical, pattern } of UNIT_ALIASES) {
    if (new RegExp(`^(?:${pattern})$`, 'i').test(normalized)) return canonical;
  }
  return rawUnit.trim();
}

// Matches a leading quantity (digits, fractions like "1/2", or ranges like
// "1-2" / "3 to 4"), an optional unit, then the rest of the line as the
// ingredient name. Best-effort — always falls back to preserving the raw
// line as `name` if nothing matches, since losing the original text is
// worse than an imperfect structured guess.
const INGREDIENT_LINE_PATTERN = new RegExp(
  `^([\\d.\\/\\s]*(?:(?:-|to)\\s*[\\d.\\/\\s]+)?)\\s*${UNIT_PATTERN}?\\s*(.*)$`,
  'i'
);

// Some recipe sites (looking at you, WP Recipe Maker) wrap parenthetical
// notes in doubled parens in their own structured data — "garlic ((sliced))"
// — collapse that to a single pair rather than passing the artifact through.
function collapseDoubledParens(value: string): string {
  return value.replace(/\(\(([^()]*)\)\)/g, '($1)');
}

export function parseIngredientLine(rawLine: string): ParsedIngredientLine {
  const rawText = collapseDoubledParens(rawLine.trim());
  const stripped = rawText.replace(/^[-*••]\s*/, '');

  const match = INGREDIENT_LINE_PATTERN.exec(stripped);
  if (!match) {
    return { rawText, quantity: null, unit: null, name: stripped };
  }

  const quantity = match[1]?.trim() || null;
  const unit = match[2]?.trim() ? canonicalizeUnit(match[2]) : null;
  const name = match[3]?.trim() || stripped;

  return { rawText, quantity, unit, name };
}
