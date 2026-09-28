import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { migrate } from './db/migrate.js';
import { requireApproved, requireAuth } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { metaRouter } from './routes/meta.js';
import { recipesRouter } from './routes/recipes.js';
import { attemptsRouter } from './routes/attempts.js';
import { manualIngestRouter } from './routes/ingest/manual.js';
import { websiteIngestRouter } from './routes/ingest/website.js';
import { imagesRouter, publicImagesRouter } from './routes/images.js';
import { epubRouter, epubImagesRouter } from './routes/epub.js';

migrate();

const app = express();
// Behind Cloudflare Tunnel, the TLS connection ends at Cloudflare and
// cloudflared forwards plain HTTP from the Docker network -- trusting
// X-Forwarded-Proto from loopback/private addresses lets req.secure report
// https correctly, so the session cookie gets its Secure flag.
app.set('trust proxy', 'loopback, uniquelocal');
app.use(express.json());

// Raw image bytes only -- mounted ahead of the auth gate below because
// <img src> requests don't carry the app's Authorization: Bearer header
// the way fetch() calls do. See publicImagesRouter/epubImagesRouter for
// why this narrow exemption is fine. Everything else requires login.
app.use('/api/images', publicImagesRouter);
app.use('/api/epub', epubImagesRouter);

// Every other /api/* route requires a valid Firebase ID token from here
// down -- there's no public login route to exempt, since login happens
// client-side against Firebase directly, never through this server.
app.use('/api', requireAuth);

// authRouter is mounted here, between requireAuth and requireApproved, on
// purpose: GET /me, POST/DELETE /session, and the admin users/approve
// routes all need to work for a verified-but-not-yet-approved self-signup
// (that's exactly how the web client shows a real "pending approval"
// screen instead of a generic failed request). Everything mounted below
// requireApproved needs a fully approved account.
app.use('/api/auth', authRouter);
app.use('/api', requireApproved);

app.use('/api/meta', metaRouter);
app.use('/api/recipes', recipesRouter);
app.use('/api', attemptsRouter);
app.use('/api/ingest/manual', manualIngestRouter);
app.use('/api/ingest/website', websiteIngestRouter);
app.use('/api/images', imagesRouter);
app.use('/api/epub', epubRouter);

// Serves the built web app (web/dist) directly from this same process when
// it's actually present -- true only inside the Docker image (see the root
// Dockerfile, which copies web/dist alongside server/dist under a shared
// /app root so this resolves correctly). In local dev, nobody's built
// web/dist and the Vite dev server serves the frontend separately on its
// own port, proxying /api/* over -- this block is simply a no-op there,
// same code path either way, no separate "production mode" flag needed.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDistPath = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(webDistPath)) {
  app.use(express.static(webDistPath));
  // SPA fallback -- any GET that isn't a static asset or an /api/* route
  // (which would already have been handled above) gets index.html, so
  // client-side routes like /recipes/3 work on a hard refresh too.
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(webDistPath, 'index.html'));
  });
}

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '127.0.0.1';

app.listen(PORT, HOST, () => {
  console.log(`masterbook server listening on http://${HOST}:${PORT}`);
});
