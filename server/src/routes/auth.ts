import { Router } from 'express';
import { z } from 'zod';
import { getFirebaseAuth } from '../auth/firebaseAdmin.js';
import { approveUser, createUserRecord, listUsers } from '../db/users.js';
import { requireAdmin } from '../middleware/auth.js';
import { SESSION_COOKIE, SESSION_MAX_AGE_MS } from '../middleware/sessionCookie.js';

export const authRouter = Router();

// requireAuth has already run globally (mounted before every router in
// index.ts) by the time any of these handlers execute -- req.user is
// always populated here. No separate public login route exists at all:
// Firebase's client SDK handles login directly against Firebase, never
// through this server.
authRouter.get('/me', (req, res) => {
  res.json(req.user);
});

// Exchanges the (already requireAuth-verified) ID token for a Firebase
// session cookie that image routes accept -- see middleware/sessionCookie.ts.
// The web client calls this on every sign-in / page load, so the cookie's
// 5-day lifetime keeps sliding forward for anyone actively using the app.
authRouter.post('/session', async (req, res) => {
  const idToken = req.header('authorization')!.slice('Bearer '.length);
  try {
    const cookie = await getFirebaseAuth().createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_MS });
    res.cookie(SESSION_COOKIE, cookie, {
      maxAge: SESSION_MAX_AGE_MS,
      httpOnly: true,
      secure: req.secure,
      sameSite: 'lax',
      path: '/api'
    });
    res.status(204).end();
  } catch {
    res.status(401).json({ error: 'Could not create session' });
  }
});

authRouter.delete('/session', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/api' });
  res.status(204).end();
});

authRouter.get('/users', requireAdmin, (_req, res) => {
  res.json(listUsers());
});

const createUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'user']).optional()
});

// Creates the Firebase Auth account (no password set) plus the local
// users row, approved immediately -- an admin creating the account here is
// already the act of vouching for it, distinct from self-signup (see
// requireAuth), which lands pending instead. Deliberately does NOT
// generate/send a password-reset link itself -- Admin SDK's
// generatePasswordResetLink() only builds the link string, it doesn't
// email it. The actual "Firebase sends the email" behavior comes from the
// *client* SDK's sendPasswordResetEmail(), which the web AdminUsersPage
// calls right after this succeeds -- see web/src/pages/AdminUsersPage.tsx.
authRouter.post('/users', requireAdmin, async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { email, role } = parsed.data;

  try {
    const firebaseUser = await getFirebaseAuth().createUser({ email });
    const user = createUserRecord(firebaseUser.uid, email, role ?? 'user', true);
    res.status(201).json(user);
  } catch (err) {
    // Firebase throws a structured error whose `.message` is already
    // human-readable (e.g. "The email address is already in use by
    // another account.") -- surface it directly rather than a generic 500,
    // since a duplicate email is the overwhelmingly likely real cause.
    const message = err && typeof err === 'object' && 'message' in err ? String(err.message) : 'Failed to create user';
    res.status(409).json({ error: message });
  }
});

// Approves a pending self-signup -- see requireAuth (creates the row,
// unapproved) and requireApproved (blocks it everywhere until this runs).
// Idempotent: approving an already-approved user is a harmless no-op
// (approveUser's WHERE clause only touches rows still NULL).
authRouter.patch('/users/:id/approve', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }
  const user = approveUser(id);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(user);
});
