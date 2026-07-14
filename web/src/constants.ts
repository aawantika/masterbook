// Kept in sync by hand with server/src/ingestion/shared/parseIngredientLine.ts's
// UNIT_ALIASES — server and web are separate npm workspaces with no shared
// package, so this list is duplicated rather than imported.
export const CANONICAL_UNITS = [
  'tbsp',
  'tsp',
  'cup',
  'oz',
  'lb',
  'kg',
  'g',
  'l',
  'ml',
  'clove',
  'pinch',
  'dash',
  'sprig',
  'stalk',
  'can',
  'slice',
  'handful',
  'bunch',
  'package',
  'quart',
  'pint',
  'gallon'
];
