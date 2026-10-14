import { Router } from 'express';
import { z } from 'zod';
import {
  createCuisine,
  createMealType,
  deleteCuisine,
  deleteMealType,
  listCuisines,
  listCuisinesWithCounts,
  listIngredientNames,
  listMealTypes,
  listMealTypesWithCounts,
  renameCuisine,
  renameMealType
} from '../db/recipes.js';
import { listApprovedContributors } from '../db/users.js';
import { requireAdmin } from '../middleware/auth.js';

export const metaRouter = Router();

metaRouter.get('/meal-types', (_req, res) => {
  res.json(listMealTypes());
});

metaRouter.get('/cuisines', (_req, res) => {
  res.json(listCuisines());
});

metaRouter.get('/ingredients', (_req, res) => {
  res.json(listIngredientNames());
});

// The "who's in this group" list for the browse page's "Added by" filter --
// deliberately not the admin-only GET /api/auth/users (which includes
// email/role/verification state); every approved member can see this one,
// since it only ever exposes an id and a display name.
metaRouter.get('/contributors', (_req, res) => {
  res.json(listApprovedContributors());
});

// ---------------------------------------------------------------------
// Admin taxonomy management -- see db/recipes.ts's comment block for why
// this exists (cuisines in particular drift from stray parsing output).
// ---------------------------------------------------------------------

const nameSchema = z.object({ name: z.string().min(1) });

metaRouter.get('/meal-types/admin', requireAdmin, (_req, res) => {
  res.json(listMealTypesWithCounts());
});

metaRouter.get('/cuisines/admin', requireAdmin, (_req, res) => {
  res.json(listCuisinesWithCounts());
});

metaRouter.post('/meal-types', requireAdmin, (req, res) => {
  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    createMealType(parsed.data.name);
    res.status(201).json(listMealTypesWithCounts());
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : 'Failed to create meal type' });
  }
});

metaRouter.post('/cuisines', requireAdmin, (req, res) => {
  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    createCuisine(parsed.data.name);
    res.status(201).json(listCuisinesWithCounts());
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : 'Failed to create cuisine' });
  }
});

// Renaming to an already-existing name merges into it -- see
// renameMealType/renameCuisine in db/recipes.ts.
metaRouter.patch('/meal-types/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const parsed = nameSchema.safeParse(req.body);
  if (!Number.isInteger(id) || id <= 0 || !parsed.success) {
    res.status(400).json({ error: 'Invalid id or name' });
    return;
  }
  try {
    renameMealType(id, parsed.data.name);
    res.json(listMealTypesWithCounts());
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to rename meal type' });
  }
});

metaRouter.patch('/cuisines/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const parsed = nameSchema.safeParse(req.body);
  if (!Number.isInteger(id) || id <= 0 || !parsed.success) {
    res.status(400).json({ error: 'Invalid id or name' });
    return;
  }
  try {
    renameCuisine(id, parsed.data.name);
    res.json(listCuisinesWithCounts());
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to rename cuisine' });
  }
});

metaRouter.delete('/meal-types/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  try {
    deleteMealType(id);
    res.json(listMealTypesWithCounts());
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to delete meal type' });
  }
});

metaRouter.delete('/cuisines/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  try {
    deleteCuisine(id);
    res.json(listCuisinesWithCounts());
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to delete cuisine' });
  }
});
