import { db } from './client.js';

export const MEAL_TYPES = [
  'Breakfast',
  'Brunch',
  'Lunch',
  'Dinner/Main',
  'Appetizer',
  'Side',
  'Soup',
  'Salad',
  'Snack',
  'Dessert',
  'Baking',
  'Beverage',
  'Sauce/Condiment'
];

// Fixed list (not free-text) — deliberately short and closed, with "Other" as
// the catch-all rather than trying to anticipate every cuisine up front.
export const CUISINE_SUGGESTIONS = [
  'American',
  'Chinese',
  'Korean',
  'Japanese',
  'Indian',
  'Middle Eastern',
  'Greek',
  'Italian',
  'Thai',
  'Vietnamese',
  'Nepali',
  'Other'
];

export function seed(): void {
  const insertMealType = db.prepare('INSERT OR IGNORE INTO meal_types (name) VALUES (?)');
  const insertCuisine = db.prepare('INSERT OR IGNORE INTO cuisines (name) VALUES (?)');

  const seedAll = db.transaction(() => {
    for (const name of MEAL_TYPES) insertMealType.run(name);
    for (const name of CUISINE_SUGGESTIONS) insertCuisine.run(name);
  });

  seedAll();
}

// Cuisine used to be an open free-text list; now it's fixed. Remove any
// leftover cuisines from the old broader seed list that aren't in the new
// list AND aren't actually tagged on any recipe (never delete something a
// recipe still references).
export function pruneStaleCuisines(): void {
  const placeholders = CUISINE_SUGGESTIONS.map(() => '?').join(', ');
  db.prepare(
    `DELETE FROM cuisines
     WHERE name NOT IN (${placeholders})
     AND id NOT IN (SELECT DISTINCT cuisine_id FROM recipe_cuisines)`
  ).run(...CUISINE_SUGGESTIONS);
}
