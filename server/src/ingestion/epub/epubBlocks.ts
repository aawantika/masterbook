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

// Tags remaining after epub2's own script/style/onEvent stripping pass
// (see getChapter() in epub2's lib/epub.js) that could still carry
// executable content if rendered as-is. epub2's own pass is regex-based
// and a reasonable first filter, but this chapter HTML ends up rendered
// via dangerouslySetInnerHTML client-side, so it gets a second, explicit
// allowlist-style pass here rather than trusting a third-party regex to
// have caught everything.
const UNSAFE_TAGS = 'script, style, iframe, object, embed, form, input, button, link, meta, base';

function safeDecodeURI(value: string): string {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
}

function sanitizeForRender($: ReturnType<typeof cheerio.load>): void {
  $(UNSAFE_TAGS).remove();
  $('*').each((_, el) => {
    if (el.type !== 'tag') return;
    for (const name of Object.keys(el.attribs ?? {})) {
      const lower = name.toLowerCase();
      if (lower.startsWith('on')) {
        $(el).removeAttr(name);
        continue;
      }
      if (lower === 'href' || lower === 'src') {
        const value = safeDecodeURI(el.attribs[name] ?? '').trim().toLowerCase();
        if (value.startsWith('javascript:') || value.startsWith('data:text/html')) {
          $(el).removeAttr(name);
        }
      }
    }
  });
}

// Same block/index scheme as chapterHtmlToBlocks (same selector, same
// "skip if no text" rule, run against the same input) but returns the
// chapter's actual rendered markup -- images, formatting, the book's own
// layout -- instead of flattened text, with each matching element tagged
// data-block-index. That lets the full-page reader reuse the exact same
// {flowIndex, blockIndex} coordinates the plain-text block list uses for
// click-to-bookmark, while showing what the book actually looks like.
export function tagChapterBlocks(html: string): string {
  const $ = cheerio.load(html);
  sanitizeForRender($);

  let index = 0;
  $(BLOCK_SELECTOR).each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (!text) return;
    $(el).attr('data-block-index', String(index));
    index++;
  });

  return $('body').html() ?? '';
}
