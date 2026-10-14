import { db } from './client.js';

// Reference photos attached to a recipe -- a handwritten recipe card, a
// cookbook page, anything worth keeping around to transcribe from or
// double-check against later. Separate from recipes.image_url (the
// finished-dish photo); see schema.sql for the full reasoning.
export type SourcePhoto = {
  id: number;
  recipeId: number;
  imageUrl: string;
  position: number;
  createdAt: string;
};

export function listSourcePhotos(recipeId: number): SourcePhoto[] {
  const rows = db
    .prepare(
      'SELECT id, recipe_id, image_url, position, created_at FROM recipe_source_photos WHERE recipe_id = ? ORDER BY position ASC, id ASC'
    )
    .all(recipeId) as Array<{
    id: number;
    recipe_id: number;
    image_url: string;
    position: number;
    created_at: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    recipeId: r.recipe_id,
    imageUrl: r.image_url,
    position: r.position,
    createdAt: r.created_at
  }));
}

// Appends to the end -- MAX(position)+1, not a count, so deleting one from
// the middle and adding another never reuses/collides with an existing
// position.
export function addSourcePhoto(recipeId: number, imageUrl: string): SourcePhoto {
  const { maxPosition } = db
    .prepare('SELECT COALESCE(MAX(position), -1) as maxPosition FROM recipe_source_photos WHERE recipe_id = ?')
    .get(recipeId) as { maxPosition: number };
  const position = maxPosition + 1;
  const now = new Date().toISOString();
  const result = db
    .prepare('INSERT INTO recipe_source_photos (recipe_id, image_url, position, created_at) VALUES (?, ?, ?, ?)')
    .run(recipeId, imageUrl, position, now);
  return { id: Number(result.lastInsertRowid), recipeId, imageUrl, position, createdAt: now };
}

// So the route layer can check edit permission on the *recipe* a photo
// belongs to before allowing the delete, without the caller needing to
// already know which recipe that is.
export function findSourcePhotoRecipeId(id: number): number | null {
  const row = db.prepare('SELECT recipe_id FROM recipe_source_photos WHERE id = ?').get(id) as
    | { recipe_id: number }
    | undefined;
  return row?.recipe_id ?? null;
}

export function deleteSourcePhoto(id: number): void {
  db.prepare('DELETE FROM recipe_source_photos WHERE id = ?').run(id);
}
