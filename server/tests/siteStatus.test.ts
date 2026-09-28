import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

// Regression coverage for the site-freeze feature's storage layer: the
// single-row seed (server/src/db/migrate.ts's ensureSiteStatusRow) must
// never overwrite an existing row's frozen_at on a repeated boot -- that
// would either silently un-freeze a site an admin deliberately paused, or
// silently re-freeze one they'd already reopened. Exercised against a real
// in-memory sqlite db with the exact SQL involved, not a mock.
function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, role TEXT);
    CREATE TABLE site_status (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      frozen_at TEXT,
      frozen_by INTEGER REFERENCES users(id),
      frozen_message TEXT
    );
  `);
  return db;
}

// Exact logic from ensureSiteStatusRow() in server/src/db/migrate.ts.
function ensureSiteStatusRow(db: Database.Database): void {
  db.exec('INSERT OR IGNORE INTO site_status (id, frozen_at, frozen_by, frozen_message) VALUES (1, NULL, NULL, NULL)');
}

describe('ensureSiteStatusRow', () => {
  test('creates an open (unfrozen) row when none exists yet', () => {
    const db = freshDb();
    ensureSiteStatusRow(db);
    const row = db.prepare('SELECT frozen_at FROM site_status WHERE id = 1').get() as { frozen_at: string | null };
    assert.equal(row.frozen_at, null);
  });

  test('running it again does not clear an existing freeze', () => {
    const db = freshDb();
    db.prepare("INSERT INTO users (id, role) VALUES (1, 'admin')").run();
    ensureSiteStatusRow(db);
    db.prepare("UPDATE site_status SET frozen_at = datetime('now'), frozen_by = 1, frozen_message = 'fixing stuff' WHERE id = 1").run();

    ensureSiteStatusRow(db); // simulates a server restart while frozen

    const row = db.prepare('SELECT frozen_at, frozen_message FROM site_status WHERE id = 1').get() as {
      frozen_at: string | null;
      frozen_message: string | null;
    };
    assert.notEqual(row.frozen_at, null);
    assert.equal(row.frozen_message, 'fixing stuff');
  });

  test('running it again does not re-freeze an already-reopened site', () => {
    const db = freshDb();
    ensureSiteStatusRow(db);
    db.prepare("UPDATE site_status SET frozen_at = datetime('now') WHERE id = 1").run();
    db.prepare('UPDATE site_status SET frozen_at = NULL, frozen_by = NULL, frozen_message = NULL WHERE id = 1').run();

    ensureSiteStatusRow(db); // simulates a server restart while open

    const row = db.prepare('SELECT frozen_at FROM site_status WHERE id = 1').get() as { frozen_at: string | null };
    assert.equal(row.frozen_at, null);
  });
});
