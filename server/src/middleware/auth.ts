import { RequestHandler } from 'express';
import { getFirebaseAuth } from '../auth/firebaseAdmin.js';
import { backfillRecipeOwnership } from '../db/migrate.js';
import { createUserRecord, findUserByFirebaseUid, listUsers } from '../db/users.js';
import { getSiteStatus } from '../db/siteStatus.js';

// Local-only convenience -- lets `npm run dev` be previewed without a
// firebase-service-account.json on hand, by skipping real Firebase token
// verification and handing back a synthesized local admin account
// instead. TWO separate conditions must both be true, specifically so
// this can never accidentally activate for real: NODE_ENV must not be
// 'production' (the Docker image always sets it -- see Dockerfile), AND
// DEV_SKIP_AUTH must be explicitly set. Neither is set anywhere in
// docker-compose.yml or the Dockerfile, so the real deployment can't
// enable this short of someone deliberately editing those files.
const DEV_SKIP_AUTH = process.env.NODE_ENV !== 'production' && process.env.DEV_SKIP_AUTH === 'true';
const DEV_USER_FIREBASE_UID = 'local-dev-user';

if (DEV_SKIP_AUTH) {
  // Loud and impossible to miss in the terminal -- this should never be
  // mistaken for a real, secured session.
  console.warn(
    '\n⚠️  DEV_SKIP_AUTH is on -- authentication is DISABLED. Every request is treated as a local admin. ' +
      'Never set this in a real deployment.\n'
  );
}

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
  if (DEV_SKIP_AUTH) {
    let user = findUserByFirebaseUid(DEV_USER_FIREBASE_UID);
    if (!user) {
      user = createUserRecord(DEV_USER_FIREBASE_UID, 'dev@localhost', 'admin', true);
      backfillRecipeOwnership();
    }
    req.user = user;
    next();
    return;
  }

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

// "Freeze the site" -- an admin-only pause on everyone else's writes while
// they're fixing something, without having to boot people out or shut the
// whole app down. Mounted after requireApproved, ahead of every
// content-mutating router (recipes/attempts/ingest/images/epub), so it's
// one check rather than repeating it per-route. GET/HEAD (browsing) is
// always allowed regardless of freeze state; an admin's own requests are
// never blocked, since they're the one doing the fixing.
export const requireSiteNotFrozen: RequestHandler = (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  if (req.user?.role === 'admin') return next();

  const status = getSiteStatus();
  if (status.frozenAt) {
    res.status(503).json({
      error: status.frozenMessage || 'Masterbook is in maintenance mode right now -- try again shortly.',
      frozenAt: status.frozenAt
    });
    return;
  }
  next();
};
