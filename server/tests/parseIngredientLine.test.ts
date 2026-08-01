import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseIngredientLine, groupIngredientLinesBySections } from '../src/ingestion/shared/parseIngredientLine.js';

describe('parseIngredientLine: basic quantity/unit/name', () => {
  test('plain "qty unit name"', () => {
    const result = parseIngredientLine('2 tbsp red chilli sauce');
    assert.equal(result.quantity, '2');
    assert.equal(result.unit, 'tbsp');
    assert.equal(result.name, 'red chilli sauce');
  });

  test('unicode vulgar fraction quantity (½ ¼ ¾ etc.)', () => {
    const result = parseIngredientLine('½ cup sugar');
    assert.equal(result.quantity, '½');
    assert.equal(result.unit, 'cup');
    assert.equal(result.name, 'sugar');
  });

  test('en-dash range quantity ("1–2 tsp")', () => {
    const result = parseIngredientLine('1–2 tsp oil');
    assert.equal(result.quantity, '1–2');
    assert.equal(result.unit, 'tsp');
  });

  test('no quantity at all falls back to the whole line as name', () => {
    const result = parseIngredientLine('salt to taste');
    assert.equal(result.quantity, null);
    assert.equal(result.unit, null);
    assert.equal(result.name, 'salt to taste');
  });
});

describe('parseIngredientLine: single-letter unit word-boundary regression', () => {
  // Regression for a real bug: the unit match used to have no trailing \b,
  // so "l" (liter) or "g" (gram) would swallow the first letter of an
  // unrelated word right after a zero-length quantity match.
  test('"large eggs" is not parsed as unit "l" + name "arge eggs"', () => {
    const result = parseIngredientLine('large eggs');
    assert.equal(result.unit, null);
    assert.equal(result.quantity, null);
    assert.equal(result.name, 'large eggs');
  });

  test('a genuine single-letter unit still matches ("2 l milk")', () => {
    const result = parseIngredientLine('2 l milk');
    assert.equal(result.quantity, '2');
    assert.equal(result.unit, 'l');
    assert.equal(result.name, 'milk');
  });
});

describe('parseIngredientLine: WP Recipe Maker structured-data artifacts', () => {
  test('collapses doubled parens: "garlic ((sliced))" -> "garlic (sliced)"', () => {
    const result = parseIngredientLine('garlic ((sliced))');
    assert.equal(result.name, 'garlic (sliced)');
  });

  test('strips a leading comma inside parens: "(, chopped)" -> "(chopped)"', () => {
    const result = parseIngredientLine('onion (, chopped)');
    assert.equal(result.name, 'onion (chopped)');
  });

  test('strips a leading bullet/dash marker', () => {
    const result = parseIngredientLine('- 2 cups flour');
    assert.equal(result.quantity, '2');
    assert.equal(result.unit, 'cup');
    assert.equal(result.name, 'flour');
  });
});

describe('parseIngredientLine: article quantities ("a pinch", "a dash")', () => {
  test('"a pinch of salt" -> quantity 1, unit pinch', () => {
    const result = parseIngredientLine('a pinch of salt');
    assert.equal(result.quantity, '1');
    assert.equal(result.unit, 'pinch');
  });

  test('"an" also works before a unit ("an inch of ginger")', () => {
    const result = parseIngredientLine('an inch of ginger');
    assert.equal(result.quantity, '1');
    assert.equal(result.unit, 'inch');
    assert.equal(result.name, 'of ginger');
  });

  // Regression guard: the article-quantity lookahead only fires when "a"/"an"
  // is immediately followed by a recognized unit word — otherwise ordinary
  // articles like "a large onion" would misfire as a quantity of 1.
  test('"a large onion" is NOT treated as an article quantity', () => {
    const result = parseIngredientLine('a large onion');
    assert.equal(result.quantity, null);
    assert.equal(result.unit, null);
    assert.equal(result.name, 'a large onion');
  });
});

describe('groupIngredientLinesBySections: "For the X:" section headers', () => {
  test('tags each ingredient with the most recently seen section header', () => {
    const result = groupIngredientLinesBySections([
      'For the sauce:',
      '2 tbsp soy sauce',
      'For the rice:',
      '1 cup rice'
    ]);
    assert.equal(result.length, 2);
    assert.equal(result[0].section, 'For the sauce');
    assert.equal(result[0].name, 'soy sauce');
    assert.equal(result[1].section, 'For the rice');
    assert.equal(result[1].name, 'rice');
  });

  test('ingredients before any header get section: null', () => {
    const result = groupIngredientLinesBySections(['1 cup rice', 'For the sauce:', '2 tbsp soy sauce']);
    assert.equal(result[0].section, null);
    assert.equal(result[1].section, 'For the sauce');
  });

  test('blank lines are skipped, not treated as ingredients', () => {
    const result = groupIngredientLinesBySections(['1 cup rice', '', '2 tbsp soy sauce']);
    assert.equal(result.length, 2);
  });
});

describe('parseIngredientLine: bilingual "NAME | translation quantity unit" lines', () => {
  // Real-world case set from a bilingual Instagram recipe card. Devanagari
  // translations are intentionally dropped (not kept in the name) per an
  // explicit later preference change — only the English name survives.
  test('quantity + unit + name, translation dropped ("GARLIC | लहसुन 8-10 CLOVES")', () => {
    const result = parseIngredientLine('GARLIC | लहसुन 8-10 CLOVES');
    assert.equal(result.quantity, '8-10');
    assert.equal(result.unit, 'clove');
    assert.equal(result.name, 'garlic');
    assert.equal(result.rawText, '8-10 cloves garlic');
  });

  test('"inch" unit ("GINGER | अदरक 1 INCH")', () => {
    const result = parseIngredientLine('GINGER | अदरक 1 INCH');
    assert.equal(result.unit, 'inch');
    assert.equal(result.rawText, '1 inch ginger');
  });

  test('"NOS." (with trailing period) is recognized and suppressed from rawText', () => {
    const result = parseIngredientLine('GREEN CHILLI | हरी मिर्च 2 NOS.');
    assert.equal(result.quantity, '2');
    assert.equal(result.unit, 'nos');
    assert.equal(result.name, 'green chilli');
    // "nos" is a bare count, not a real unit word -- kept as the stored
    // unit but left out of the human-readable text.
    assert.equal(result.rawText, '2 green chilli');
  });

  test('"NO." (singular form) also canonicalizes to the "nos" unit', () => {
    const result = parseIngredientLine('BELL PEPPER | बेल पेपर 1 NO.');
    assert.equal(result.unit, 'nos');
    assert.equal(result.rawText, '1 bell pepper');
  });

  test('size descriptor folds into the name ("1 MEDIUM SIZED." -> "medium onion")', () => {
    const result = parseIngredientLine('ONION | प्याज़ 1 MEDIUM SIZED.');
    assert.equal(result.quantity, '1');
    assert.equal(result.unit, null);
    assert.equal(result.name, 'medium onion');
    assert.equal(result.rawText, '1 medium onion');
  });

  test('no extractable quantity/unit falls back to name + preserved leftover ("SALT | नमक TO TASTE")', () => {
    const result = parseIngredientLine('SALT | नमक TO TASTE');
    assert.equal(result.quantity, null);
    assert.equal(result.unit, null);
    // Devanagari is dropped, but real leftover info ("to taste") must
    // survive -- an earlier version of this fallback discarded it entirely.
    assert.equal(result.name, 'salt, to taste');
  });

  test('fallback leftover also works for "AS REQUIRED"', () => {
    const result = parseIngredientLine('HOT WATER | गरम पानी AS REQUIRED');
    assert.equal(result.name, 'hot water, as required');
  });

  test('bilingual output is lowercased even for all-caps brand names', () => {
    const result = parseIngredientLine('KETCHUP | केचप 1 TBSP');
    assert.equal(result.name, 'ketchup');
    assert.equal(result.rawText, '1 tbsp ketchup');
  });
});
