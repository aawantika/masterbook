import { Router } from 'express';
import { listCuisines, listIngredientNames, listMealTypes } from '../db/recipes.js';
import { listApprovedContributors } from '../db/users.js';

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
