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

// Digits/period/slash/whitespace plus the Unicode vulgar-fraction characters
// recipe sites often use instead of ASCII "1/2" — ½ ¼ ¾ ⅓ ⅔ ⅛ etc.
// (U+00BC–00BE, U+2150–215E).
const QUANTITY_CHAR_CLASS = '\\d.\\/\\s\\u00BC-\\u00BE\\u2150-\\u215E';

// Matches a leading quantity (digits, fractions like "1/2" or "½", or ranges
// like "1-2" / "3 to 4"), an optional unit, then the rest of the line as the
// ingredient name. The unit match requires a trailing word boundary (`\b`)
// so a single-letter abbreviation like "l" (liter) or "g" (gram) can't eat
// the first letter of an unrelated word — "large eggs" was matching "l" as
// a unit and leaving "arge eggs" as the name before this. Best-effort —
// always falls back to preserving the raw line as `name` if nothing
// matches, since losing the original text is worse than an imperfect guess.
const INGREDIENT_LINE_PATTERN = new RegExp(
  `^([${QUANTITY_CHAR_CLASS}]*(?:(?:-|to)\\s*[${QUANTITY_CHAR_CLASS}]+)?)\\s*(?:${UNIT_PATTERN}\\b)?\\s*(.*)$`,
  'i'
);

// Some recipe sites (looking at you, WP Recipe Maker) wrap parenthetical
// notes in doubled parens in their own structured data — "garlic ((sliced))"
// — collapse that to a single pair rather than passing the artifact through.
function collapseDoubledParens(value: string): string {
  return value.replace(/\(\(([^()]*)\)\)/g, '($1)');
}

// Same family of WP Recipe Maker artifact: a modifier note gets wrapped as
// "(, minced)" instead of "(minced)" — the leading comma is a template
// leftover from a "name, note" format that got parenthesized without
// dropping the comma. Strip it.
function stripLeadingCommaInParens(value: string): string {
  return value.replace(/\(\s*,\s*/g, '(');
}

export function parseIngredientLine(rawLine: string, section: string | null = null): ParsedIngredientLine {
  const rawText = stripLeadingCommaInParens(collapseDoubledParens(rawLine.trim()));
  const stripped = rawText.replace(/^[-*••]\s*/, '');

  const match = INGREDIENT_LINE_PATTERN.exec(stripped);
  if (!match) {
    return { rawText, quantity: null, unit: null, name: stripped, section };
  }

  const quantity = match[1]?.trim() || null;
  const unit = match[2]?.trim() ? canonicalizeUnit(match[2]) : null;
  const name = match[3]?.trim() || stripped;

  return { rawText, quantity, unit, name, section };
}

// A line is treated as a section header ("For the chicken:", "To serve:")
// rather than an ingredient when it's colon-terminated, reasonably short,
// and doesn't start with something that looks like a quantity — real
// ingredient lines essentially never end with a bare colon, so this is a
// low-false-positive heuristic rather than a fixed keyword list, which
// would miss whatever a given site happens to call its sections.
function looksLikeSectionHeader(line: string): boolean {
  if (!line.endsWith(':')) return false;
  if (line.length > 60) return false;
  const firstChar = line[0];
  return !new RegExp(`[${QUANTITY_CHAR_CLASS}]`).test(firstChar);
}

// Splits a flat list of ingredient-block lines into ParsedIngredientLine
// entries, tagging each with whichever section header (if any) most
// recently preceded it. Shared by the manual-paste splitter and the
// website JSON-LD extractor, since both hand this function a flat list of
// strings that may or may not contain section headers.
export function groupIngredientLinesBySections(lines: string[]): ParsedIngredientLine[] {
  let currentSection: string | null = null;
  const results: ParsedIngredientLine[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    if (looksLikeSectionHeader(trimmed)) {
      currentSection = trimmed.slice(0, -1).trim();
      continue;
    }

    results.push(parseIngredientLine(trimmed, currentSection));
  }

  return results;
}
