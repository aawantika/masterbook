import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { Router } from 'express';
import { z } from 'zod';
import { imagesDir } from '../db/client.js';

export const imagesRouter = Router();

// Serves whatever's already been saved locally — GET only, so it doesn't
// interfere with the POST route below on the same mount point.
imagesRouter.use(express.static(imagesDir));

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

const fetchRemoteSchema = z.object({ url: z.string().url() });

// Downloads a remote image (e.g. a signed, time-limited Instagram CDN URL)
// and saves the actual bytes to disk, so the recipe's imageUrl no longer
// depends on a link that expires in a few days.
imagesRouter.post('/fetch-remote', async (req, res) => {
  const parsed = fetchRemoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const response = await fetch(parsed.data.url);
    if (!response.ok) throw new Error(`Source returned ${response.status}`);

    const contentType = response.headers.get('content-type')?.split(';')[0].trim() ?? '';
    const extension = EXTENSION_BY_MIME[contentType];
    if (!extension) throw new Error(`Unsupported image type: ${contentType || 'unknown'}`);

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error('Image is too large');

    const filename = `${crypto.randomUUID()}.${extension}`;
    fs.writeFileSync(path.join(imagesDir, filename), buffer);

    res.json({ imageUrl: `/api/images/${filename}` });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Failed to fetch image' });
  }
});
