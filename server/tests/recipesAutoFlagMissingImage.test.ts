import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

// Regression coverage for the ongoing (non-migration) half of "auto-flag
// recipes with no image as needing fixing": createRecipe/updateRecipe in
// db/recipes.ts. The highest-stakes behavior is updateRecipe's CASE
// expression -- it must only ever SET needs_fixing_at, never clear it, so
// that removing a photo doesn't accidentally un-flag a recipe that was
// flagged for some unrelated reason, and adding a photo back doesn't
// silently clear a flag either. Exercised against a real in-memory sqlite
// db with the exact SQL involved (trimmed to just the columns this
// behavior touches), not a mock.
function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE recipes (
      id INTEGER PRIMARY KEY,
      image_url TEXT,
      needs_fixing_at TEXT
    );
  `);
  return db;
}

// Mirrors createRecipe()'s logic in server/src/db/recipes.ts.
function insertRecipe(db: Database.Database, id: number, imageUrl: string | null): void {
  const needsFixingAt = imageUrl ? null : new Date().toISOString();
  db.prepare('INSERT INTO recipes (id, image_url, needs_fixing_at) VALUES (?, ?, ?)').run(id, imageUrl, needsFixingAt);
}

// Mirrors updateRecipe()'s needs_fixing_at CASE expression in
// server/src/db/recipes.ts.
function updateRecipeImage(db: Database.Database, id: number, imageUrl: string | null): void {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE recipes SET
      image_url = ?,
      needs_fixing_at = CASE WHEN ? IS NULL AND needs_fixing_at IS NULL THEN ? ELSE needs_fixing_at END
     WHERE id = ?`
  ).run(imageUrl, imageUrl, now, id);
}

describe('auto-flag missing-image recipes as needing fixing (createRecipe/updateRecipe)', () => {
  test('createRecipe flags a brand-new recipe saved with no image', () => {
    const db = freshDb();
    insertRecipe(db, 1, null);
    const row = db.prepare('SELECT needs_fixing_at FROM recipes WHERE id = 1').get() as {
      needs_fixing_at: string | null;
    };
    assert.ok(row.needs_fixing_at);
  });

  test('createRecipe does not flag a recipe saved with an image', () => {
    const db = freshDb();
    insertRecipe(db, 1, 'https://x/img.jpg');
    const row = db.prepare('SELECT needs_fixing_at FROM recipes WHERE id = 1').get() as {
      needs_fixing_at: string | null;
    };
    assert.equal(row.needs_fixing_at, null);
  });

  test('updateRecipe flags an existing recipe if it ends up with no image', () => {
    const db = freshDb();
    insertRecipe(db, 1, 'https://x/img.jpg');
    updateRecipeImage(db, 1, null); // image removed in this edit
    const row = db.prepare('SELECT needs_fixing_at FROM recipes WHERE id = 1').get() as {
      needs_fixing_at: string | null;
    };
    assert.ok(row.needs_fixing_at);
  });

  test('updateRecipe does not clear an existing flag just because an image was added', () => {
    const db = freshDb();
    insertRecipe(db, 1, null); // flagged on create
    const before = db.prepare('SELECT needs_fixing_at FROM recipes WHERE id = 1').get() as {
      needs_fixing_at: string;
    };

    updateRecipeImage(db, 1, 'https://x/img.jpg'); // owner adds a photo in this edit

    const after = db.prepare('SELECT needs_fixing_at, image_url FROM recipes WHERE id = 1').get() as {
      needs_fixing_at: string;
      image_url: string;
    };
    assert.equal(after.image_url, 'https://x/img.jpg');
    // Deliberately NOT auto-cleared -- un-flagging stays a manual action.
    assert.equal(after.needs_fixing_at, before.needs_fixing_at);
  });

  test('updateRecipe does not clobber a flag set for an unrelated reason when an image is removed', () => {
    const db = freshDb();
    insertRecipe(db, 1, 'https://x/img.jpg');
    // Flagged for some other reason while it still had an image (e.g.
    // mangled instructions) -- simulates the user's own manual toggle.
    db.prepare("UPDATE recipes SET needs_fixing_at = '2026-01-01T00:00:00.000Z' WHERE id = 1").run();

    updateRecipeImage(db, 1, null); // image also removed in a later edit

    const row = db.prepare('SELECT needs_fixing_at FROM recipes WHERE id = 1').get() as {
      needs_fixing_at: string;
    };
    assert.equal(row.needs_fixing_at, '2026-01-01T00:00:00.000Z');
  });
});
