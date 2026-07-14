import { Router } from 'express';
import { z } from 'zod';
import { parseManualPaste } from '../../ingestion/shared/parseManualPaste.js';

export const manualIngestRouter = Router();

const parseRequestSchema = z.object({ text: z.string().min(1) });

manualIngestRouter.post('/parse', (req, res) => {
  const parsed = parseRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  res.json(parseManualPaste(parsed.data.text));
});
