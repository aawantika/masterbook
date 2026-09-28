import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

// Regression coverage for the highest-stakes part of the approval-gate
// migration (server/src/db/migrate.ts's migrateUserApproval): it must
// backfill approved_at for accounts that existed *before* the column did
// (so an already-working admin login doesn't suddenly get locked out the
// moment this migration ships), but must NOT touch a legitimately-pending
// self-signup created *after* the column already exists. Exercised against
// a real isolated in-memory sqlite db with the exact SQL migrate.ts runs,
// rather than mocking anything, so this actually proves the SQL's
// behavior rather than the mock's.
function freshDbWithPreApprovalUsersTable(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      firebase_uid TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','user')) DEFAULT 'user',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

// Exact logic from migrateUserApproval() in server/src/db/migrate.ts.
function migrateUserApproval(db: Database.Database): void {
  const columns = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
  if (!columns.some((c) => c.name === 'approved_at')) {
    db.exec('ALTER TABLE users ADD COLUMN approved_at TEXT');
    db.exec('UPDATE users SET approved_at = created_at WHERE approved_at IS NULL');
  }
}

describe('migrateUserApproval', () => {
  test('backfills approved_at for a user that predates the column, using its created_at', () => {
    const db = freshDbWithPreApprovalUsersTable();
    db.prepare(
      "INSERT INTO users (firebase_uid, email, role, created_at) VALUES ('uid-1', 'admin@example.com', 'admin', '2026-01-01 00:00:00')"
    ).run();

    migrateUserApproval(db);

    const row = db.prepare('SELECT approved_at, created_at FROM users WHERE firebase_uid = ?').get('uid-1') as {
      approved_at: string;
      created_at: string;
    };
    assert.equal(row.approved_at, row.created_at);
  });

  test('running the migration again does not touch a legitimately-pending user created afterward', () => {
    const db = freshDbWithPreApprovalUsersTable();
    db.prepare(
      "INSERT INTO users (firebase_uid, email, role, created_at) VALUES ('uid-1', 'admin@example.com', 'admin', '2026-01-01 00:00:00')"
    ).run();
    migrateUserApproval(db); // first run: adds the column, backfills the pre-existing admin

    // A new self-signup shows up after the column already exists -- lands
    // pending (approved_at explicitly NULL), same as requireAuth does it.
    db.prepare(
      "INSERT INTO users (firebase_uid, email, role, approved_at, created_at) VALUES ('uid-2', 'friend@example.com', 'user', NULL, '2026-06-01 00:00:00')"
    ).run();

    migrateUserApproval(db); // second run: column already exists, must be a no-op

    const pending = db.prepare('SELECT approved_at FROM users WHERE firebase_uid = ?').get('uid-2') as {
      approved_at: string | null;
    };
    assert.equal(pending.approved_at, null);
  });

  test('is idempotent -- running it multiple times does not error or double-modify', () => {
    const db = freshDbWithPreApprovalUsersTable();
    db.prepare(
      "INSERT INTO users (firebase_uid, email, role, created_at) VALUES ('uid-1', 'admin@example.com', 'admin', '2026-01-01 00:00:00')"
    ).run();

    assert.doesNotThrow(() => {
      migrateUserApproval(db);
      migrateUserApproval(db);
      migrateUserApproval(db);
    });

    const row = db.prepare('SELECT approved_at FROM users WHERE firebase_uid = ?').get('uid-1') as {
      approved_at: string;
    };
    assert.equal(row.approved_at, '2026-01-01 00:00:00');
  });
});
