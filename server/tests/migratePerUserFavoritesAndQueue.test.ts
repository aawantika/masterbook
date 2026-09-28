import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

// Regression coverage for migrate.ts's migratePerUserFavoritesAndQueue:
// existing global favorited_at/want_to_try_at values must be attributed to
// each recipe's owner (the only correct attribution available, since every
// recipe so far was both added and favorited/queued by the same single
// user) and the old columns dropped -- exactly once, against a real
// in-memory sqlite db with the exact SQL involved.
function freshDbWithGlobalFlagColumns(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT);
    CREATE TABLE recipes (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id),
      favorited_at TEXT,
      want_to_try_at TEXT
    );
    CREATE TABLE recipe_favorites (
      recipe_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      favorited_at TEXT NOT NULL,
      PRIMARY KEY (recipe_id, user_id)
    );
    CREATE TABLE recipe_want_to_try (
      recipe_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      want_to_try_at TEXT NOT NULL,
      PRIMARY KEY (recipe_id, user_id)
    );
  `);
  return db;
}

// Exact logic from migratePerUserFavoritesAndQueue() in server/src/db/migrate.ts.
function migratePerUserFavoritesAndQueue(db: Database.Database): void {
  const columns = db.prepare('PRAGMA table_info(recipes)').all() as Array<{ name: string }>;
  const names = new Set(columns.map((c) => c.name));

  if (names.has('favorited_at')) {
    db.exec(`
      INSERT OR IGNORE INTO recipe_favorites (recipe_id, user_id, favorited_at)
      SELECT id, user_id, favorited_at FROM recipes
      WHERE favorited_at IS NOT NULL AND user_id IS NOT NULL
    `);
    db.exec('ALTER TABLE recipes DROP COLUMN favorited_at');
  }
  if (names.has('want_to_try_at')) {
    db.exec(`
      INSERT OR IGNORE INTO recipe_want_to_try (recipe_id, user_id, want_to_try_at)
      SELECT id, user_id, want_to_try_at FROM recipes
      WHERE want_to_try_at IS NOT NULL AND user_id IS NOT NULL
    `);
    db.exec('ALTER TABLE recipes DROP COLUMN want_to_try_at');
  }
}

describe('migratePerUserFavoritesAndQueue', () => {
  test('backfills an owned, favorited/queued recipe onto its owner', () => {
    const db = freshDbWithGlobalFlagColumns();
    db.prepare("INSERT INTO users (id, email) VALUES (1, 'a@example.com')").run();
    db.prepare(
      "INSERT INTO recipes (id, title, user_id, favorited_at, want_to_try_at) VALUES (1, 'Tacos', 1, '2026-01-01 00:00:00', '2026-01-02 00:00:00')"
    ).run();

    migratePerUserFavoritesAndQueue(db);

    const fav = db.prepare('SELECT user_id, favorited_at FROM recipe_favorites WHERE recipe_id = 1').get() as {
      user_id: number;
      favorited_at: string;
    };
    const queue = db.prepare('SELECT user_id, want_to_try_at FROM recipe_want_to_try WHERE recipe_id = 1').get() as {
      user_id: number;
      want_to_try_at: string;
    };
    assert.equal(fav.user_id, 1);
    assert.equal(fav.favorited_at, '2026-01-01 00:00:00');
    assert.equal(queue.user_id, 1);
    assert.equal(queue.want_to_try_at, '2026-01-02 00:00:00');
  });

  test('a recipe with no owner is left out of the per-user tables, not attributed to anyone', () => {
    const db = freshDbWithGlobalFlagColumns();
    db.prepare(
      "INSERT INTO recipes (id, title, user_id, favorited_at, want_to_try_at) VALUES (1, 'Legacy soup', NULL, '2026-01-01 00:00:00', NULL)"
    ).run();

    migratePerUserFavoritesAndQueue(db);

    const fav = db.prepare('SELECT count(*) as count FROM recipe_favorites').get() as { count: number };
    assert.equal(fav.count, 0);
  });

  test('a recipe with neither flag set produces no rows', () => {
    const db = freshDbWithGlobalFlagColumns();
    db.prepare("INSERT INTO users (id, email) VALUES (1, 'a@example.com')").run();
    db.prepare("INSERT INTO recipes (id, title, user_id) VALUES (1, 'Plain rice', 1)").run();

    migratePerUserFavoritesAndQueue(db);

    const fav = db.prepare('SELECT count(*) as count FROM recipe_favorites').get() as { count: number };
    const queue = db.prepare('SELECT count(*) as count FROM recipe_want_to_try').get() as { count: number };
    assert.equal(fav.count, 0);
    assert.equal(queue.count, 0);
  });

  test('drops the old columns, and is a no-op (does not error) on a second run', () => {
    const db = freshDbWithGlobalFlagColumns();
    db.prepare("INSERT INTO users (id, email) VALUES (1, 'a@example.com')").run();
    db.prepare(
      "INSERT INTO recipes (id, title, user_id, favorited_at) VALUES (1, 'Tacos', 1, '2026-01-01 00:00:00')"
    ).run();

    migratePerUserFavoritesAndQueue(db);
    const columnsAfter = db.prepare('PRAGMA table_info(recipes)').all() as Array<{ name: string }>;
    assert.equal(columnsAfter.some((c) => c.name === 'favorited_at'), false);
    assert.equal(columnsAfter.some((c) => c.name === 'want_to_try_at'), false);

    assert.doesNotThrow(() => migratePerUserFavoritesAndQueue(db));

    // Still exactly one favorite row -- the second run didn't duplicate or
    // otherwise touch anything (there was nothing left to migrate).
    const fav = db.prepare('SELECT count(*) as count FROM recipe_favorites').get() as { count: number };
    assert.equal(fav.count, 1);
  });
});
