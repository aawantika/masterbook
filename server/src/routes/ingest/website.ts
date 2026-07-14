import { Router } from 'express';
import { z } from 'zod';
import { fetchRecipeFromUrl } from '../../ingestion/website/fetchRecipeFromUrl.js';

export const websiteIngestRouter = Router();

const fetchRequestSchema = z.object({ url: z.string().url() });

websiteIngestRouter.post('/fetch', async (req, res) => {
  const parsed = fetchRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const draft = await fetchRecipeFromUrl(parsed.data.url);
    res.json(draft);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Failed to fetch recipe from URL' });
  }
});
