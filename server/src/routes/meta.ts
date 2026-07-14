import { Router } from 'express';
import { listCuisines, listIngredientNames, listMealTypes } from '../db/recipes.js';

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
