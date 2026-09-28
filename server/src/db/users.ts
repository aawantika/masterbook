import { db } from './client.js';

export type Role = 'admin' | 'user';

export type UserRecord = {
  id: number;
  firebaseUid: string;
  email: string;
  role: Role;
  approvedAt: string | null;
  createdAt: string;
};

type UserRow = {
  id: number;
  firebase_uid: string;
  email: string;
  role: Role;
  approved_at: string | null;
  created_at: string;
};

function toUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    firebaseUid: row.firebase_uid,
    email: row.email,
    role: row.role,
    approvedAt: row.approved_at,
    createdAt: row.created_at
  };
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
