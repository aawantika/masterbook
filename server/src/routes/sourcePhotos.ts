import { Router } from 'express';
import { z } from 'zod';
import { canEditRecipe } from '../auth/permissions.js';
import { getRecipeById } from '../db/recipes.js';
import { addSourcePhoto, deleteSourcePhoto, findSourcePhotoRecipeId } from '../db/sourcePhotos.js';

export const sourcePhotosRouter = Router();

function parseIdParam(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const addSourcePhotoSchema = z.object({ imageUrl: z.string().min(1) });

// imageUrl is already-uploaded (via POST /api/images/upload, same as the
// recipe's main image_url) -- this just attaches it to the recipe. Gated
// the same as PUT /recipes/:id (owner or admin) -- source photos are
// recipe content, same as everything else that route edits.
sourcePhotosRouter.post('/recipes/:id/source-photos', (req, res) => {
  const recipeId = parseIdParam(req.params.id);
  if (!recipeId) {
    res.status(400).json({ error: 'Invalid recipe id' });
    return;
  }

  const recipe = getRecipeById(recipeId, req.user!.id);
  if (!recipe) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }
  if (!canEditRecipe(recipe, req.user!)) {
    res.status(403).json({ error: "Only this recipe's creator or an admin can add source photos" });
    return;
  }

  const parsed = addSourcePhotoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  addSourcePhoto(recipeId, parsed.data.imageUrl);
  res.status(201).json(getRecipeById(recipeId, req.user!.id));
});

sourcePhotosRouter.delete('/source-photos/:id', (req, res) => {
  const id = parseIdParam(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }

  const recipeId = findSourcePhotoRecipeId(id);
  if (!recipeId) {
    res.status(404).json({ error: 'Source photo not found' });
    return;
  }
  const recipe = getRecipeById(recipeId, req.user!.id);
  if (!recipe || !canEditRecipe(recipe, req.user!)) {
    res.status(403).json({ error: "Only this recipe's creator or an admin can remove source photos" });
    return;
  }

  deleteSourcePhoto(id);
  res.status(204).send();
});
