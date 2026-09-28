import { RequestHandler } from 'express';
import { getFirebaseAuth } from '../auth/firebaseAdmin.js';
import { backfillRecipeOwnership } from '../db/migrate.js';
import { createUserRecord, findUserByFirebaseUid, listUsers } from '../db/users.js';

// Verifies a Firebase ID token (sent as `Authorization: Bearer <token>`)
// and resolves it to a local `users` row, attached as req.user -- creating
// that row on first sight if it doesn't exist yet (self-signup lands here
// with a real, Firebase-verified identity but no local row at all). The
// very first login ever (empty users table) bootstraps itself as an
// approved admin; every signup after that is created but left pending
// (approvedAt: null) until an admin approves it via
// PATCH /api/auth/users/:id/approve -- see requireApproved below for where
// that actually gets enforced. This function itself never rejects a
// verified Firebase identity; "can this person do anything yet" is a
// separate, later check.
export const requireAuth: RequestHandler = async (req, res, next) => {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  if (!token) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }

  let decoded;
  try {
    decoded = await getFirebaseAuth().verifyIdToken(token);
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  let user = findUserByFirebaseUid(decoded.uid);
  if (!user) {
    const isFirstEver = listUsers().length === 0;
    user = createUserRecord(decoded.uid, decoded.email ?? '', isFirstEver ? 'admin' : 'user', isFirstEver);
    if (isFirstEver) backfillRecipeOwnership();
  }

  req.user = user;
  next();
};

// Blocks anyone whose account isn't approved yet -- mounted after authRouter
// in index.ts specifically so GET /api/auth/me (and the session/approve
// routes) keep working for a pending user, letting the web client show a
// real "waiting on approval" screen instead of a generic failed request.
export const requireApproved: RequestHandler = (req, res, next) => {
  if (!req.user?.approvedAt) {
    res.status(403).json({ error: 'Your account is pending admin approval.' });
    return;
  }
  next();
};

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
};
