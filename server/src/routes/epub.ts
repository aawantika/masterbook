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
import {
  getChapterBlocks,
  getChapterHtml,
  listChapters,
  openEpub,
  readMetadata,
  resolveImageManifestId
} from '../ingestion/epub/epubReader.js';
import { requireSessionCookie } from '../middleware/sessionCookie.js';

export const epubRouter = Router();
// Split out from epubRouter and mounted *before* the requireAuth gate in
// index.ts -- see that file for why: <img src> requests (this reader's
// embedded book images, rendered via dangerouslySetInnerHTML) don't carry
// the app's Authorization: Bearer header the way fetch() calls do, so this
// route is gated by the session cookie instead (see
// middleware/sessionCookie.ts). Book ids are sequential, so unlike recipe
// images these paths would be easy to enumerate if left open.
export const epubImagesRouter = Router();

function epubFilePath(id: number): string {
  return path.join(epubSourcesDir, `${id}.epub`);
}

function imageRootFor(id: number): string {
  return `/api/epub/sources/${id}/images/`;
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

// Recipes already extracted from this book aren't touched -- they're
// tracked by sourceName string match, not a foreign key back to
// epub_sources (see epubSources.ts), so they survive the book being
// removed from the library, same as deleting a website/Instagram "source"
// wouldn't retroactively delete recipes pulled from it.
epubRouter.delete('/sources/:id', (req, res) => {
  const id = parseIdParam(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  if (!getEpubSource(id)) return res.status(404).json({ error: 'EPUB not found' });

  deleteEpubSource(id);
  const filePath = epubFilePath(id);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.status(204).send();
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

// Full-page counterpart to the plain-blocks route above -- same chapter,
// but returns the book's actual markup (tagged with the same
// data-block-index coordinates) so the reader can render it close to how
// the book actually looks, images included, instead of flattened text.
epubRouter.get('/sources/:id/chapters/:flowIndex/html', async (req, res) => {
  const id = parseIdParam(req.params.id);
  const flowIndex = Number(req.params.flowIndex);
  if (!id || !Number.isInteger(flowIndex) || flowIndex < 0) {
    return res.status(400).json({ error: 'Invalid id or chapter index' });
  }

  const source = getEpubSource(id);
  if (!source) return res.status(404).json({ error: 'EPUB not found' });

  try {
    const epub = await openEpub(epubFilePath(id), imageRootFor(id));
    const html = await getChapterHtml(epub, flowIndex);
    res.json({ html });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to read chapter' });
  }
});

// Backs the <img src> URLs the route above rewrites chapter markup to
// point at -- see imageRootFor()/resolveImageManifestId(). The wildcard
// segment is exactly the manifest-relative path epub2 embedded, so it's
// matched straight back against the manifest rather than re-derived.
// Mounted publicly (see epubImagesRouter comment above) -- not on epubRouter.
epubImagesRouter.use('/sources/:id/images', requireSessionCookie);
epubImagesRouter.get('/sources/:id/images/*imgPath', async (req, res) => {
  const id = parseIdParam(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  const source = getEpubSource(id);
  if (!source) return res.status(404).json({ error: 'EPUB not found' });

  const rawPath = req.params.imgPath;
  const imgPath = Array.isArray(rawPath) ? rawPath.join('/') : rawPath;
  if (!imgPath) return res.status(400).json({ error: 'Invalid image path' });

  try {
    const epub = await openEpub(epubFilePath(id), imageRootFor(id));
    const manifestId = resolveImageManifestId(epub, imgPath);
    if (!manifestId) return res.status(404).json({ error: 'Image not found in this book' });

    const [buffer, mediaType] = await epub.getImageAsync(manifestId);
    res.setHeader('Content-Type', mediaType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load image' });
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
