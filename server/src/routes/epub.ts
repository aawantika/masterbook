import fs from 'node:fs';
import path from 'node:path';
import express, { Router } from 'express';
import { z } from 'zod';
import { epubSourcesDir } from '../db/client.js';
import {
  createEpubSourcePlaceholder,
  deleteEpubSource,
  getEpubSource,
  listEpubSources,
  updateEpubSourceMetadata
} from '../db/epubSources.js';
import { createBookmark, deleteBookmark, getBookmark, listBookmarksForSource } from '../db/epubBookmarks.js';
import { getChapterBlocks, listChapters, openEpub, readMetadata } from '../ingestion/epub/epubReader.js';

export const epubRouter = Router();

function epubFilePath(id: number): string {
  return path.join(epubSourcesDir, `${id}.epub`);
}

// A dropped File's own .type is often empty/application-octet-stream in
// practice for .epub, so the client is expected to explicitly set this
// Content-Type on the upload request rather than relying on the File's
// native type -- express.raw()'s type filter only matches the header, not
// the file extension.
epubRouter.post('/upload', express.raw({ type: 'application/epub+zip', limit: '200mb' }), async (req, res) => {
  const filename = typeof req.query.filename === 'string' ? req.query.filename : 'upload.epub';
  const buffer = req.body;

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    res.status(400).json({ error: 'No file data received' });
    return;
  }
  // EPUB is a zip archive -- cheap magic-byte sanity check before handing
  // it to the parser at all.
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    res.status(400).json({ error: 'That file doesn\'t look like a valid EPUB (not a zip archive).' });
    return;
  }

  const id = createEpubSourcePlaceholder(filename);
  const filePath = epubFilePath(id);

  try {
    fs.writeFileSync(filePath, buffer);
    const epub = await openEpub(filePath);
    const { title, author } = readMetadata(epub);
    updateEpubSourceMetadata(id, title, author);
    res.status(201).json(getEpubSource(id));
  } catch (err) {
    // Not a valid/parseable EPUB -- roll back the placeholder row and
    // whatever got written to disk rather than leaving orphaned state.
    deleteEpubSource(id);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Not a valid EPUB file.' });
  }
});

epubRouter.get('/sources', (_req, res) => {
  res.json(listEpubSources());
});

function parseIdParam(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

epubRouter.get('/sources/:id', async (req, res) => {
  const id = parseIdParam(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  const source = getEpubSource(id);
  if (!source) return res.status(404).json({ error: 'EPUB not found' });

  try {
    const epub = await openEpub(epubFilePath(id));
    res.json({ ...source, chapters: listChapters(epub) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to read EPUB' });
  }
});

epubRouter.get('/sources/:id/chapters/:flowIndex', async (req, res) => {
  const id = parseIdParam(req.params.id);
  const flowIndex = Number(req.params.flowIndex);
  if (!id || !Number.isInteger(flowIndex) || flowIndex < 0) {
    return res.status(400).json({ error: 'Invalid id or chapter index' });
  }

  const source = getEpubSource(id);
  if (!source) return res.status(404).json({ error: 'EPUB not found' });

  try {
    const epub = await openEpub(epubFilePath(id));
    const blocks = await getChapterBlocks(epub, flowIndex);
    res.json({ blocks });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to read chapter' });
  }
});

const createBookmarkSchema = z.object({
  title: z.string().nullable().optional(),
  startFlowIndex: z.number().int().min(0),
  startBlockIndex: z.number().int().min(0),
  endFlowIndex: z.number().int().min(0),
  endBlockIndex: z.number().int().min(0)
});

epubRouter.get('/sources/:id/bookmarks', (req, res) => {
  const id = parseIdParam(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  res.json(listBookmarksForSource(id));
});

epubRouter.post('/sources/:id/bookmarks', (req, res) => {
  const id = parseIdParam(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  if (!getEpubSource(id)) return res.status(404).json({ error: 'EPUB not found' });

  const parsed = createBookmarkSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { title, startFlowIndex, startBlockIndex, endFlowIndex, endBlockIndex } = parsed.data;
  res
    .status(201)
    .json(createBookmark(id, title ?? null, startFlowIndex, startBlockIndex, endFlowIndex, endBlockIndex));
});

epubRouter.delete('/bookmarks/:id', (req, res) => {
  const id = parseIdParam(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  if (!getBookmark(id)) return res.status(404).json({ error: 'Bookmark not found' });

  deleteBookmark(id);
  res.status(204).send();
});
