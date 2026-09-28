import { db } from './client.js';

export type Role = 'admin' | 'user';

export type UserRecord = {
  id: number;
  firebaseUid: string;
  email: string;
  displayName: string | null;
  role: Role;
  approvedAt: string | null;
  createdAt: string;
};

type UserRow = {
  id: number;
  firebase_uid: string;
  email: string;
  display_name: string | null;
  role: Role;
  approved_at: string | null;
  created_at: string;
};

function toUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    firebaseUid: row.firebase_uid,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    approvedAt: row.approved_at,
    createdAt: row.created_at
  };
}

// The name shown anywhere a recipe's owner or a "who's in this group" list
// is displayed -- an admin-set display name if there is one, otherwise the
// part of the email before "@" rather than the raw address. Used both for
// "added by" labels on recipes and the contributors directory (see
// listApprovedContributors below); kept as one function so those two
// surfaces can never drift into showing different things for the same
// person.
export function resolveDisplayName(displayName: string | null, email: string): string {
  return displayName || email.split('@')[0];
}

export function updateDisplayName(id: number, displayName: string | null): UserRecord | null {
  db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(
    displayName?.trim() || null,
    id
  );
  return findUserById(id);
}

export type Contributor = { id: number; name: string };

// Deliberately not the same as listUsers()/GET /api/auth/users (admin-only,
// includes email/role/verification state) -- this is the "who's in this
// group" list every approved member can see, for filtering "added by" on
// the browse page. Only approved accounts: a pending signup can't have
// added any recipes yet (requireApproved blocks recipe creation), so
// they'd never meaningfully appear as a filter option anyway.
export function listApprovedContributors(): Contributor[] {
  const rows = db
    .prepare("SELECT id, email, display_name FROM users WHERE approved_at IS NOT NULL ORDER BY created_at ASC")
    .all() as Array<{ id: number; email: string; display_name: string | null }>;
  return rows.map((row) => ({ id: row.id, name: resolveDisplayName(row.display_name, row.email) }));
}

// `approved` controls whether this account can use anything beyond
// GET /api/auth/me right away. true for the bootstrap first-ever login and
// admin-initiated invites (an admin already vouched for them); false for
// self-signup, which lands pending until an admin approves it explicitly
// (see PATCH /api/auth/users/:id/approve).
export function createUserRecord(
  firebaseUid: string,
  email: string,
  role: Role = 'user',
  approved: boolean = true
): UserRecord {
  const result = db
    .prepare('INSERT INTO users (firebase_uid, email, role, approved_at) VALUES (?, ?, ?, ?)')
    .run(firebaseUid, email, role, approved ? new Date().toISOString() : null);
  return toUser(
    db.prepare('SELECT * FROM users WHERE id = ?').get(Number(result.lastInsertRowid)) as UserRow
  );
}

export function approveUser(id: number): UserRecord | null {
  db.prepare('UPDATE users SET approved_at = ? WHERE id = ? AND approved_at IS NULL').run(
    new Date().toISOString(),
    id
  );
  return findUserById(id);
}

export function findUserByFirebaseUid(firebaseUid: string): UserRecord | null {
  const row = db.prepare('SELECT * FROM users WHERE firebase_uid = ?').get(firebaseUid) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export function findUserById(id: number): UserRecord | null {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export function listUsers(): UserRecord[] {
  const rows = db.prepare('SELECT * FROM users ORDER BY created_at ASC').all() as UserRow[];
  return rows.map(toUser);
}
