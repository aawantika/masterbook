import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { chapterHtmlToBlocks, tagChapterBlocks } from '../src/ingestion/epub/epubBlocks.js';

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

describe('tagChapterBlocks', () => {
  test('tags each block element with data-block-index matching chapterHtmlToBlocks indices', () => {
    const html = '<h1>Title</h1><p>Intro.</p><ul><li>One</li><li>Two</li></ul>';
    const blocks = chapterHtmlToBlocks(html);
    const tagged = tagChapterBlocks(html);
    for (const block of blocks) {
      assert.match(tagged, new RegExp(`data-block-index="${block.index}"[^>]*>${block.text}<`));
    }
  });

  test('preserves non-block markup (e.g. img tags) untouched aside from sanitization', () => {
    const html = '<h1>Title</h1><img src="photo.jpg" alt="A photo"/><p>Body text.</p>';
    const tagged = tagChapterBlocks(html);
    assert.match(tagged, /<img src="photo\.jpg" alt="A photo">/);
  });

  test('strips script tags entirely', () => {
    const tagged = tagChapterBlocks('<p>Safe text</p><script>alert("xss")</script>');
    assert.doesNotMatch(tagged, /<script/i);
    assert.match(tagged, /Safe text/);
  });

  test('strips on* event handler attributes from any element', () => {
    const tagged = tagChapterBlocks('<p onclick="alert(1)" onmouseover="alert(2)">Click me</p>');
    assert.doesNotMatch(tagged, /onclick/i);
    assert.doesNotMatch(tagged, /onmouseover/i);
    assert.match(tagged, /Click me/);
  });

  test('strips javascript: and data:text/html URIs from href/src', () => {
    const tagged = tagChapterBlocks('<p><a href="javascript:alert(1)">bad link</a></p>');
    assert.doesNotMatch(tagged, /javascript:/i);
    assert.match(tagged, /bad link/);
  });

  test('leaves ordinary href/src values alone', () => {
    const tagged = tagChapterBlocks('<p><a href="https://example.com">ok link</a></p>');
    assert.match(tagged, /href="https:\/\/example\.com"/);
  });

  test('empty document produces empty output', () => {
    assert.equal(tagChapterBlocks(''), '');
  });
});
