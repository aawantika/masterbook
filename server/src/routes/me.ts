import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { Router } from 'express';
import { z } from 'zod';
import { imagesDir } from '../db/client.js';
import { updateAvatarUrl, updateDisplayName } from '../db/users.js';
import { EXTENSION_BY_MIME, MAX_IMAGE_BYTES } from './images.js';

// Self-service profile actions -- distinct from the admin-only user
// management under /api/auth/users (routes/auth.ts). Everything here
// always acts on req.user!.id, never a body/param-supplied id, so there's
// no way to edit anyone else's profile through this router.
export const meRouter = Router();

const displayNameSchema = z.object({ displayName: z.string().trim().max(60).nullable() });

meRouter.patch('/display-name', (req, res) => {
  const parsed = displayNameSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  res.json(updateDisplayName(req.user!.id, parsed.data.displayName));
});

// Raw image bytes, keyed off Content-Type -- same convention as the EPUB
// upload route (express.raw() per-route, since the global express.json()
// middleware only engages for application/json bodies and otherwise steps
// aside).
meRouter.post('/avatar', express.raw({ type: Object.keys(EXTENSION_BY_MIME), limit: '20mb' }), (req, res) => {
  const contentType = (req.header('content-type') || '').split(';')[0].trim();
  const extension = EXTENSION_BY_MIME[contentType];
  if (!extension || !Buffer.isBuffer(req.body)) {
    res.status(400).json({ error: `Unsupported image type: ${contentType || 'unknown'}` });
    return;
  }
  if (req.body.byteLength > MAX_IMAGE_BYTES) {
    res.status(413).json({ error: 'Image is too large' });
    return;
  }

  const filename = `${crypto.randomUUID()}.${extension}`;
  fs.writeFileSync(path.join(imagesDir, filename), req.body);
  res.json(updateAvatarUrl(req.user!.id, `/api/images/${filename}`));
});

meRouter.delete('/avatar', (req, res) => {
  res.json(updateAvatarUrl(req.user!.id, null));
});
