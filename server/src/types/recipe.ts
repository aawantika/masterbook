export type SourceType = 'epub' | 'instagram' | 'website' | 'manual';

export type ParsedIngredientLine = {
  rawText: string;
  quantity: string | null;
  unit: string | null;
  name: string;
  // e.g. "For the chicken" — null for ingredients with no section grouping.
  section: string | null;
};

export type RecipeDraft = {
  title: string;
  ingredients: ParsedIngredientLine[];
  instructions: string[];
  rawText: string;
  // Only populated when the draft came from structured data (e.g. a site's
  // schema.org Recipe JSON-LD) — the plain-text paste splitter has no way to
  // know these, so they stay undefined for that path.
  servings?: string | null;
  totalTimeMinutes?: number | null;
  cuisineNames?: string[];
  imageUrl?: string | null;
  sourceName?: string | null;
};
