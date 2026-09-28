import {
  ActivityEntry,
  Contributor,
  DuplicateMatch,
  EpubBlock,
  EpubBookmark,
  EpubSource,
  EpubSourceDetail,
  MetaItem,
  RecipeDetail,
  RecipeDraft,
  RecipeInput,
  RecipeSummary,
  User
} from './types';
import { auth } from '../firebase';

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

// Every request needs a fresh Firebase ID token attached -- getIdToken()
// returns a cached token unless it's close to expiry, in which case it
// silently refreshes first, so this is cheap to call on every request
// rather than something worth caching ourselves.
async function authHeader(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
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
  needsFixing?: boolean;
  made?: boolean;
  notMade?: boolean;
  // A specific contributor's id -- "everyone" is just omitting this
  // entirely, same as every other optional filter here.
  ownerId?: number;
  sort?: 'title' | 'recent';
};

export function searchRecipes(params: SearchParams): Promise<RecipeSummary[]> {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.mealTypeIds?.length) query.set('mealTypeIds', params.mealTypeIds.join(','));
  if (params.cuisineIds?.length) query.set('cuisineIds', params.cuisineIds.join(','));
  if (params.ingredientIds?.length) query.set('ingredientIds', params.ingredientIds.join(','));
  if (params.toTry) query.set('toTry', 'true');
  if (params.favorites) query.set('favorites', 'true');
  if (params.needsFixing) query.set('needsFixing', 'true');
  if (params.made) query.set('made', 'true');
  if (params.notMade) query.set('notMade', 'true');
  if (params.ownerId != null) query.set('ownerId', String(params.ownerId));
  if (params.sort === 'recent') query.set('sort', 'recent');
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

export function setNeedsFixing(id: number, needsFixing: boolean): Promise<RecipeDetail> {
  return request<RecipeDetail>(`/recipes/${id}/needs-fixing`, {
    method: 'POST',
    body: JSON.stringify({ needsFixing })
  });
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

export function getActivityLog(): Promise<ActivityEntry[]> {
  return request<ActivityEntry[]>('/attempts');
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

export function getContributors(): Promise<Contributor[]> {
  return request<Contributor[]>('/meta/contributors');
}

// Bespoke fetch, not the shared request() helper -- request() always
// JSON.stringifies its body and sets a JSON Content-Type, but the upload
// needs to stream the raw file bytes with an explicit epub Content-Type. A
// dropped File's own .type is often empty/application-octet-stream for
// .epub in practice, so that type is set explicitly here rather than
// relying on file.type -- otherwise express.raw()'s type filter on the
// server won't match and req.body silently ends up undefined.
export async function uploadEpub(file: File): Promise<EpubSource> {
  const response = await fetch(`/api/epub/upload?filename=${encodeURIComponent(file.name)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/epub+zip', ...(await authHeader()) },
    body: file
  });
  if (!response.ok) {
    const body = await response.text();
    let message = `${response.status} ${response.statusText}: ${body}`;
    try {
      const parsed = JSON.parse(body);
      if (typeof parsed?.error === 'string') message = parsed.error;
    } catch {
      // Not JSON -- fall through to the raw message above.
    }
    throw new Error(message);
  }
  return response.json() as Promise<EpubSource>;
}

export function listEpubSources(): Promise<EpubSource[]> {
  return request<EpubSource[]>('/epub/sources');
}

export function getEpubSource(id: number): Promise<EpubSourceDetail> {
  return request<EpubSourceDetail>(`/epub/sources/${id}`);
}

export function deleteEpubSource(id: number): Promise<void> {
  return request<void>(`/epub/sources/${id}`, { method: 'DELETE' });
}

export async function getEpubChapterBlocks(id: number, flowIndex: number): Promise<EpubBlock[]> {
  const { blocks } = await request<{ blocks: EpubBlock[] }>(`/epub/sources/${id}/chapters/${flowIndex}`);
  return blocks;
}

// Full-page counterpart to getEpubChapterBlocks -- the book's actual
// markup (tagged with the same data-block-index coordinates), for
// rendering the reader close to how the book actually looks.
export async function getEpubChapterHtml(id: number, flowIndex: number): Promise<string> {
  const { html } = await request<{ html: string }>(`/epub/sources/${id}/chapters/${flowIndex}/html`);
  return html;
}

export function listEpubBookmarks(id: number): Promise<EpubBookmark[]> {
  return request<EpubBookmark[]>(`/epub/sources/${id}/bookmarks`);
}

export function createEpubBookmark(
  id: number,
  bookmark: {
    title: string | null;
    startFlowIndex: number;
    startBlockIndex: number;
    endFlowIndex: number;
    endBlockIndex: number;
  }
): Promise<EpubBookmark> {
  return request<EpubBookmark>(`/epub/sources/${id}/bookmarks`, {
    method: 'POST',
    body: JSON.stringify(bookmark)
  });
}

export function deleteEpubBookmark(id: number): Promise<void> {
  return request<void>(`/epub/bookmarks/${id}`, { method: 'DELETE' });
}

export function getMe(): Promise<User> {
  return request<User>('/auth/me');
}

// Sets/clears the httpOnly session cookie that <img src> requests to
// /api/images and EPUB book images are checked against (they can't carry
// the Bearer header) -- see server/src/middleware/sessionCookie.ts.
export function createSession(): Promise<void> {
  return request<void>('/auth/session', { method: 'POST' });
}

export function deleteSession(): Promise<void> {
  return request<void>('/auth/session', { method: 'DELETE' });
}

export function listUsers(): Promise<User[]> {
  return request<User[]>('/auth/users');
}

export function createUser(email: string, role: 'admin' | 'user' = 'user'): Promise<User> {
  return request<User>('/auth/users', { method: 'POST', body: JSON.stringify({ email, role }) });
}

export function approveUser(id: number): Promise<User> {
  return request<User>(`/auth/users/${id}/approve`, { method: 'PATCH' });
}

export function updateDisplayName(id: number, displayName: string | null): Promise<User> {
  return request<User>(`/auth/users/${id}/display-name`, {
    method: 'PATCH',
    body: JSON.stringify({ displayName })
  });
}
