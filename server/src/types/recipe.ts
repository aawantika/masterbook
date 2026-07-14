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
};
