export type PermissionUser = { id: number; role: 'admin' | 'user' };
export type OwnedRecipe = { ownerId: number | null };

// A user can delete a recipe they personally added; only an admin can
// delete someone else's. A recipe with no owner (ownerId: null -- legacy
// rows predating accounts, or a data anomaly) can only be deleted by an
// admin, not claimed by whoever happens to click delete first.
export function canDeleteRecipe(recipe: OwnedRecipe, user: PermissionUser): boolean {
  if (user.role === 'admin') return true;
  return recipe.ownerId !== null && recipe.ownerId === user.id;
}

// Same rule as delete: only the recipe's owner (or an admin) can edit it.
// Editing used to be intentionally unrestricted for any logged-in user --
// deliberately reversed per a later request, now that multiple people are
// actually using the app and one person's edits shouldn't silently
// overwrite another's recipe.
export function canEditRecipe(recipe: OwnedRecipe, user: PermissionUser): boolean {
  return canDeleteRecipe(recipe, user);
}
