import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { extractRecipeFromHtml } from '../src/ingestion/website/fetchRecipeFromUrl.js';

// Regression coverage for a real bug found on bakeomaniac.com (a page with
// no usable JSON-LD): the no-structured-data fallback used to take the
// entire <body> text, dragging in a "Skip to content" accessibility link
// (became the parsed "title"), byline/date metadata glued onto the title,
// and sidebar/related-post chrome -- all dumped into "instructions" along
// with the real recipe steps. Two follow-up footguns from the fix itself
// are covered too: a blanket [class*="widget"] match deleting real content
// wrapped in a page-builder "widget-area" container, and a blanket
// [class*="sidebar"] match deleting the whole page when <body> itself
// carries a "has-sidebar" layout-flag class.
//
// Fixture intentionally reproduces every one of those trap conditions at
// once, structured with real "Ingredients:"/"Instructions:" headings so
// parseManualPaste's heading-based parser (not the noisier blank-line-block
// fallback) is what's actually exercised here -- same as a real recipe page.
function fixtureHtml(): string {
  return `
    <html>
      <body class="wp-theme-avada has-sidebar fusion-body">
        <a class="skip-link screen-reader-text" href="#content">Skip to content</a>
        <header><nav>Home | Recipes | About</nav></header>
        <div class="fusion-columns fusion-columns-1 fusion-widget-area">
          <article>
            <div class="fusion-post-title-meta-wrap">
              <h1 class="entry-title fusion-post-title">Test Pandan Cake</h1>
              <div class="fusion-meta-info">
                <span class="vcard"><a rel="author">someauthor</a></span>
                <span class="updated">2026-06-30T20:25:46+08:00</span>
                <a rel="category tag">Desserts</a>
              </div>
            </div>
            <div class="post-content">
              Test Pandan Cake

              This is a short introduction to the recipe, long enough to clear
              the real-content length threshold used to pick this container
              over the whole page body when no article/entry-content tag is
              present on a differently-structured page.

              Ingredients:
              1 cup flour
              2 eggs
              1/2 cup sugar

              Instructions:
              Mix the dry ingredients together.
              Whisk in the eggs and sugar.
              Bake at 180C for 20 minutes.

              Details
              Prep time: 10 mins
              Notes: Please do not copy and paste without permission.
            </div>
          </article>
          <div class="sidebar fusion-widget-area fusion-sidebar-right">
            <div class="widget widget_recent_entries">
              <h3>Recent Posts</h3>
              <a href="/other-recipe">A completely unrelated other recipe</a>
              <a href="/another-recipe">Yet another unrelated recipe</a>
            </div>
          </div>
        </div>
        <footer>Copyright 2026</footer>
      </body>
    </html>
  `;
}

describe('extractRecipeFromHtml: no-structured-data fallback', () => {
  test('title is the real recipe title, not the skip-link or glued-on byline/date', () => {
    const result = extractRecipeFromHtml(fixtureHtml(), 'https://example.com/test-pandan-cake');
    assert.equal(result.usedStructuredData, false);
    assert.equal(result.title, 'Test Pandan Cake');
  });

  test('ingredients are extracted from the real content, not the sidebar', () => {
    const result = extractRecipeFromHtml(fixtureHtml(), 'https://example.com/test-pandan-cake');
    const rawTexts = result.ingredients.map((i) => i.rawText.toLowerCase());
    assert.ok(rawTexts.some((t) => t.includes('flour')));
    assert.ok(rawTexts.some((t) => t.includes('egg')));
    assert.ok(rawTexts.some((t) => t.includes('sugar')));
  });

  test('instructions contain the real steps and exclude sidebar/nav/footer text', () => {
    const result = extractRecipeFromHtml(fixtureHtml(), 'https://example.com/test-pandan-cake');
    const allText = result.instructions.map((s) => s.text.toLowerCase()).join(' | ');
    assert.ok(allText.includes('mix the dry ingredients'));
    assert.ok(allText.includes('bake at 180c'));
    // The exact bug this regresses against: sidebar "recent posts" links,
    // the nav menu, and the footer must never show up as "instructions".
    assert.ok(!allText.includes('unrelated other recipe'));
    assert.ok(!allText.includes('recent posts'));
    assert.ok(!allText.includes('home | recipes | about'));
    assert.ok(!allText.includes('copyright 2026'));
  });

  test('does not blow away the whole page when <body> itself has "sidebar" in its class list', () => {
    // The exact bakeomaniac.com failure mode: body class="...has-sidebar...".
    // A naive $('[class*="sidebar"]').remove() matches <body> itself.
    const result = extractRecipeFromHtml(fixtureHtml(), 'https://example.com/test-pandan-cake');
    assert.notEqual(result.title, 'Untitled recipe');
    assert.ok(result.ingredients.length > 0);
    assert.ok(result.instructions.length > 0);
  });

  test('does not delete real content wrapped in a "widget-area"-named container', () => {
    // The other bakeomaniac.com failure mode: the real article sits inside
    // a page-builder wrapper div also named "...widget-area", which a
    // naive $('[class*="widget"]').remove() would delete along with the
    // real actual sidebar widgets.
    const result = extractRecipeFromHtml(fixtureHtml(), 'https://example.com/test-pandan-cake');
    assert.ok(result.rawText.length > 50);
  });
});
