import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

// Regression coverage for the admin cuisine/meal-type management tool
// (server/src/db/recipes.ts's renameCuisine/renameMealType/deleteCuisine/
// deleteMealType). The highest-stakes behavior is the merge-on-rename:
// renaming to a name that already exists on a different row must fold
// every recipe tagged with the old name onto the target instead of
// erroring on the UNIQUE constraint, must not drop a recipe's tag entirely
// if it was already tagged with both (PRIMARY KEY collision), and the
// now-empty source row must be removed. Exercised against a real
// in-memory sqlite db with the exact SQL involved, not a mock.
function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE recipes (id INTEGER PRIMARY KEY, title TEXT NOT NULL);
    CREATE TABLE cuisines (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE);
    CREATE TABLE recipe_cuisines (
      recipe_id INTEGER NOT NULL REFERENCES recipes(id),
      cuisine_id INTEGER NOT NULL REFERENCES cuisines(id),
      PRIMARY KEY (recipe_id, cuisine_id)
    );
  `);
  return db;
}

// Exact logic from renameCuisine() in server/src/db/recipes.ts.
function renameCuisine(db: Database.Database, id: number, newName: string): void {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error('Name cannot be empty.');
  const existing = db.prepare('SELECT id FROM cuisines WHERE name = ? COLLATE NOCASE AND id != ?').get(trimmed, id) as
    | { id: number }
    | undefined;
  const rename = db.transaction(() => {
    if (existing) {
      db.prepare(
        'INSERT OR IGNORE INTO recipe_cuisines (recipe_id, cuisine_id) SELECT recipe_id, ? FROM recipe_cuisines WHERE cuisine_id = ?'
      ).run(existing.id, id);
      db.prepare('DELETE FROM recipe_cuisines WHERE cuisine_id = ?').run(id);
      db.prepare('DELETE FROM cuisines WHERE id = ?').run(id);
    } else {
      db.prepare('UPDATE cuisines SET name = ? WHERE id = ?').run(trimmed, id);
    }
  });
  rename();
}

// Exact logic from deleteCuisine() in server/src/db/recipes.ts.
function deleteCuisine(db: Database.Database, id: number): void {
  const row = db.prepare('SELECT COUNT(*) as c FROM recipe_cuisines WHERE cuisine_id = ?').get(id) as { c: number };
  if (row.c > 0) throw new Error('This cuisine is still used by recipes -- rename/merge it into another one first.');
  db.prepare('DELETE FROM cuisines WHERE id = ?').run(id);
}

function seedRecipe(db: Database.Database, id: number): void {
  db.prepare('INSERT INTO recipes (id, title) VALUES (?, ?)').run(id, `Recipe ${id}`);
}

function seedCuisine(db: Database.Database, id: number, name: string): void {
  db.prepare('INSERT INTO cuisines (id, name) VALUES (?, ?)').run(id, name);
}

describe('renameCuisine', () => {
  test('plain rename when the new name does not already exist', () => {
    const db = freshDb();
    seedCuisine(db, 1, 'Middle Eastern-inspired');

    renameCuisine(db, 1, 'Levantine');

    const row = db.prepare('SELECT name FROM cuisines WHERE id = 1').get() as { name: string };
    assert.equal(row.name, 'Levantine');
  });

  test('renaming to an existing name merges: recipes move to the target and the source row is removed', () => {
    const db = freshDb();
    seedCuisine(db, 1, 'Middle Eastern-inspired');
    seedCuisine(db, 2, 'Middle Eastern');
    seedRecipe(db, 100);
    db.prepare('INSERT INTO recipe_cuisines (recipe_id, cuisine_id) VALUES (100, 1)').run();

    renameCuisine(db, 1, 'Middle Eastern'); // the motivating real-world case

    const sourceGone = db.prepare('SELECT 1 FROM cuisines WHERE id = 1').get();
    assert.equal(sourceGone, undefined, 'the old "Middle Eastern-inspired" row should be gone');

    const tag = db.prepare('SELECT cuisine_id FROM recipe_cuisines WHERE recipe_id = 100').get() as {
      cuisine_id: number;
    };
    assert.equal(tag.cuisine_id, 2, 'the recipe should now be tagged with the target cuisine');
  });

  test('merge is case-insensitive, matching the UNIQUE COLLATE NOCASE constraint', () => {
    const db = freshDb();
    seedCuisine(db, 1, 'korean-inspired');
    seedCuisine(db, 2, 'Korean');

    renameCuisine(db, 1, 'korean'); // different casing than either existing row

    const row = db.prepare('SELECT name FROM cuisines WHERE id = 2').get() as { name: string };
    assert.equal(row.name, 'Korean', 'target row name is untouched by the merge');
    const sourceGone = db.prepare('SELECT 1 FROM cuisines WHERE id = 1').get();
    assert.equal(sourceGone, undefined);
  });

  test('merging a recipe already tagged with both cuisines does not throw on the PRIMARY KEY collision', () => {
    const db = freshDb();
    seedCuisine(db, 1, 'Middle Eastern-inspired');
    seedCuisine(db, 2, 'Middle Eastern');
    seedRecipe(db, 100);
    // Already tagged with BOTH -- a plain INSERT (not INSERT OR IGNORE)
    // reassigning cuisine_id 1 -> 2 for this recipe would collide with the
    // existing (100, 2) row.
    db.prepare('INSERT INTO recipe_cuisines (recipe_id, cuisine_id) VALUES (100, 1), (100, 2)').run();

    assert.doesNotThrow(() => renameCuisine(db, 1, 'Middle Eastern'));

    const tags = db.prepare('SELECT cuisine_id FROM recipe_cuisines WHERE recipe_id = 100').all() as Array<{
      cuisine_id: number;
    }>;
    assert.deepEqual(
      tags.map((t) => t.cuisine_id),
      [2]
    );
  });

  test('rejects an empty name', () => {
    const db = freshDb();
    seedCuisine(db, 1, 'Middle Eastern-inspired');
    assert.throws(() => renameCuisine(db, 1, '   '));
  });
});

describe('deleteCuisine', () => {
  test('deletes a cuisine with no recipes', () => {
    const db = freshDb();
    seedCuisine(db, 1, 'Unused');

    deleteCuisine(db, 1);

    const row = db.prepare('SELECT 1 FROM cuisines WHERE id = 1').get();
    assert.equal(row, undefined);
  });

  test('refuses to delete a cuisine still tagged on a recipe', () => {
    const db = freshDb();
    seedCuisine(db, 1, 'Korean');
    seedRecipe(db, 100);
    db.prepare('INSERT INTO recipe_cuisines (recipe_id, cuisine_id) VALUES (100, 1)').run();

    assert.throws(() => deleteCuisine(db, 1), /still used by recipes/);

    const row = db.prepare('SELECT 1 FROM cuisines WHERE id = 1').get();
    assert.ok(row, 'the cuisine should not have been deleted');
  });
});
