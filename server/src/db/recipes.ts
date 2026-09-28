import { db } from './client.js';
import { ParsedIngredientLine, ParsedInstructionStep } from '../types/recipe.js';
import { findUserById, resolveDisplayName } from './users.js';

export type RecipeInput = {
  title: string;
  servings?: string | null;
  totalTimeMinutes?: number | null;
  instructions: ParsedInstructionStep[];
  ingredients: ParsedIngredientLine[];
  rawText: string;
  sourceType: 'epub' | 'instagram' | 'website' | 'manual';
  sourceRef?: string | null;
  sourceName?: string | null;
  videoRef?: string | null;
  imageUrl?: string | null;
  notes?: string | null;
  mealTypeIds: number[];
  cuisineNames: string[];
};

function getOrCreateIngredient(name: string): number | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  db.prepare('INSERT OR IGNORE INTO ingredient_catalog (canonical_name) VALUES (?)').run(trimmed);
  const row = db.prepare('SELECT id FROM ingredient_catalog WHERE canonical_name = ? COLLATE NOCASE').get(trimmed) as
    | { id: number }
    | undefined;
  if (row) {
    // A case-insensitive match against an older row (e.g. "GARLIC" saved
    // before ingredient names were lowercased) would otherwise keep
    // serving that stale casing forever, even though every fresh parse
    // now produces "garlic" — keep the catalog's casing in sync with
    // whatever was just parsed instead of silently freezing on the first
    // casing it ever saw.
    db.prepare('UPDATE ingredient_catalog SET canonical_name = ? WHERE id = ?').run(trimmed, row.id);
  }
  return row?.id ?? null;
}

function getOrCreateCuisine(name: string): number | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  db.prepare('INSERT OR IGNORE INTO cuisines (name) VALUES (?)').run(trimmed);
  const row = db.prepare('SELECT id FROM cuisines WHERE name = ? COLLATE NOCASE').get(trimmed) as
    | { id: number }
    | undefined;
  return row?.id ?? null;
}

function writeIngredients(recipeId: number, ingredients: ParsedIngredientLine[]): string {
  db.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').run(recipeId);
  const insert = db.prepare(
    'INSERT INTO recipe_ingredients (recipe_id, ingredient_id, raw_text, quantity, unit, section, position) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  ingredients.forEach((ingredient, index) => {
    const ingredientId = getOrCreateIngredient(ingredient.name);
    insert.run(recipeId, ingredientId, ingredient.rawText, ingredient.quantity, ingredient.unit, ingredient.section, index);
  });
  return ingredients.map((i) => i.rawText).join('\n');
}

function writeMealTypes(recipeId: number, mealTypeIds: number[]): void {
  db.prepare('DELETE FROM recipe_meal_types WHERE recipe_id = ?').run(recipeId);
  const insert = db.prepare('INSERT OR IGNORE INTO recipe_meal_types (recipe_id, meal_type_id) VALUES (?, ?)');
  for (const mealTypeId of mealTypeIds) insert.run(recipeId, mealTypeId);
}

function writeCuisines(recipeId: number, cuisineNames: string[]): void {
  db.prepare('DELETE FROM recipe_cuisines WHERE recipe_id = ?').run(recipeId);
  const insert = db.prepare('INSERT OR IGNORE INTO recipe_cuisines (recipe_id, cuisine_id) VALUES (?, ?)');
  for (const name of cuisineNames) {
    const cuisineId = getOrCreateCuisine(name);
    if (cuisineId) insert.run(recipeId, cuisineId);
  }
}

export function createRecipe(input: RecipeInput, userId: number): number {
  const now = new Date().toISOString();
  const create = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO recipes
          (title, servings, total_time_minutes, instructions_json, ingredients_text, raw_text, source_type, source_ref, source_name, video_ref, image_url, notes, user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.title,
        input.servings ?? null,
        input.totalTimeMinutes ?? null,
        JSON.stringify(input.instructions),
        '',
        input.rawText,
        input.sourceType,
        input.sourceRef ?? null,
        input.sourceName ?? null,
        input.videoRef ?? null,
        input.imageUrl ?? null,
        input.notes ?? null,
        userId,
        now,
        now
      );
    const recipeId = Number(result.lastInsertRowid);
    const ingredientsText = writeIngredients(recipeId, input.ingredients);
    db.prepare('UPDATE recipes SET ingredients_text = ? WHERE id = ?').run(ingredientsText, recipeId);
    writeMealTypes(recipeId, input.mealTypeIds);
    writeCuisines(recipeId, input.cuisineNames);
    return recipeId;
  });
  return create();
}

export function updateRecipe(recipeId: number, input: RecipeInput): void {
  const now = new Date().toISOString();
  const update = db.transaction(() => {
    db.prepare(
      `UPDATE recipes SET
        title = ?, servings = ?, total_time_minutes = ?,
        instructions_json = ?, raw_text = ?, source_type = ?, source_ref = ?, source_name = ?, video_ref = ?, image_url = ?, notes = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      input.title,
      input.servings ?? null,
      input.totalTimeMinutes ?? null,
      JSON.stringify(input.instructions),
      input.rawText,
      input.sourceType,
      input.sourceRef ?? null,
      input.sourceName ?? null,
      input.videoRef ?? null,
      input.imageUrl ?? null,
      input.notes ?? null,
      now,
      recipeId
    );
    const ingredientsText = writeIngredients(recipeId, input.ingredients);
    db.prepare('UPDATE recipes SET ingredients_text = ? WHERE id = ?').run(ingredientsText, recipeId);
    writeMealTypes(recipeId, input.mealTypeIds);
    writeCuisines(recipeId, input.cuisineNames);
  });
  update();
}

export type DuplicateMatch = { id: number; title: string; sourceName: string | null };

// Two signals, either sufficient on its own: an exact source-link match
// (reliable for website/Instagram re-pastes of the same URL) or an
// exact-normalized-title match (catches manual re-pastes with no source
// link, or the same recipe re-fetched from a different URL/mirror).
export function findPotentialDuplicates(sourceRef: string | null, title: string): DuplicateMatch[] {
  const trimmedRef = sourceRef?.trim() || null;
  const trimmedTitle = title.trim();
  if (!trimmedRef && !trimmedTitle) return [];

  const rows = db
    .prepare(
      `SELECT id, title, source_name FROM recipes
       WHERE (? IS NOT NULL AND source_ref = ?)
          OR (? != '' AND LOWER(TRIM(title)) = LOWER(?))`
    )
    .all(trimmedRef, trimmedRef, trimmedTitle, trimmedTitle) as Array<{
    id: number;
    title: string;
    source_name: string | null;
  }>;

  return rows.map((r) => ({ id: r.id, title: r.title, sourceName: r.source_name }));
}

export function deleteRecipe(recipeId: number): void {
  db.prepare('DELETE FROM recipes WHERE id = ?').run(recipeId);
}

// Favorites/queue are per-person (see schema.sql's recipe_favorites/
// recipe_want_to_try) -- each user has their own row per recipe, unlike
// setNeedsFixing below which stays a single shared column.
export function setWantToTry(recipeId: number, userId: number, want: boolean): void {
  if (want) {
    db.prepare(
      "INSERT INTO recipe_want_to_try (recipe_id, user_id, want_to_try_at) VALUES (?, ?, datetime('now')) ON CONFLICT (recipe_id, user_id) DO NOTHING"
    ).run(recipeId, userId);
  } else {
    db.prepare('DELETE FROM recipe_want_to_try WHERE recipe_id = ? AND user_id = ?').run(recipeId, userId);
  }
}

export function setFavorite(recipeId: number, userId: number, favorite: boolean): void {
  if (favorite) {
    db.prepare(
      "INSERT INTO recipe_favorites (recipe_id, user_id, favorited_at) VALUES (?, ?, datetime('now')) ON CONFLICT (recipe_id, user_id) DO NOTHING"
    ).run(recipeId, userId);
  } else {
    db.prepare('DELETE FROM recipe_favorites WHERE recipe_id = ? AND user_id = ?').run(recipeId, userId);
  }
}

export function setNeedsFixing(recipeId: number, needsFixing: boolean): void {
  db.prepare('UPDATE recipes SET needs_fixing_at = ? WHERE id = ?').run(
    needsFixing ? new Date().toISOString() : null,
    recipeId
  );
}

export type RecipeSummary = {
  id: number;
  title: string;
  sourceType: string;
  sourceRef: string | null;
  sourceName: string | null;
  imageUrl: string | null;
  wantToTryAt: string | null;
  favoritedAt: string | null;
  needsFixingAt: string | null;
  avgRating: number | null;
  lastCookedAt: string | null;
  mealTypes: string[];
  cuisines: string[];
  ownerId: number | null;
  ownerName: string | null;
};

export type SearchFilters = {
  query?: string;
  mealTypeIds?: number[];
  cuisineIds?: number[];
  ingredientIds?: number[];
  toTryOnly?: boolean;
  favoritesOnly?: boolean;
  needsFixingOnly?: boolean;
  madeOnly?: boolean;
  notMadeOnly?: boolean;
  // Average rating (across all logged attempts, global -- not per-user,
  // same as the ratings themselves) of at least this many stars.
  minRating?: number;
  // One or more contributor ids -- "show me recipes added by any of these
  // people" (an OR across the list, same as mealTypeIds/cuisineIds above).
  // Omitted entirely means "everyone," same as before this became
  // multi-select.
  ownerIds?: number[];
  sortBy?: 'title' | 'recent';
  // Whose favorites/queue to report and filter by -- favorited_at/
  // want_to_try_at on the returned rows are THIS user's, not global (see
  // recipe_favorites/recipe_want_to_try in schema.sql). Always the
  // requesting user's own id; there is no "view someone else's favorites"
  // mode.
  viewerUserId: number;
};

function sanitizeFtsQuery(query: string): string {
  // FTS5 MATCH syntax treats several characters specially; for a simple "search box"
  // experience we just want substring-ish matching on each word, so wrap terms in
  // quotes and AND them rather than exposing raw FTS5 query syntax to the user.
  const terms = query
    .split(/\s+/)
    .map((term) => term.replace(/"/g, ''))
    .filter(Boolean);
  return terms.map((term) => `"${term}"*`).join(' AND ');
}

export function searchRecipes(filters: SearchFilters): RecipeSummary[] {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.query && filters.query.trim()) {
    clauses.push('r.id IN (SELECT rowid FROM recipes_fts WHERE recipes_fts MATCH ?)');
    params.push(sanitizeFtsQuery(filters.query.trim()));
  }
  if (filters.mealTypeIds && filters.mealTypeIds.length > 0) {
    const placeholders = filters.mealTypeIds.map(() => '?').join(', ');
    clauses.push(`r.id IN (SELECT recipe_id FROM recipe_meal_types WHERE meal_type_id IN (${placeholders}))`);
    params.push(...filters.mealTypeIds);
  }
  if (filters.cuisineIds && filters.cuisineIds.length > 0) {
    const placeholders = filters.cuisineIds.map(() => '?').join(', ');
    clauses.push(`r.id IN (SELECT recipe_id FROM recipe_cuisines WHERE cuisine_id IN (${placeholders}))`);
    params.push(...filters.cuisineIds);
  }
  if (filters.ingredientIds && filters.ingredientIds.length > 0) {
    const placeholders = filters.ingredientIds.map(() => '?').join(', ');
    clauses.push(`r.id IN (SELECT recipe_id FROM recipe_ingredients WHERE ingredient_id IN (${placeholders}))`);
    params.push(...filters.ingredientIds);
  }
  if (filters.toTryOnly) {
    clauses.push('EXISTS (SELECT 1 FROM recipe_want_to_try WHERE recipe_id = r.id AND user_id = ?)');
    params.push(filters.viewerUserId);
  }
  if (filters.favoritesOnly) {
    clauses.push('EXISTS (SELECT 1 FROM recipe_favorites WHERE recipe_id = r.id AND user_id = ?)');
    params.push(filters.viewerUserId);
  }
  if (filters.needsFixingOnly) {
    clauses.push('r.needs_fixing_at IS NOT NULL');
  }
  // "Made" means the *viewer* has logged at least one attempt -- per-user,
  // like favorites/queue above, not "has anyone ever made this." Ratings
  // and avgRating/lastCookedAt below stay global/shared (one rating per
  // attempt, visible to everyone) -- only this made/not-made determination
  // is scoped per-viewer. Regardless of whether the attempt was rated --
  // deliberately not reusing the rating-filtered subquery below that
  // computes avgRating/lastCookedAt, since an unrated attempt still means
  // the recipe was actually cooked.
  if (filters.madeOnly) {
    clauses.push('EXISTS (SELECT 1 FROM recipe_attempts WHERE recipe_id = r.id AND user_id = ?)');
    params.push(filters.viewerUserId);
  }
  if (filters.notMadeOnly) {
    clauses.push('NOT EXISTS (SELECT 1 FROM recipe_attempts WHERE recipe_id = r.id AND user_id = ?)');
    params.push(filters.viewerUserId);
  }
  if (filters.minRating != null) {
    clauses.push(
      '(SELECT AVG(rating) FROM recipe_attempts WHERE recipe_id = r.id AND rating IS NOT NULL) >= ?'
    );
    params.push(filters.minRating);
  }
  // Omitted entirely (no clause) means "everyone", which keeps that mode
  // byte-for-byte identical to pre-accounts behavior: every recipe,
  // unfiltered.
  if (filters.ownerIds && filters.ownerIds.length > 0) {
    const placeholders = filters.ownerIds.map(() => '?').join(', ');
    clauses.push(`r.user_id IN (${placeholders})`);
    params.push(...filters.ownerIds);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const orderBy = filters.sortBy === 'recent' ? 'ORDER BY r.created_at DESC' : 'ORDER BY r.title COLLATE NOCASE ASC';

  const rows = db
    .prepare(
      `SELECT r.id, r.title, r.source_type, r.source_ref, r.source_name, r.image_url, r.needs_fixing_at, r.user_id,
              u.email as owner_email, u.display_name as owner_display_name,
              rwt.want_to_try_at as want_to_try_at, rf.favorited_at as favorited_at
       FROM recipes r
       LEFT JOIN users u ON u.id = r.user_id
       LEFT JOIN recipe_want_to_try rwt ON rwt.recipe_id = r.id AND rwt.user_id = ?
       LEFT JOIN recipe_favorites rf ON rf.recipe_id = r.id AND rf.user_id = ?
       ${where} ${orderBy}`
    )
    .all(filters.viewerUserId, filters.viewerUserId, ...params) as Array<{
    id: number;
    title: string;
    source_type: string;
    source_ref: string | null;
    source_name: string | null;
    image_url: string | null;
    want_to_try_at: string | null;
    favorited_at: string | null;
    needs_fixing_at: string | null;
    user_id: number | null;
    owner_email: string | null;
    owner_display_name: string | null;
  }>;

  const avgRatingStmt = db.prepare(
    'SELECT AVG(rating) as avg, MAX(attempted_at) as last FROM recipe_attempts WHERE recipe_id = ? AND rating IS NOT NULL'
  );
  const mealTypesStmt = db.prepare(
    'SELECT mt.name FROM recipe_meal_types rmt JOIN meal_types mt ON mt.id = rmt.meal_type_id WHERE rmt.recipe_id = ?'
  );
  const cuisinesStmt = db.prepare(
    'SELECT c.name FROM recipe_cuisines rc JOIN cuisines c ON c.id = rc.cuisine_id WHERE rc.recipe_id = ?'
  );

  return rows.map((row) => {
    const ratingRow = avgRatingStmt.get(row.id) as { avg: number | null; last: string | null };
    return {
      id: row.id,
      title: row.title,
      sourceType: row.source_type,
      sourceRef: row.source_ref,
      sourceName: row.source_name,
      imageUrl: row.image_url,
      wantToTryAt: row.want_to_try_at,
      favoritedAt: row.favorited_at,
      needsFixingAt: row.needs_fixing_at,
      avgRating: ratingRow.avg,
      lastCookedAt: ratingRow.last,
      mealTypes: (mealTypesStmt.all(row.id) as Array<{ name: string }>).map((r) => r.name),
      cuisines: (cuisinesStmt.all(row.id) as Array<{ name: string }>).map((r) => r.name),
      ownerId: row.user_id,
      ownerName: row.owner_email ? resolveDisplayName(row.owner_display_name, row.owner_email) : null
    };
  });
}

export type RecipeDetail = {
  id: number;
  title: string;
  servings: string | null;
  totalTimeMinutes: number | null;
  instructions: ParsedInstructionStep[];
  ingredients: Array<{
    rawText: string;
    quantity: string | null;
    unit: string | null;
    name: string | null;
    section: string | null;
  }>;
  rawText: string;
  sourceType: string;
  sourceRef: string | null;
  sourceName: string | null;
  videoRef: string | null;
  imageUrl: string | null;
  notes: string | null;
  wantToTryAt: string | null;
  favoritedAt: string | null;
  needsFixingAt: string | null;
  mealTypeIds: number[];
  cuisineNames: string[];
  attempts: Array<{ id: number; attemptedAt: string; rating: number | null; notes: string | null }>;
  ownerId: number | null;
  ownerName: string | null;
};

export function getRecipeById(recipeId: number, viewerUserId: number): RecipeDetail | null {
  const row = db.prepare('SELECT * FROM recipes WHERE id = ?').get(recipeId) as
    | {
        id: number;
        title: string;
        servings: string | null;
        total_time_minutes: number | null;
        instructions_json: string;
        raw_text: string;
        source_type: string;
        source_ref: string | null;
        source_name: string | null;
        video_ref: string | null;
        image_url: string | null;
        notes: string | null;
        needs_fixing_at: string | null;
        user_id: number | null;
      }
    | undefined;
  if (!row) return null;

  const wantToTryAt = (
    db.prepare('SELECT want_to_try_at FROM recipe_want_to_try WHERE recipe_id = ? AND user_id = ?').get(
      recipeId,
      viewerUserId
    ) as { want_to_try_at: string } | undefined
  )?.want_to_try_at ?? null;
  const favoritedAt = (
    db.prepare('SELECT favorited_at FROM recipe_favorites WHERE recipe_id = ? AND user_id = ?').get(
      recipeId,
      viewerUserId
    ) as { favorited_at: string } | undefined
  )?.favorited_at ?? null;

  const ingredients = db
    .prepare(
      `SELECT ri.raw_text, ri.quantity, ri.unit, ri.section, ic.canonical_name as name
       FROM recipe_ingredients ri
       LEFT JOIN ingredient_catalog ic ON ic.id = ri.ingredient_id
       WHERE ri.recipe_id = ? ORDER BY ri.position ASC`
    )
    .all(recipeId) as Array<{
    raw_text: string;
    quantity: string | null;
    unit: string | null;
    section: string | null;
    name: string | null;
  }>;

  const mealTypeIds = (
    db.prepare('SELECT meal_type_id FROM recipe_meal_types WHERE recipe_id = ?').all(recipeId) as Array<{
      meal_type_id: number;
    }>
  ).map((r) => r.meal_type_id);

  const cuisineNames = (
    db
      .prepare(
        'SELECT c.name FROM recipe_cuisines rc JOIN cuisines c ON c.id = rc.cuisine_id WHERE rc.recipe_id = ?'
      )
      .all(recipeId) as Array<{ name: string }>
  ).map((r) => r.name);

  const attempts = db
    .prepare('SELECT id, attempted_at, rating, notes FROM recipe_attempts WHERE recipe_id = ? ORDER BY attempted_at DESC')
    .all(recipeId) as Array<{ id: number; attempted_at: string; rating: number | null; notes: string | null }>;

  return {
    id: row.id,
    title: row.title,
    servings: row.servings,
    totalTimeMinutes: row.total_time_minutes,
    instructions: JSON.parse(row.instructions_json || '[]'),
    ingredients: ingredients.map((i) => ({
      rawText: i.raw_text,
      quantity: i.quantity,
      unit: i.unit,
      name: i.name,
      section: i.section
    })),
    rawText: row.raw_text,
    sourceType: row.source_type,
    sourceRef: row.source_ref,
    sourceName: row.source_name,
    videoRef: row.video_ref,
    imageUrl: row.image_url,
    notes: row.notes,
    wantToTryAt,
    favoritedAt,
    needsFixingAt: row.needs_fixing_at,
    mealTypeIds,
    cuisineNames,
    attempts: attempts.map((a) => ({ id: a.id, attemptedAt: a.attempted_at, rating: a.rating, notes: a.notes })),
    ownerId: row.user_id,
    ownerName: row.user_id != null ? resolveDisplayNameForOwner(row.user_id) : null
  };
}

// A single-row lookup (unlike searchRecipes' JOIN, which covers a whole
// result set at once) -- getRecipeById is only ever called for one recipe,
// so a plain extra query here is simpler than a JOIN for one row.
function resolveDisplayNameForOwner(userId: number): string | null {
  const owner = findUserById(userId);
  return owner ? resolveDisplayName(owner.displayName, owner.email) : null;
}

export function addAttempt(
  recipeId: number,
  userId: number,
  attemptedAt: string,
  rating: number | null,
  notes: string | null
): number {
  const result = db
    .prepare('INSERT INTO recipe_attempts (recipe_id, user_id, attempted_at, rating, notes) VALUES (?, ?, ?, ?, ?)')
    .run(recipeId, userId, attemptedAt, rating, notes);
  return Number(result.lastInsertRowid);
}

export type ActivityEntry = {
  id: number;
  recipeId: number;
  recipeTitle: string;
  attemptedAt: string;
  rating: number | null;
  notes: string | null;
  userName: string | null;
};

// Every logged cooking attempt across all recipes, newest first — the raw
// feed behind the "activity log" page, as opposed to the per-recipe
// timeline already shown on each recipe's detail page.
export function listAllAttempts(): ActivityEntry[] {
  const rows = db
    .prepare(
      `SELECT ra.id, ra.recipe_id, r.title, ra.attempted_at, ra.rating, ra.notes,
              u.email as user_email, u.display_name as user_display_name
       FROM recipe_attempts ra
       JOIN recipes r ON r.id = ra.recipe_id
       LEFT JOIN users u ON u.id = ra.user_id
       ORDER BY ra.attempted_at DESC, ra.id DESC`
    )
    .all() as Array<{
    id: number;
    recipe_id: number;
    title: string;
    attempted_at: string;
    rating: number | null;
    notes: string | null;
    user_email: string | null;
    user_display_name: string | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    recipeId: r.recipe_id,
    recipeTitle: r.title,
    attemptedAt: r.attempted_at,
    rating: r.rating,
    notes: r.notes,
    userName: r.user_email ? resolveDisplayName(r.user_display_name, r.user_email) : null
  }));
}

export function deleteAttempt(attemptId: number): void {
  db.prepare('DELETE FROM recipe_attempts WHERE id = ?').run(attemptId);
}

export function listMealTypes(): Array<{ id: number; name: string }> {
  return db.prepare('SELECT id, name FROM meal_types ORDER BY name ASC').all() as Array<{ id: number; name: string }>;
}

export function listCuisines(): Array<{ id: number; name: string }> {
  return db.prepare('SELECT id, name FROM cuisines ORDER BY name ASC').all() as Array<{ id: number; name: string }>;
}

export function listIngredientNames(): Array<{ id: number; name: string }> {
  return db.prepare('SELECT id, canonical_name as name FROM ingredient_catalog ORDER BY canonical_name ASC').all() as Array<{
    id: number;
    name: string;
  }>;
}
