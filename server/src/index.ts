import express from 'express';
import { migrate } from './db/migrate.js';
import { metaRouter } from './routes/meta.js';
import { recipesRouter } from './routes/recipes.js';
import { attemptsRouter } from './routes/attempts.js';
import { manualIngestRouter } from './routes/ingest/manual.js';
import { websiteIngestRouter } from './routes/ingest/website.js';

migrate();

const app = express();
app.use(express.json());

app.use('/api/meta', metaRouter);
app.use('/api/recipes', recipesRouter);
app.use('/api', attemptsRouter);
app.use('/api/ingest/manual', manualIngestRouter);
app.use('/api/ingest/website', websiteIngestRouter);

const PORT = 3001;
const HOST = '127.0.0.1';

app.listen(PORT, HOST, () => {
  console.log(`masterbook server listening on http://${HOST}:${PORT}`);
});
