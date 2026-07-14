import { db } from './client.js';
import { ParsedIngredientLine } from '../types/recipe.js';

export type RecipeInput = {
  title: string;
  servings?: string | null;
  totalTimeMinutes?: number | null;
  instructions: string[];
  ingredients: ParsedIngredientLine[];
  rawText: string;
  sourceType: 'epub' | 'instagram' | 'website' | 'manual';
  sourceRef?: string | null;
  sourceName?: string | null;
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
    'INSERT INTO recipe_ingredients (recipe_id, ingredient_id, raw_text, quantity, unit, position) VALUES (?, ?, ?, ?, ?, ?)'
  );
  ingredients.forEach((ingredient, index) => {
    const ingredientId = getOrCreateIngredient(ingredient.name);
    insert.run(recipeId, ingredientId, ingredient.rawText, ingredient.quantity, ingredient.unit, index);
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

export function createRecipe(input: RecipeInput): number {
  const now = new Date().toISOString();
  const create = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO recipes
          (title, servings, total_time_minutes, instructions_json, ingredients_text, raw_text, source_type, source_ref, source_name, image_url, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        input.imageUrl ?? null,
        input.notes ?? null,
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
        instructions_json = ?, raw_text = ?, source_type = ?, source_ref = ?, source_name = ?, image_url = ?, notes = ?, updated_at = ?
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

export function deleteRecipe(recipeId: number): void {
  db.prepare('DELETE FROM recipes WHERE id = ?').run(recipeId);
}

export function setWantToTry(recipeId: number, want: boolean): void {
  db.prepare('UPDATE recipes SET want_to_try_at = ? WHERE id = ?').run(
    want ? new Date().toISOString() : null,
    recipeId
  );
}

export function setFavorite(recipeId: number, favorite: boolean): void {
  db.prepare('UPDATE recipes SET favorited_at = ? WHERE id = ?').run(
    favorite ? new Date().toISOString() : null,
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
  avgRating: number | null;
  lastCookedAt: string | null;
  mealTypes: string[];
  cuisines: string[];
};

export type SearchFilters = {
  query?: string;
  mealTypeIds?: number[];
  cuisineIds?: number[];
  ingredientIds?: number[];
  toTryOnly?: boolean;
  favoritesOnly?: boolean;
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
    clauses.push('r.want_to_try_at IS NOT NULL');
  }
  if (filters.favoritesOnly) {
    clauses.push('r.favorited_at IS NOT NULL');
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const orderBy = filters.toTryOnly
    ? 'ORDER BY r.want_to_try_at ASC'
    : filters.favoritesOnly
      ? 'ORDER BY r.favorited_at DESC'
      : 'ORDER BY r.updated_at DESC';

  const rows = db
    .prepare(
      `SELECT r.id, r.title, r.source_type, r.source_ref, r.source_name, r.image_url, r.want_to_try_at, r.favorited_at FROM recipes r ${where} ${orderBy}`
    )
    .all(...params) as Array<{
    id: number;
    title: string;
    source_type: string;
    source_ref: string | null;
    source_name: string | null;
    image_url: string | null;
    want_to_try_at: string | null;
    favorited_at: string | null;
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
      avgRating: ratingRow.avg,
      lastCookedAt: ratingRow.last,
      mealTypes: (mealTypesStmt.all(row.id) as Array<{ name: string }>).map((r) => r.name),
      cuisines: (cuisinesStmt.all(row.id) as Array<{ name: string }>).map((r) => r.name)
    };
  });
}

export type RecipeDetail = {
  id: number;
  title: string;
  servings: string | null;
  totalTimeMinutes: number | null;
  instructions: string[];
  ingredients: Array<{ rawText: string; quantity: string | null; unit: string | null; name: string | null }>;
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
  attempts: Array<{ id: number; attemptedAt: string; rating: number | null; notes: string | null }>;
};

export function getRecipeById(recipeId: number): RecipeDetail | null {
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
        image_url: string | null;
        notes: string | null;
        want_to_try_at: string | null;
        favorited_at: string | null;
      }
    | undefined;
  if (!row) return null;

  const ingredients = db
    .prepare(
      `SELECT ri.raw_text, ri.quantity, ri.unit, ic.canonical_name as name
       FROM recipe_ingredients ri
       LEFT JOIN ingredient_catalog ic ON ic.id = ri.ingredient_id
       WHERE ri.recipe_id = ? ORDER BY ri.position ASC`
    )
    .all(recipeId) as Array<{ raw_text: string; quantity: string | null; unit: string | null; name: string | null }>;

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
    ingredients: ingredients.map((i) => ({ rawText: i.raw_text, quantity: i.quantity, unit: i.unit, name: i.name })),
    rawText: row.raw_text,
    sourceType: row.source_type,
    sourceRef: row.source_ref,
    sourceName: row.source_name,
    imageUrl: row.image_url,
    notes: row.notes,
    wantToTryAt: row.want_to_try_at,
    favoritedAt: row.favorited_at,
    mealTypeIds,
    cuisineNames,
    attempts: attempts.map((a) => ({ id: a.id, attemptedAt: a.attempted_at, rating: a.rating, notes: a.notes }))
  };
}

export function addAttempt(recipeId: number, attemptedAt: string, rating: number | null, notes: string | null): number {
  const result = db
    .prepare('INSERT INTO recipe_attempts (recipe_id, attempted_at, rating, notes) VALUES (?, ?, ?, ?)')
    .run(recipeId, attemptedAt, rating, notes);
  return Number(result.lastInsertRowid);
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
