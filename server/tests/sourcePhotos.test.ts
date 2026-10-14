import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

// Regression coverage for server/src/db/sourcePhotos.ts -- the reference-
// photo attachments (handwritten recipe cards, cookbook pages) that are
// separate from recipes.image_url (the finished-dish photo). The
// highest-stakes behaviors: position assignment must append (not reuse a
// freed slot after a mid-list delete, which could otherwise collide), and
// deleting the parent recipe must cascade-delete its source photos (no
// orphaned rows left behind).
function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE recipes (id INTEGER PRIMARY KEY, title TEXT NOT NULL);
    CREATE TABLE recipe_source_photos (
      id INTEGER PRIMARY KEY,
      recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

// Mirrors listSourcePhotos()/addSourcePhoto()/deleteSourcePhoto() in
// server/src/db/sourcePhotos.ts.
function addSourcePhoto(db: Database.Database, recipeId: number, imageUrl: string): number {
  const { maxPosition } = db
    .prepare('SELECT COALESCE(MAX(position), -1) as maxPosition FROM recipe_source_photos WHERE recipe_id = ?')
    .get(recipeId) as { maxPosition: number };
  const position = maxPosition + 1;
  const result = db
    .prepare('INSERT INTO recipe_source_photos (recipe_id, image_url, position, created_at) VALUES (?, ?, ?, ?)')
    .run(recipeId, imageUrl, position, new Date().toISOString());
  return Number(result.lastInsertRowid);
}

function listSourcePhotos(db: Database.Database, recipeId: number): Array<{ id: number; imageUrl: string; position: number }> {
  return db
    .prepare('SELECT id, image_url as imageUrl, position FROM recipe_source_photos WHERE recipe_id = ? ORDER BY position ASC, id ASC')
    .all(recipeId) as Array<{ id: number; imageUrl: string; position: number }>;
}

function deleteSourcePhoto(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM recipe_source_photos WHERE id = ?').run(id);
}

describe('addSourcePhoto / listSourcePhotos', () => {
  test('appends in order as photos are added', () => {
    const db = freshDb();
    db.prepare("INSERT INTO recipes (id, title) VALUES (1, 'Scan')").run();

    addSourcePhoto(db, 1, '/api/images/a.jpg');
    addSourcePhoto(db, 1, '/api/images/b.jpg');
    addSourcePhoto(db, 1, '/api/images/c.jpg');

    const photos = listSourcePhotos(db, 1);
    assert.deepEqual(
      photos.map((p) => p.imageUrl),
      ['/api/images/a.jpg', '/api/images/b.jpg', '/api/images/c.jpg']
    );
    assert.deepEqual(
      photos.map((p) => p.position),
      [0, 1, 2]
    );
  });

  test('a new photo never reuses a position freed by deleting one from the middle', () => {
    const db = freshDb();
    db.prepare("INSERT INTO recipes (id, title) VALUES (1, 'Scan')").run();
    const idA = addSourcePhoto(db, 1, '/api/images/a.jpg'); // position 0
    addSourcePhoto(db, 1, '/api/images/b.jpg'); // position 1
    addSourcePhoto(db, 1, '/api/images/c.jpg'); // position 2

    deleteSourcePhoto(db, idA); // frees position 0
    addSourcePhoto(db, 1, '/api/images/d.jpg'); // must NOT collide with b/c

    const photos = listSourcePhotos(db, 1);
    assert.deepEqual(
      photos.map((p) => p.imageUrl),
      ['/api/images/b.jpg', '/api/images/c.jpg', '/api/images/d.jpg']
    );
    // No two photos share a position (would indicate a collision bug).
    const positions = photos.map((p) => p.position);
    assert.equal(new Set(positions).size, positions.length);
  });

  test('two different recipes track positions independently', () => {
    const db = freshDb();
    db.prepare("INSERT INTO recipes (id, title) VALUES (1, 'Scan 1'), (2, 'Scan 2')").run();
    addSourcePhoto(db, 1, '/api/images/a.jpg');
    addSourcePhoto(db, 2, '/api/images/x.jpg');

    assert.equal(listSourcePhotos(db, 1).length, 1);
    assert.equal(listSourcePhotos(db, 2).length, 1);
  });
});

describe('deleting a recipe cascades to its source photos', () => {
  test('no orphaned rows remain after the parent recipe is deleted', () => {
    const db = freshDb();
    db.prepare("INSERT INTO recipes (id, title) VALUES (1, 'Scan')").run();
    addSourcePhoto(db, 1, '/api/images/a.jpg');
    addSourcePhoto(db, 1, '/api/images/b.jpg');

    db.prepare('DELETE FROM recipes WHERE id = 1').run();

    const remaining = db.prepare('SELECT COUNT(*) as c FROM recipe_source_photos').get() as { c: number };
    assert.equal(remaining.c, 0);
  });
});
