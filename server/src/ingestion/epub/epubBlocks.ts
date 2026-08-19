import * as cheerio from 'cheerio';

// One block per heading/paragraph/list-item/blockquote in document order —
// the granularity the reader UI shows as individual checkboxes. Deliberately
// flat (no recursive descent into nested containers): real trade-published
// EPUB chapter markup is near-universally flat paragraph/heading/list
// content rather than deeply nested divs, so double-counting nested block
// content is an acceptable, documented edge case rather than something to
// defensively solve up front.
export type EpubBlock = {
  index: number;
  tag: string;
  text: string;
};

const BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li, blockquote';

// Pure function, no file/network I/O -- takes whatever HTML epub2's
// getChapterAsync() returns for one chapter and splits it into selectable
// text blocks. Tagged with the source element name so the reader UI can
// render headings visually distinct from body text (a scanning eye spots
// recipe titles/section headers faster that way).
export function chapterHtmlToBlocks(html: string): EpubBlock[] {
  const $ = cheerio.load(html);
  const blocks: EpubBlock[] = [];

  $(BLOCK_SELECTOR).each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (!text) return;
    blocks.push({ index: blocks.length, tag: el.tagName.toLowerCase(), text });
  });

  return blocks;
}
