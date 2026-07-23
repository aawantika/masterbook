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
  { canonical: 'gallon', pattern: 'gallons?|gals?' },
  { canonical: 'inch', pattern: 'inch(?:es)?' },
  // "NOS."/"NO." — Indian-English shorthand for a bare count ("2 NOS.
  // green chilli"). The trailing period is stripped before parsing (see
  // parseBilingualPipeLine), not matched here — a literal "." right before
  // a word boundary check never satisfies \b since both sides are non-word.
  { canonical: 'nos', pattern: 'nos?' }
];

export const CANONICAL_UNITS = UNIT_ALIASES.map((u) => u.canonical);

const UNIT_PATTERN = `(${UNIT_ALIASES.map((u) => u.pattern).join('|')})`;
// Non-capturing twin of UNIT_PATTERN, for use inside a lookahead — a
// lookahead that embeds a *capturing* group still counts toward overall
// group numbering even though it never consumes input, which would shift
// every match[n] index downstream that assumes the original numbering.
const UNIT_PATTERN_NONCAPTURING = `(?:${UNIT_ALIASES.map((u) => u.pattern).join('|')})`;

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

// "a pinch", "a dash", "a can" — an implicit quantity of one, spelled as an
// article rather than a digit. Only matches when immediately followed by a
// recognized unit (the lookahead), so "a large onion" doesn't misfire —
// "large" isn't a unit, so the article there is just a normal article.
const ARTICLE_QUANTITY_GROUP = `(?:a|an)(?=\\s+${UNIT_PATTERN_NONCAPTURING}\\b)`;

function isArticleQuantity(value: string): boolean {
  return /^(a|an)$/i.test(value);
}

// Matches a leading quantity (digits, fractions like "1/2" or "½", ranges
// like "1-2" / "3 to 4", or an article like "a"/"an" immediately before a
// unit), an optional unit, then the rest of the line as the ingredient
// name. The unit match requires a trailing word boundary (`\b`) so a
// single-letter abbreviation like "l" (liter) or "g" (gram) can't eat the
// first letter of an unrelated word — "large eggs" was matching "l" as a
// unit and leaving "arge eggs" as the name before this. Best-effort —
// always falls back to preserving the raw line as `name` if nothing
// matches, since losing the original text is worse than an imperfect guess.
const INGREDIENT_LINE_PATTERN = new RegExp(
  `^(${ARTICLE_QUANTITY_GROUP}|[${QUANTITY_CHAR_CLASS}]*(?:(?:-|\\u2013|\\u2014|to)\\s*[${QUANTITY_CHAR_CLASS}]+)?)\\s*(?:${UNIT_PATTERN}\\b)?\\s*(.*)$`,
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

// "medium", "medium sized", "medium-sized" — a size descriptor, not a real
// measurement unit. Recognized separately from UNIT_PATTERN so "1 medium
// sized onion" (no unit word at all, just a size) still extracts a
// quantity instead of failing to match anything and falling back to the
// whole line untouched.
const SIZE_DESCRIPTOR_PATTERN = `(?:small|medium|large)(?:[\\s-]?siz(?:e|ed))?`;

function normalizeSizeDescriptor(raw: string): string {
  return raw.replace(/[\s-]?siz(?:e|ed)$/i, '').trim().toLowerCase();
}

// Bilingual "NAME | translation quantity unit" lines — a format common on
// Instagram recipe cards from Hindi-speaking creators, e.g.
// "GARLIC | लहसुन 8-10 CLOVES". Unlike every other format this parser
// handles, the quantity/unit sits at the *end* of the line, not the start.
// The translation itself is dropped — only the English name before the "|"
// is kept — so this just needs to find where the pipe is, then pull
// quantity/unit/size out of whatever comes after it.
const TRAILING_QUANTITY_UNIT_PATTERN = new RegExp(
  `(${ARTICLE_QUANTITY_GROUP}|[${QUANTITY_CHAR_CLASS}]+(?:(?:-|\\u2013|\\u2014|to)\\s*[${QUANTITY_CHAR_CLASS}]+)?)\\s*(?:${UNIT_PATTERN}\\b)?\\s*(${SIZE_DESCRIPTOR_PATTERN})?\\s*(\\([^)]*\\))?\\s*\\.?\\s*$`,
  'i'
);

function parseBilingualPipeLine(rawLine: string, section: string | null): ParsedIngredientLine | null {
  const pipeIndex = rawLine.indexOf('|');
  if (pipeIndex === -1) return null;

  const englishName = rawLine.slice(0, pipeIndex).trim().toLowerCase();
  if (!englishName) return null;
  const afterPipe = rawLine.slice(pipeIndex + 1).trim();

  const match = TRAILING_QUANTITY_UNIT_PATTERN.exec(afterPipe);
  const quantityRaw = match?.[1]?.trim();
  const isArticle = quantityRaw ? isArticleQuantity(quantityRaw) : false;
  // Require an actual digit/fraction (or the "a"/"an" article form) — not
  // just trailing whitespace matched by the quantity character class,
  // otherwise every piped line with no trailing number at all would
  // "match" with an empty/blank quantity.
  const hasQuantity = !!quantityRaw && (isArticle || /[\d¼-¾⅐-⅞]/.test(quantityRaw));

  if (!match || !hasQuantity) {
    // No quantity/unit extractable at all ("SALT | नमक TO TASTE") — the
    // Devanagari translation still gets dropped, but any real leftover
    // instruction ("to taste", "as required") is kept, just appended
    // naturally onto the English name instead of discarded outright.
    const leftover = afterPipe
      .replace(/[ऀ-ॿ]+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    const fallbackText = leftover ? `${englishName}, ${leftover}` : englishName;
    return { rawText: fallbackText, quantity: null, unit: null, name: fallbackText, section };
  }
  const quantity = isArticle ? '1' : quantityRaw!;

  const rawUnitText = match[2]?.trim() ?? '';
  const unit = rawUnitText ? canonicalizeUnit(rawUnitText) : null;
  const sizeWord = match[3] ? normalizeSizeDescriptor(match[3]) : null;
  const notes = match[4] ? ` ${match[4]}` : '';
  // "nos"/"no" is a bare count, not a real unit word ("2 nos green chilli"
  // isn't how anyone'd say that in English) — kept as the stored unit for
  // consistency, but left out of the display text.
  const showUnitInText = unit !== 'nos' && rawUnitText;
  const name = `${sizeWord ? `${sizeWord} ` : ''}${englishName}${notes}`.trim();
  const rawText = `${quantity}${showUnitInText ? ` ${rawUnitText.toLowerCase()}` : ''} ${name}`.trim();

  return { rawText, quantity, unit, name, section };
}

export function parseIngredientLine(rawLine: string, section: string | null = null): ParsedIngredientLine {
  const bilingual = parseBilingualPipeLine(rawLine.trim(), section);
  if (bilingual) return bilingual;

  const rawText = stripLeadingCommaInParens(collapseDoubledParens(rawLine.trim()));
  const stripped = rawText.replace(/^[-*••]\s*/, '');

  const match = INGREDIENT_LINE_PATTERN.exec(stripped);
  if (!match) {
    return { rawText, quantity: null, unit: null, name: stripped, section };
  }

  const quantityRaw = match[1]?.trim() || null;
  const quantity = quantityRaw && isArticleQuantity(quantityRaw) ? '1' : quantityRaw;
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
