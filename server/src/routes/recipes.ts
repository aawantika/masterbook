import { Router } from 'express';
import { z } from 'zod';
import {
  createRecipe,
  deleteRecipe,
  findPotentialDuplicates,
  getRecipeById,
  searchRecipes,
  setFavorite,
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

  res.json(searchRecipes({ query, mealTypeIds, cuisineIds, ingredientIds, toTryOnly, favoritesOnly }));
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

  const recipe = getRecipeById(id);
  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
  res.json(recipe);
});

recipesRouter.post('/', (req, res) => {
  const parsed = recipeInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const id = createRecipe(parsed.data);
  res.status(201).json(getRecipeById(id));
});

recipesRouter.put('/:id', (req, res) => {
  const id = parseIdParam(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid recipe id' });

  const parsed = recipeInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  if (!getRecipeById(id)) return res.status(404).json({ error: 'Recipe not found' });

  updateRecipe(id, parsed.data);
  res.json(getRecipeById(id));
});

recipesRouter.delete('/:id', (req, res) => {
  const id = parseIdParam(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid recipe id' });

  deleteRecipe(id);
  res.status(204).send();
});

const wantToTrySchema = z.object({ want: z.boolean() });

recipesRouter.post('/:id/want-to-try', (req, res) => {
  const id = parseIdParam(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid recipe id' });

  const parsed = wantToTrySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  setWantToTry(id, parsed.data.want);
  res.json(getRecipeById(id));
});

const favoriteSchema = z.object({ favorite: z.boolean() });

recipesRouter.post('/:id/favorite', (req, res) => {
  const id = parseIdParam(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid recipe id' });

  const parsed = favoriteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  setFavorite(id, parsed.data.favorite);
  res.json(getRecipeById(id));
});
