// Best-effort quantity scaling for the servings-scaler in RecipeDetailPanel.
// Never throws and never blocks the rest of the list — any token we can't
// confidently parse (a range, "to taste", a whole can/package count with
// text baked in) is returned unscaled rather than guessed at.

const VULGAR_FRACTIONS: Record<string, number> = {
  '¼': 0.25,
  '½': 0.5,
  '¾': 0.75,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅕': 0.2,
  '⅖': 0.4,
  '⅗': 0.6,
  '⅘': 0.8,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875
};

const NICE_FRACTIONS: Array<[number, string]> = [
  [0.125, '⅛'],
  [0.25, '¼'],
  [1 / 3, '⅓'],
  [0.375, '⅜'],
  [0.5, '½'],
  [0.625, '⅝'],
  [2 / 3, '⅔'],
  [0.75, '¾'],
  [0.875, '⅞']
];

function tokenToNumber(token: string): number | null {
  if (token in VULGAR_FRACTIONS) return VULGAR_FRACTIONS[token];
  if (/^\d+\/\d+$/.test(token)) {
    const [n, d] = token.split('/').map(Number);
    return d ? n / d : null;
  }
  if (/^\d+(\.\d+)?$/.test(token)) return Number(token);
  return null;
}

export function parseQuantityToNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Glued mixed number, e.g. "1½" (no space before the vulgar fraction).
  const glued = trimmed.match(/^(\d+)([¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])$/);
  if (glued) return Number(glued[1]) + VULGAR_FRACTIONS[glued[2]];

  const parts = trimmed.split(/\s+/);
  let total = 0;
  for (const part of parts) {
    const n = tokenToNumber(part);
    if (n === null) return null;
    total += n;
  }
  return total;
}

function formatScaledNumber(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  const whole = Math.floor(rounded);
  const frac = rounded - whole;
  if (frac < 0.02) return String(whole);
  for (const [value, symbol] of NICE_FRACTIONS) {
    if (Math.abs(frac - value) < 0.03) return whole > 0 ? `${whole} ${symbol}` : symbol;
  }
  return String(Math.round(rounded * 100) / 100);
}

// Scales a stored quantity string by `factor`. Handles a single number
// ("3", "1/2", "¾", "1 1/2") or a range ("3-4", "3 to 4"), scaling both
// ends. Returns the original string unchanged if it can't be parsed
// confidently (e.g. "a pinch", "1 (15 oz) can").
export function scaleQuantityString(raw: string | null, factor: number): string | null {
  if (!raw) return raw;
  if (factor === 1) return raw;
  const trimmed = raw.trim();

  const toMatch = trimmed.match(/^(.+?)\s+to\s+(.+)$/i);
  const dashMatch = !toMatch && trimmed.match(/^(.+?)[-–](.+)$/);
  const rangeMatch = toMatch || dashMatch;

  if (rangeMatch) {
    const [, left, right] = rangeMatch;
    const leftNum = parseQuantityToNumber(left);
    const rightNum = parseQuantityToNumber(right);
    if (leftNum !== null && rightNum !== null) {
      const sep = toMatch ? ' to ' : '-';
      return `${formatScaledNumber(leftNum * factor)}${sep}${formatScaledNumber(rightNum * factor)}`;
    }
    return raw;
  }

  const num = parseQuantityToNumber(trimmed);
  if (num === null) return raw;
  return formatScaledNumber(num * factor);
}

// Pulls the first whole number out of a free-text servings field
// ("4", "Serves 4", "4-6 servings") to use as the scaling baseline.
export function parseBaseServings(servings: string | null): number | null {
  if (!servings) return null;
  const match = servings.match(/\d+(\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return n > 0 ? n : null;
}
