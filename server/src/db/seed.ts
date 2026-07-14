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

export const CUISINE_SUGGESTIONS = [
  'Italian',
  'Mexican',
  'Indian',
  'Chinese',
  'Japanese',
  'Thai',
  'Vietnamese',
  'French',
  'Mediterranean',
  'Middle Eastern',
  'Greek',
  'Spanish',
  'Korean',
  'American',
  'Southern',
  'Caribbean',
  'German',
  'British',
  'Fusion'
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
