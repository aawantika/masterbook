import { EPub } from 'epub2';
import { chapterHtmlToBlocks, EpubBlock, tagChapterBlocks } from './epubBlocks.js';

export type EpubChapterSummary = {
  flowIndex: number;
  title: string;
};

export type EpubMetadata = {
  title: string | null;
  author: string | null;
};

// `imageRoot`, when given, becomes the prefix epub2 rewrites every chapter
// <img src> to (see getChapter() in epub2/lib/epub.js) -- e.g. passing
// "/api/epub/sources/1/images/" turns "../images/photo.jpg" into
// "/api/epub/sources/1/images/OEBPS/images/photo.jpg". The trailing part
// is exactly the manifest-relative path epub2 matched internally, which
// resolveImageManifestId() below matches again the same way to serve the
// actual bytes. Only matters for the full-page HTML route -- the
// plain-text block extraction never looks at src attributes at all.
export async function openEpub(filePath: string, imageRoot?: string): Promise<EPub> {
  return imageRoot ? EPub.createAsync(filePath, imageRoot) : EPub.createAsync(filePath);
}

export function readMetadata(epub: EPub): EpubMetadata {
  return {
    title: epub.metadata?.title ?? null,
    author: epub.metadata?.creator ?? null
  };
}

// Strips a "#fragment" so a TOC entry pointing partway into a chapter file
// still matches that chapter's own href for title lookup.
function withoutFragment(href: string | undefined): string | undefined {
  return href?.split('#')[0];
}

// .flow is the actual reading order (one entry per spine/chapter file);
// .toc is a separate nav/NCX-derived list that doesn't always line up 1:1
// with .flow (a TOC entry can point to a #fragment partway into a chapter,
// and chapters with no direct TOC entry -- copyright pages, colophons --
// are common and expected in real cookbook EPUBs). Match by href where
// possible; fall back to "Chapter N" rather than trying to heuristically
// filter out non-recipe chapters, since browsing is manual by design --
// the user just skips past front matter themselves.
export function listChapters(epub: EPub): EpubChapterSummary[] {
  const tocByHref = new Map<string, string>();
  for (const entry of epub.toc ?? []) {
    const href = withoutFragment(entry.href);
    if (href && entry.title && !tocByHref.has(href)) {
      tocByHref.set(href, entry.title.trim());
    }
  }

  return (epub.flow ?? []).map((chapter, flowIndex) => {
    const href = withoutFragment(chapter.href);
    const title = (href && tocByHref.get(href)) || `Chapter ${flowIndex + 1}`;
    return { flowIndex, title };
  });
}

export async function getChapterBlocks(epub: EPub, flowIndex: number): Promise<EpubBlock[]> {
  const chapter = epub.flow?.[flowIndex];
  if (!chapter?.id) throw new Error('Chapter not found');
  const html = await epub.getChapterAsync(chapter.id);
  return chapterHtmlToBlocks(html);
}

// The full-page counterpart to getChapterBlocks -- same chapter, same
// underlying getChapterAsync() call, but returns tagged markup (see
// tagChapterBlocks) for rendering instead of a flat text list. Requires
// the epub to have been opened with an imageRoot for embedded <img> src
// values to resolve to anything servable.
export async function getChapterHtml(epub: EPub, flowIndex: number): Promise<string> {
  const chapter = epub.flow?.[flowIndex];
  if (!chapter?.id) throw new Error('Chapter not found');
  const html = await epub.getChapterAsync(chapter.id);
  return tagChapterBlocks(html);
}

function safeDecodeURI(value: string): string {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
}

function safeEncodeURI(value: string): string {
  try {
    return encodeURI(value);
  } catch {
    return value;
  }
}

// Mirrors epub2's own <img src> manifest-matching (see getChapter() in
// epub2/lib/epub.js): a chapter's rewritten src is `imageRoot + img`,
// where `img` is whichever of an href's raw/decoded/encoded form matched a
// manifest entry. Matching the same three variants here, symmetrically,
// resolves the request path back to that same manifest entry.
export function resolveImageManifestId(epub: EPub, imgPath: string): string | null {
  const manifest = epub.manifest ?? {};
  for (const id of Object.keys(manifest)) {
    const href = manifest[id]?.href;
    if (!href) continue;
    if (href === imgPath || safeDecodeURI(href) === imgPath || safeEncodeURI(href) === imgPath) {
      return id;
    }
  }
  return null;
}
