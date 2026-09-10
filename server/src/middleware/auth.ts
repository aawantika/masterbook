import { RequestHandler } from 'express';
import { getFirebaseAuth } from '../auth/firebaseAdmin.js';
import { createUserRecord, findUserByFirebaseUid, listUsers } from '../db/users.js';

// Verifies a Firebase ID token (sent as `Authorization: Bearer <token>`)
// and resolves it to a local `users` row, attached as req.user. This is
// also where "no public self-signup" is actually enforced at the app
// level: only the very first login ever (when the local users table is
// completely empty) is allowed to bootstrap itself in, and it becomes the
// admin. Every login after that must already have a local row -- created
// by the admin via POST /api/auth/users -- or it's rejected with 403, even
// if the Firebase project itself would technically authenticate them.
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
    if (listUsers().length === 0) {
      user = createUserRecord(decoded.uid, decoded.email ?? '', 'admin');
    } else {
      res.status(403).json({ error: 'This account has not been added to masterbook. Ask the admin to add you.' });
      return;
    }
  }

  req.user = user;
  next();
};

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
};
