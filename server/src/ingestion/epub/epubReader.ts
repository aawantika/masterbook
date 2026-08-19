import { EPub } from 'epub2';
import { chapterHtmlToBlocks, EpubBlock } from './epubBlocks.js';

export type EpubChapterSummary = {
  flowIndex: number;
  title: string;
};

export type EpubMetadata = {
  title: string | null;
  author: string | null;
};

export async function openEpub(filePath: string): Promise<EPub> {
  return EPub.createAsync(filePath);
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
