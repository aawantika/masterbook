import { Router } from 'express';
import { z } from 'zod';
import { canDeleteRecipe, canEditRecipe } from '../auth/permissions.js';
import {
  createRecipe,
  deleteRecipe,
  findPotentialDuplicates,
  getRecipeById,
  searchRecipes,
  setFavorite,
  setNeedsFixing,
  setWantToTry,
  updateRecipe
} from '../db/recipes.js';

export const recipesRouter = Router();

const ingredientSchema = z.object({
  rawText: z.string(),
  quantity: z.string().nullable().default(null),
  unit: z.string().nullable().default(null),
  name: z.string(),
  section: z.string().nullable().default(null)
});

const instructionStepSchema = z.object({
  text: z.string(),
  section: z.string().nullable().default(null)
});

const recipeInputSchema = z.object({
  title: z.string().min(1),
  servings: z.string().nullable().optional(),
  totalTimeMinutes: z.number().int().nonnegative().nullable().optional(),
  instructions: z.array(instructionStepSchema),
  ingredients: z.array(ingredientSchema),
  rawText: z.string(),
  sourceType: z.enum(['epub', 'instagram', 'website', 'manual']),
  sourceRef: z.string().nullable().optional(),
  sourceName: z.string().nullable().optional(),
  videoRef: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  mealTypeIds: z.array(z.number().int()),
  cuisineNames: z.array(z.string())
});

function parseIdParam(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

recipesRouter.get('/', (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q : undefined;
  const mealTypeIds = parseIdList(req.query.mealTypeIds);
  const cuisineIds = parseIdList(req.query.cuisineIds);
  const ingredientIds = parseIdList(req.query.ingredientIds);
  const toTryOnly = req.query.toTry === 'true';
  const favoritesOnly = req.query.favorites === 'true';
  const needsFixingOnly = req.query.needsFixing === 'true';
  const madeOnly = req.query.made === 'true';
  const notMadeOnly = req.query.notMade === 'true';
  const requestedMinRating = typeof req.query.minRating === 'string' ? Number(req.query.minRating) : undefined;
  const minRating =
    Number.isInteger(requestedMinRating) && requestedMinRating! >= 1 && requestedMinRating! <= 5
      ? requestedMinRating
      : undefined;
  const requestedMaxTime = typeof req.query.maxTimeMinutes === 'string' ? Number(req.query.maxTimeMinutes) : undefined;
  const maxTimeMinutes =
    Number.isInteger(requestedMaxTime) && requestedMaxTime! > 0 ? requestedMaxTime : undefined;
  const mineOnly = req.query.mine === 'true';
  // "Added by" -- one or more contributor ids (?ownerIds=1,2,3). mine=true
  // and the older singular ?ownerId= are both kept as back-compat
  // shortcuts, folded into the same array rather than the client needing
  // to know its own id for the "just me" case.
  const requestedOwnerIds = parseIdList(req.query.ownerIds);
  const legacyOwnerId = typeof req.query.ownerId === 'string' ? Number(req.query.ownerId) : undefined;
  const ownerIds =
    requestedOwnerIds ?? (Number.isInteger(legacyOwnerId) ? [legacyOwnerId as number] : mineOnly ? [req.user!.id] : undefined);
  const sortBy = req.query.sort === 'recent' ? 'recent' : 'title';

  res.json(
    searchRecipes({
      query,
      mealTypeIds,
      cuisineIds,
      ingredientIds,
      toTryOnly,
      favoritesOnly,
      needsFixingOnly,
      madeOnly,
      notMadeOnly,
      minRating,
      maxTimeMinutes,
      ownerIds,
      sortBy,
      viewerUserId: req.user!.id
    })
  );
});

function parseIdList(raw: unknown): number[] | undefined {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  return raw
    .split(',')
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value));
}

// Must be registered before /:id — otherwise Express would try to parse
// "duplicates" as a recipe id.
recipesRouter.get('/duplicates', (req, res) => {
  const sourceRef = typeof req.query.sourceRef === 'string' ? req.query.sourceRef : null;
  const title = typeof req.query.title === 'string' ? req.query.title : '';
  res.json(findPotentialDuplicates(sourceRef, title));
});

recipesRouter.get('/:id', (req, res) => {
  const id = parseIdParam(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid recipe id' });

  const recipe = getRecipeById(id, req.user!.id);
  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
  res.json(recipe);
});

recipesRouter.post('/', (req, res) => {
  const parsed = recipeInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  // Owner comes from the authenticated session, never from the request
  // body -- a client can't claim someone else's recipe as their own.
  const id = createRecipe(parsed.data, req.user!.id);
  res.status(201).json(getRecipeById(id, req.user!.id));
});

recipesRouter.put('/:id', (req, res) => {
  const id = parseIdParam(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid recipe id' });

  const parsed = recipeInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = getRecipeById(id, req.user!.id);
  if (!existing) return res.status(404).json({ error: 'Recipe not found' });

  if (!canEditRecipe(existing, req.user!)) {
    return res.status(403).json({ error: "Only this recipe's creator or an admin can edit it" });
  }

  updateRecipe(id, parsed.data);
  res.json(getRecipeById(id, req.user!.id));
});

recipesRouter.delete('/:id', (req, res) => {
  const id = parseIdParam(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid recipe id' });

  const recipe = getRecipeById(id, req.user!.id);
  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });

  if (!canDeleteRecipe(recipe, req.user!)) {
    return res.status(403).json({ error: "Only this recipe's creator or an admin can delete it" });
  }

  deleteRecipe(id);
  res.status(204).send();
});

const wantToTrySchema = z.object({ want: z.boolean() });

recipesRouter.post('/:id/want-to-try', (req, res) => {
  const id = parseIdParam(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid recipe id' });

  const parsed = wantToTrySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  // Per-person -- always the requesting user's own queue, never someone
  // else's (see recipe_want_to_try in schema.sql).
  setWantToTry(id, req.user!.id, parsed.data.want);
  res.json(getRecipeById(id, req.user!.id));
});

const favoriteSchema = z.object({ favorite: z.boolean() });

recipesRouter.post('/:id/favorite', (req, res) => {
  const id = parseIdParam(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid recipe id' });

  const parsed = favoriteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  // Per-person -- always the requesting user's own favorites (see
  // recipe_favorites in schema.sql).
  setFavorite(id, req.user!.id, parsed.data.favorite);
  res.json(getRecipeById(id, req.user!.id));
});

const needsFixingSchema = z.object({ needsFixing: z.boolean() });

recipesRouter.post('/:id/needs-fixing', (req, res) => {
  const id = parseIdParam(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid recipe id' });

  const parsed = needsFixingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  // Stays global/shared, unlike favorite/want-to-try above.
  setNeedsFixing(id, parsed.data.needsFixing);
  res.json(getRecipeById(id, req.user!.id));
});
