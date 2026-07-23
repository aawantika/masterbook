import {
  DuplicateMatch,
  MetaItem,
  RecipeDetail,
  RecipeDraft,
  RecipeInput,
  RecipeSummary
} from './types';

// The server's `.error` field is either a plain string (routes that throw a
// handled Error, e.g. the fetch-from-URL failure) or a Zod `.flatten()`
// object (validation failures: `{ formErrors: string[], fieldErrors: {
// [field]: string[] } }`). Handle both so a raw JSON blob never leaks into
// the UI as an "error message."
function describeApiError(error: unknown): string | null {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const { formErrors, fieldErrors } = error as { formErrors?: unknown; fieldErrors?: unknown };
    const parts: string[] = [];
    if (Array.isArray(formErrors)) parts.push(...formErrors.filter((m): m is string => typeof m === 'string'));
    if (fieldErrors && typeof fieldErrors === 'object') {
      for (const [field, messages] of Object.entries(fieldErrors as Record<string, unknown>)) {
        if (Array.isArray(messages) && messages.length > 0) {
          parts.push(`${field}: ${messages.join(', ')}`);
        }
      }
    }
    if (parts.length > 0) return parts.join('; ');
  }
  return null;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!response.ok) {
    const body = await response.text();
    let parsedError: string | null = null;
    try {
      const parsed = JSON.parse(body);
      parsedError = describeApiError(parsed?.error);
    } catch {
      // Not JSON — fall through to the raw message below.
    }
    throw new Error(parsedError ?? `${response.status} ${response.statusText}: ${body}`);
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
  favorites?: boolean;
};

export function searchRecipes(params: SearchParams): Promise<RecipeSummary[]> {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.mealTypeIds?.length) query.set('mealTypeIds', params.mealTypeIds.join(','));
  if (params.cuisineIds?.length) query.set('cuisineIds', params.cuisineIds.join(','));
  if (params.ingredientIds?.length) query.set('ingredientIds', params.ingredientIds.join(','));
  if (params.toTry) query.set('toTry', 'true');
  if (params.favorites) query.set('favorites', 'true');
  const qs = query.toString();
  return request<RecipeSummary[]>(`/recipes${qs ? `?${qs}` : ''}`);
}

export function getRecipe(id: number): Promise<RecipeDetail> {
  return request<RecipeDetail>(`/recipes/${id}`);
}

export function createRecipe(input: RecipeInput): Promise<RecipeDetail> {
  return request<RecipeDetail>('/recipes', { method: 'POST', body: JSON.stringify(input) });
}

export function checkDuplicates(sourceRef: string | null, title: string): Promise<DuplicateMatch[]> {
  const query = new URLSearchParams();
  if (sourceRef) query.set('sourceRef', sourceRef);
  if (title) query.set('title', title);
  return request<DuplicateMatch[]>(`/recipes/duplicates?${query.toString()}`);
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

export function setFavorite(id: number, favorite: boolean): Promise<RecipeDetail> {
  return request<RecipeDetail>(`/recipes/${id}/favorite`, { method: 'POST', body: JSON.stringify({ favorite }) });
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

export type WebsiteFetchResult = RecipeDraft & { usedStructuredData: boolean };

export function fetchRecipeFromUrl(url: string): Promise<WebsiteFetchResult> {
  return request<WebsiteFetchResult>('/ingest/website/fetch', { method: 'POST', body: JSON.stringify({ url }) });
}

export function fetchRemoteImage(url: string): Promise<{ imageUrl: string }> {
  return request<{ imageUrl: string }>('/images/fetch-remote', { method: 'POST', body: JSON.stringify({ url }) });
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
