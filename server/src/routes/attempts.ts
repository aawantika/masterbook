import { Router } from 'express';
import { z } from 'zod';
import { addAttempt, deleteAttempt, getRecipeById } from '../db/recipes.js';

export const attemptsRouter = Router();

const attemptInputSchema = z.object({
  attemptedAt: z.string().min(1),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  notes: z.string().nullable().optional()
});

function parseIdParam(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

attemptsRouter.post('/recipes/:id/attempts', (req, res) => {
  const recipeId = parseIdParam(req.params.id);
  if (!recipeId) return res.status(400).json({ error: 'Invalid recipe id' });

  const recipe = getRecipeById(recipeId);
  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });

  const parsed = attemptInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  addAttempt(recipeId, parsed.data.attemptedAt, parsed.data.rating ?? null, parsed.data.notes ?? null);
  res.status(201).json(getRecipeById(recipeId));
});

attemptsRouter.delete('/attempts/:id', (req, res) => {
  const attemptId = parseIdParam(req.params.id);
  if (!attemptId) return res.status(400).json({ error: 'Invalid attempt id' });

  deleteAttempt(attemptId);
  res.status(204).send();
});
