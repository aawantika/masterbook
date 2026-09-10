import express from 'express';
import { migrate } from './db/migrate.js';
import { requireAuth } from './middleware/auth.js';
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

app.use('/api/meta', metaRouter);
app.use('/api/recipes', recipesRouter);
app.use('/api', attemptsRouter);
app.use('/api/ingest/manual', manualIngestRouter);
app.use('/api/ingest/website', websiteIngestRouter);
app.use('/api/images', imagesRouter);
app.use('/api/epub', epubRouter);
app.use('/api/auth', authRouter);

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '127.0.0.1';

app.listen(PORT, HOST, () => {
  console.log(`masterbook server listening on http://${HOST}:${PORT}`);
});
