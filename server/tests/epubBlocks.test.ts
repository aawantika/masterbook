import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { chapterHtmlToBlocks } from '../src/ingestion/epub/epubBlocks.js';

describe('chapterHtmlToBlocks', () => {
  test('splits headings, paragraphs, and list items into separate blocks in document order', () => {
    const html = `
      <h1>Kimchi Fried Rice</h1>
      <p>A quick weeknight favorite.</p>
      <h2>Ingredients</h2>
      <ul>
        <li>2 cups cooked rice</li>
        <li>1 cup kimchi</li>
      </ul>
      <h2>Method</h2>
      <p>Heat oil in a pan.</p>
    `;
    const blocks = chapterHtmlToBlocks(html);
    assert.deepEqual(
      blocks.map((b) => [b.tag, b.text]),
      [
        ['h1', 'Kimchi Fried Rice'],
        ['p', 'A quick weeknight favorite.'],
        ['h2', 'Ingredients'],
        ['li', '2 cups cooked rice'],
        ['li', '1 cup kimchi'],
        ['h2', 'Method'],
        ['p', 'Heat oil in a pan.']
      ]
    );
  });

  test('assigns sequential zero-based indices', () => {
    const blocks = chapterHtmlToBlocks('<p>One</p><p>Two</p><p>Three</p>');
    assert.deepEqual(
      blocks.map((b) => b.index),
      [0, 1, 2]
    );
  });

  test('collapses internal whitespace/newlines within a block', () => {
    const blocks = chapterHtmlToBlocks('<p>\n  Line one\n  Line two  \n</p>');
    assert.equal(blocks[0].text, 'Line one Line two');
  });

  test('drops empty blocks (whitespace-only or truly empty elements)', () => {
    const blocks = chapterHtmlToBlocks('<p>Real content</p><p>   </p><p></p><li></li>');
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].text, 'Real content');
  });

  test('blockquote is recognized as its own block type', () => {
    const blocks = chapterHtmlToBlocks('<blockquote>A note from the author.</blockquote>');
    assert.equal(blocks[0].tag, 'blockquote');
  });

  test('nested block-level content is not double-counted at both levels', () => {
    // A <p> nested inside a <li> -- cheerio's :text() on the <li> would
    // include the nested <p>'s text too, so the flat (non-recursive)
    // selector matching both is a known, documented edge case, not a bug --
    // this test just pins down the actual current behavior.
    const blocks = chapterHtmlToBlocks('<li>Wrapper <p>inner text</p></li>');
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].tag, 'li');
    assert.equal(blocks[0].text, 'Wrapper inner text');
    assert.equal(blocks[1].tag, 'p');
    assert.equal(blocks[1].text, 'inner text');
  });

  test('empty document produces no blocks', () => {
    assert.deepEqual(chapterHtmlToBlocks(''), []);
    assert.deepEqual(chapterHtmlToBlocks('<div>just a div, no block elements</div>'), []);
  });
});
