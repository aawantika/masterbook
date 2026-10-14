import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

// Regression coverage for migrate.ts's migrateFlagMissingImagesNeedsFixing:
// a one-time backlog sweep (not a recurring rule -- see createRecipe/
// updateRecipe in db/recipes.ts for the ongoing half) that flags every
// existing recipe with no image as needing fixing, exactly once. The
// highest-stakes behavior is the "exactly once" part: it must never
// re-flag a recipe whose owner already reviewed and dismissed the flag,
// even though that recipe still has no image and would otherwise match
// the same WHERE clause on a second run.
function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE recipes (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      image_url TEXT,
      needs_fixing_at TEXT
    );
    CREATE TABLE migrations_log (
      name TEXT PRIMARY KEY,
      ran_at TEXT NOT NULL
    );
  `);
  return db;
}

// Exact logic from migrateFlagMissingImagesNeedsFixing() in
// server/src/db/migrate.ts.
function migrateFlagMissingImagesNeedsFixing(db: Database.Database): void {
  const name = 'flag-missing-images-needs-fixing';
  const already = db.prepare('SELECT 1 FROM migrations_log WHERE name = ?').get(name);
  if (already) return;
  db.prepare('UPDATE recipes SET needs_fixing_at = ? WHERE image_url IS NULL AND needs_fixing_at IS NULL').run(
    new Date().toISOString()
  );
  db.prepare('INSERT INTO migrations_log (name, ran_at) VALUES (?, ?)').run(name, new Date().toISOString());
}

describe('migrateFlagMissingImagesNeedsFixing', () => {
  test('flags a recipe with no image and no existing flag', () => {
    const db = freshDb();
    db.prepare("INSERT INTO recipes (id, title, image_url, needs_fixing_at) VALUES (1, 'No photo', NULL, NULL)").run();

    migrateFlagMissingImagesNeedsFixing(db);

    const row = db.prepare('SELECT needs_fixing_at FROM recipes WHERE id = 1').get() as {
      needs_fixing_at: string | null;
    };
    assert.ok(row.needs_fixing_at, 'expected needs_fixing_at to be set');
  });

  test('does not touch a recipe that already has an image', () => {
    const db = freshDb();
    db.prepare(
      "INSERT INTO recipes (id, title, image_url, needs_fixing_at) VALUES (1, 'Has photo', 'https://x/img.jpg', NULL)"
    ).run();

    migrateFlagMissingImagesNeedsFixing(db);

    const row = db.prepare('SELECT needs_fixing_at FROM recipes WHERE id = 1').get() as {
      needs_fixing_at: string | null;
    };
    assert.equal(row.needs_fixing_at, null);
  });

  test('does not re-flag a recipe the owner dismissed, even though it still has no image', () => {
    const db = freshDb();
    db.prepare("INSERT INTO recipes (id, title, image_url, needs_fixing_at) VALUES (1, 'No photo', NULL, NULL)").run();

    migrateFlagMissingImagesNeedsFixing(db); // first run: flags it
    // Owner reviews it and explicitly clears the flag (still no image).
    db.prepare('UPDATE recipes SET needs_fixing_at = NULL WHERE id = 1').run();

    migrateFlagMissingImagesNeedsFixing(db); // second run: must be a no-op (guarded by migrations_log)

    const row = db.prepare('SELECT needs_fixing_at FROM recipes WHERE id = 1').get() as {
      needs_fixing_at: string | null;
    };
    assert.equal(row.needs_fixing_at, null);
  });

  test('is idempotent -- running it multiple times does not error', () => {
    const db = freshDb();
    db.prepare("INSERT INTO recipes (id, title, image_url, needs_fixing_at) VALUES (1, 'No photo', NULL, NULL)").run();

    assert.doesNotThrow(() => {
      migrateFlagMissingImagesNeedsFixing(db);
      migrateFlagMissingImagesNeedsFixing(db);
      migrateFlagMissingImagesNeedsFixing(db);
    });
  });
});
