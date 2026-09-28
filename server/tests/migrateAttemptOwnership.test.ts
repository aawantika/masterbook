import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

// Regression coverage for migrate.ts's migrateAttemptOwnership: every
// pre-existing recipe_attempts row (logged before user_id existed) must be
// attributed to whoever owns the recipe it's on -- the only correct
// attribution available, since every attempt so far was logged by the same
// person who added the recipe. Exercised against a real in-memory sqlite
// db with the exact SQL involved.
function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT);
    CREATE TABLE recipes (id INTEGER PRIMARY KEY, title TEXT NOT NULL, user_id INTEGER REFERENCES users(id));
    CREATE TABLE recipe_attempts (
      id INTEGER PRIMARY KEY,
      recipe_id INTEGER NOT NULL REFERENCES recipes(id),
      attempted_at TEXT NOT NULL,
      rating INTEGER,
      notes TEXT
    );
  `);
  return db;
}

// Exact logic from migrateAttemptOwnership() in server/src/db/migrate.ts.
function migrateAttemptOwnership(db: Database.Database): void {
  const columns = db.prepare('PRAGMA table_info(recipe_attempts)').all() as Array<{ name: string }>;
  if (!columns.some((c) => c.name === 'user_id')) {
    db.exec('ALTER TABLE recipe_attempts ADD COLUMN user_id INTEGER REFERENCES users(id)');
    db.exec(`
      UPDATE recipe_attempts
      SET user_id = (SELECT r.user_id FROM recipes r WHERE r.id = recipe_attempts.recipe_id)
      WHERE user_id IS NULL
    `);
  }
}

describe('migrateAttemptOwnership', () => {
  test('backfills a pre-existing attempt onto its recipe owner', () => {
    const db = freshDb();
    db.prepare("INSERT INTO users (id, email) VALUES (1, 'a@example.com')").run();
    db.prepare("INSERT INTO recipes (id, title, user_id) VALUES (1, 'Tacos', 1)").run();
    db.prepare("INSERT INTO recipe_attempts (id, recipe_id, attempted_at, rating) VALUES (1, 1, '2026-01-01', 5)").run();

    migrateAttemptOwnership(db);

    const row = db.prepare('SELECT user_id FROM recipe_attempts WHERE id = 1').get() as { user_id: number | null };
    assert.equal(row.user_id, 1);
  });

  test('an attempt on an unowned recipe is left unattributed, not guessed at', () => {
    const db = freshDb();
    db.prepare("INSERT INTO recipes (id, title, user_id) VALUES (1, 'Legacy soup', NULL)").run();
    db.prepare("INSERT INTO recipe_attempts (id, recipe_id, attempted_at, rating) VALUES (1, 1, '2026-01-01', 3)").run();

    migrateAttemptOwnership(db);

    const row = db.prepare('SELECT user_id FROM recipe_attempts WHERE id = 1').get() as { user_id: number | null };
    assert.equal(row.user_id, null);
  });

  test('is idempotent and does not touch a real (non-backfilled) attribution on a second run', () => {
    const db = freshDb();
    db.prepare("INSERT INTO users (id, email) VALUES (1, 'a@example.com'), (2, 'b@example.com')").run();
    db.prepare("INSERT INTO recipes (id, title, user_id) VALUES (1, 'Tacos', 1)").run();
    db.prepare("INSERT INTO recipe_attempts (id, recipe_id, attempted_at, rating) VALUES (1, 1, '2026-01-01', 5)").run();
    migrateAttemptOwnership(db); // first run: adds column, backfills onto user 1

    // A later attempt, logged by a *different* user than the recipe's
    // owner (the real post-migration behavior once addAttempt sets this
    // directly) -- must survive a second migration run untouched.
    db.prepare(
      "INSERT INTO recipe_attempts (id, recipe_id, user_id, attempted_at, rating) VALUES (2, 1, 2, '2026-02-01', 4)"
    ).run();

    migrateAttemptOwnership(db); // second run: column already exists, must be a no-op

    const row = db.prepare('SELECT user_id FROM recipe_attempts WHERE id = 2').get() as { user_id: number | null };
    assert.equal(row.user_id, 2);
  });
});
