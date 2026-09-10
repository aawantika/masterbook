import { db } from './client.js';

export type Role = 'admin' | 'user';

export type UserRecord = {
  id: number;
  firebaseUid: string;
  email: string;
  role: Role;
  createdAt: string;
};

type UserRow = {
  id: number;
  firebase_uid: string;
  email: string;
  role: Role;
  created_at: string;
};

function toUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    firebaseUid: row.firebase_uid,
    email: row.email,
    role: row.role,
    createdAt: row.created_at
  };
}

export function createUserRecord(firebaseUid: string, email: string, role: Role = 'user'): UserRecord {
  const result = db
    .prepare('INSERT INTO users (firebase_uid, email, role) VALUES (?, ?, ?)')
    .run(firebaseUid, email, role);
  return toUser(
    db.prepare('SELECT * FROM users WHERE id = ?').get(Number(result.lastInsertRowid)) as UserRow
  );
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
