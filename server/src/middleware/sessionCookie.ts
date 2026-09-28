import { RequestHandler } from 'express';
import { getFirebaseAuth } from '../auth/firebaseAdmin.js';
import { findUserByFirebaseUid } from '../db/users.js';

// A Firebase session cookie, set by POST /api/auth/session right after
// login. It exists only for raw image requests: <img src> can't carry the
// Authorization: Bearer header every fetch() call uses, so image routes
// check this cookie instead. It's deliberately NOT accepted by the rest of
// the API -- a cookie is sent automatically by the browser, and keeping
// data/mutating routes Bearer-only means there's no CSRF surface to defend.
export const SESSION_COOKIE = 'mb_session';
export const SESSION_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000;

export function readSessionCookie(header: string | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}

// GET/HEAD only -- anything else passes straight through to whatever router
// handles it next (e.g. POST /api/images/fetch-remote, which sits behind
// requireAuth's Bearer check like every other write).
export const requireSessionCookie: RequestHandler = async (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();

  const cookie = readSessionCookie(req.header('cookie'));
  if (!cookie) {
    res.status(401).end();
    return;
  }
  try {
    const decoded = await getFirebaseAuth().verifySessionCookie(cookie);
    // Approved accounts only -- a pending self-signup has a users row but
    // must not see recipe photos or EPUB pages any more than recipe data.
    if (!findUserByFirebaseUid(decoded.uid)?.approvedAt) {
      res.status(403).end();
      return;
    }
  } catch {
    res.status(401).end();
    return;
  }
  next();
};

// Same as requireSessionCookie, plus an admin check -- used only for EPUB
// book images (epubImagesRouter), now that EPUB is admin-only (see
// index.ts). Kept separate from requireSessionCookie itself since that one
// is shared with publicImagesRouter, which every approved user still needs
// for ordinary recipe photos.
export const requireAdminSessionCookie: RequestHandler = async (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();

  const cookie = readSessionCookie(req.header('cookie'));
  if (!cookie) {
    res.status(401).end();
    return;
  }
  try {
    const decoded = await getFirebaseAuth().verifySessionCookie(cookie);
    const user = findUserByFirebaseUid(decoded.uid);
    if (!user?.approvedAt || user.role !== 'admin') {
      res.status(403).end();
      return;
    }
  } catch {
    res.status(401).end();
    return;
  }
  next();
};
