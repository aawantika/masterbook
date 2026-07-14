import {
  MetaItem,
  RecipeDetail,
  RecipeDraft,
  RecipeInput,
  RecipeSummary
} from './types';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export type SearchParams = {
  q?: string;
  mealTypeIds?: number[];
  cuisineIds?: number[];
  ingredientIds?: number[];
  toTry?: boolean;
};

export function searchRecipes(params: SearchParams): Promise<RecipeSummary[]> {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.mealTypeIds?.length) query.set('mealTypeIds', params.mealTypeIds.join(','));
  if (params.cuisineIds?.length) query.set('cuisineIds', params.cuisineIds.join(','));
  if (params.ingredientIds?.length) query.set('ingredientIds', params.ingredientIds.join(','));
  if (params.toTry) query.set('toTry', 'true');
  const qs = query.toString();
  return request<RecipeSummary[]>(`/recipes${qs ? `?${qs}` : ''}`);
}

export function getRecipe(id: number): Promise<RecipeDetail> {
  return request<RecipeDetail>(`/recipes/${id}`);
}

export function createRecipe(input: RecipeInput): Promise<RecipeDetail> {
  return request<RecipeDetail>('/recipes', { method: 'POST', body: JSON.stringify(input) });
}

export function updateRecipe(id: number, input: RecipeInput): Promise<RecipeDetail> {
  return request<RecipeDetail>(`/recipes/${id}`, { method: 'PUT', body: JSON.stringify(input) });
}

export function deleteRecipe(id: number): Promise<void> {
  return request<void>(`/recipes/${id}`, { method: 'DELETE' });
}

export function setWantToTry(id: number, want: boolean): Promise<RecipeDetail> {
  return request<RecipeDetail>(`/recipes/${id}/want-to-try`, { method: 'POST', body: JSON.stringify({ want }) });
}

export function addAttempt(
  id: number,
  attemptedAt: string,
  rating: number | null,
  notes: string | null
): Promise<RecipeDetail> {
  return request<RecipeDetail>(`/recipes/${id}/attempts`, {
    method: 'POST',
    body: JSON.stringify({ attemptedAt, rating, notes })
  });
}

export function deleteAttempt(id: number): Promise<void> {
  return request<void>(`/attempts/${id}`, { method: 'DELETE' });
}

export function parseManualPaste(text: string): Promise<RecipeDraft> {
  return request<RecipeDraft>('/ingest/manual/parse', { method: 'POST', body: JSON.stringify({ text }) });
}

export function getMealTypes(): Promise<MetaItem[]> {
  return request<MetaItem[]>('/meta/meal-types');
}

export function getCuisines(): Promise<MetaItem[]> {
  return request<MetaItem[]>('/meta/cuisines');
}

export function getIngredientNames(): Promise<MetaItem[]> {
  return request<MetaItem[]>('/meta/ingredients');
}
