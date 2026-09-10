import { Router } from 'express';
import { z } from 'zod';
import { getFirebaseAuth } from '../auth/firebaseAdmin.js';
import { createUserRecord, listUsers } from '../db/users.js';
import { requireAdmin } from '../middleware/auth.js';

export const authRouter = Router();

// requireAuth has already run globally (mounted before every router in
// index.ts) by the time any of these handlers execute -- req.user is
// always populated here. No separate public login route exists at all:
// Firebase's client SDK handles login directly against Firebase, never
// through this server.
authRouter.get('/me', (req, res) => {
  res.json(req.user);
});

authRouter.get('/users', requireAdmin, (_req, res) => {
  res.json(listUsers());
});

const createUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'user']).optional()
});

// Creates the Firebase Auth account (no password set) plus the local
// users row. Deliberately does NOT generate/send a password-reset link
// itself -- Admin SDK's generatePasswordResetLink() only builds the link
// string, it doesn't email it. The actual "Firebase sends the email"
// behavior comes from the *client* SDK's sendPasswordResetEmail(), which
// the web AdminUsersPage calls right after this succeeds -- see
// web/src/pages/AdminUsersPage.tsx.
authRouter.post('/users', requireAdmin, async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { email, role } = parsed.data;

  try {
    const firebaseUser = await getFirebaseAuth().createUser({ email });
    const user = createUserRecord(firebaseUser.uid, email, role ?? 'user');
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
