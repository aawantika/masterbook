export type SourceType = 'epub' | 'instagram' | 'website' | 'manual';

export type ParsedIngredientLine = {
  rawText: string;
  quantity: string | null;
  unit: string | null;
  name: string;
};

export type RecipeDraft = {
  title: string;
  ingredients: ParsedIngredientLine[];
  instructions: string[];
  rawText: string;
  servings?: string | null;
  totalTimeMinutes?: number | null;
  cuisineNames?: string[];
  imageUrl?: string | null;
  sourceName?: string | null;
};

export type RecipeInput = {
  title: string;
  servings?: string | null;
  totalTimeMinutes?: number | null;
  instructions: string[];
  ingredients: ParsedIngredientLine[];
  rawText: string;
  sourceType: SourceType;
  sourceRef?: string | null;
  sourceName?: string | null;
  imageUrl?: string | null;
  notes?: string | null;
  mealTypeIds: number[];
  cuisineNames: string[];
};

export type RecipeSummary = {
  id: number;
  title: string;
  sourceType: string;
  sourceRef: string | null;
  sourceName: string | null;
  imageUrl: string | null;
  wantToTryAt: string | null;
  favoritedAt: string | null;
  avgRating: number | null;
  lastCookedAt: string | null;
  mealTypes: string[];
  cuisines: string[];
};

export type RecipeAttempt = {
  id: number;
  attemptedAt: string;
  rating: number | null;
  notes: string | null;
};

export type RecipeDetail = {
  id: number;
  title: string;
  servings: string | null;
  totalTimeMinutes: number | null;
  instructions: string[];
  ingredients: ParsedIngredientLine[];
  rawText: string;
  sourceType: string;
  sourceRef: string | null;
  sourceName: string | null;
  imageUrl: string | null;
  notes: string | null;
  wantToTryAt: string | null;
  favoritedAt: string | null;
  mealTypeIds: number[];
  cuisineNames: string[];
  attempts: RecipeAttempt[];
};

export type MetaItem = { id: number; name: string };
