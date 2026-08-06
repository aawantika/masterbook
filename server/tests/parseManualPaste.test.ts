import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseManualPaste } from '../src/ingestion/shared/parseManualPaste.js';

describe('parseManualPaste: title extraction', () => {
  test('title is the first non-blank line', () => {
    const result = parseManualPaste('\n\nMy Recipe\n\nIngredients:\n1 egg');
    assert.equal(result.title, 'My Recipe');
  });

  test('empty input gets a placeholder title and no ingredients/instructions', () => {
    const result = parseManualPaste('');
    assert.equal(result.title, 'Untitled recipe');
    assert.deepEqual(result.ingredients, []);
    assert.deepEqual(result.instructions, []);
  });
});

describe('parseManualPaste: forgiving heading detection', () => {
  // Real-world case: "Ingredients (4 servings):" and "How:" don't match a
  // heading regex that requires the whole line to be just the bare word.
  test('headings with a trailing parenthetical/count still match', () => {
    const result = parseManualPaste(
      'Kimchi Mac and Cheese\n\ningredients (4 servings):\n- 1 box pasta\n- 1 cup kimchi\n\nhow:\n1. boil pasta\n2. mix'
    );
    assert.equal(result.ingredients.length, 2);
    assert.equal(result.ingredients[0].name, 'box pasta');
    assert.equal(result.instructions.length, 2);
    assert.equal(result.instructions[0].text, 'boil pasta');
  });

  test('bare "Ingredients:" / "Instructions:" still work', () => {
    const result = parseManualPaste('Simple Recipe\n\nIngredients:\n1 egg\n\nInstructions:\n1. Cook it');
    assert.equal(result.ingredients.length, 1);
    assert.equal(result.instructions.length, 1);
  });

  test('bare heading with no colon at all still works', () => {
    const result = parseManualPaste('Simple Recipe\n\nIngredients\n1 egg\n\nSteps\n1. Cook it');
    assert.equal(result.ingredients.length, 1);
    assert.equal(result.instructions.length, 1);
  });

  // Regression: an earlier version of the "forgiving" heading regex matched
  // on word-start only (`/^how(?:\s+to)?\b/i`), which meant an ordinary
  // sentence starting with "How to..." got misdetected as the instructions
  // heading — silently dropping everything above it (including real
  // ingredients) into nowhere. The fix requires the whole line to be just
  // the heading word plus an optional "(...)"/colon, not a real sentence.
  test('a mid-content sentence starting with "How to" is NOT treated as a heading', () => {
    const result = parseManualPaste(
      'Roux Tips\n\nIngredients:\n1 cup flour\n1 cup butter\n\nInstructions:\n1. Melt butter\nHow to fix a broken roux: whisk harder\n2. Add flour'
    );
    assert.equal(result.ingredients.length, 2, 'both ingredients must survive');
    assert.equal(result.instructions.length, 3, 'the how-to sentence must stay as a step, not become a heading');
    assert.ok(result.instructions.some((step) => step.text.includes('How to fix a broken roux')));
  });
});

describe('parseManualPaste: blank-line-block fallback (no headings at all)', () => {
  test('first block after the title is ingredients, the rest is instructions', () => {
    const result = parseManualPaste('Gochujang Sauce\n\n1/2 cup gochujang\n1/4 cup sesame oil\n\nMix everything\nServe warm');
    assert.equal(result.ingredients.length, 2);
    assert.equal(result.ingredients[0].name, 'gochujang');
    assert.equal(result.instructions.length, 2);
    assert.equal(result.instructions[0].text, 'Mix everything');
  });

  test('a single block with no second blank-line-separated section produces no instructions', () => {
    const result = parseManualPaste('Title\n\n1 cup flour\n2 eggs');
    assert.equal(result.ingredients.length, 2);
    assert.equal(result.instructions.length, 0);
  });
});

describe('parseManualPaste: leading marker stripping', () => {
  // WP Recipe Maker's printable checklist export prefixes every ingredient
  // with a "▢" glyph glued directly to the text (no space) -- this used to
  // defeat the quantity/unit regex entirely since it expects the line to
  // start with the quantity itself.
  test('strips WP Recipe Maker checkbox glyphs (▢ □ ☐)', () => {
    const result = parseManualPaste(
      'Gochujang Sauce\n\nIngredients:\n▢1/2 cup gochujang (Korean chili paste)\n▢4 tsp minced garlic\n\nInstructions:\n□Mix\n☐Serve'
    );
    assert.equal(result.ingredients.length, 2);
    assert.equal(result.ingredients[0].quantity, '1/2');
    assert.equal(result.ingredients[0].unit, 'cup');
    assert.equal(result.ingredients[1].quantity, '4');
    assert.equal(result.instructions[0].text, 'Mix');
    assert.equal(result.instructions[1].text, 'Serve');
  });

  test('strips dash/asterisk/bullet markers', () => {
    const result = parseManualPaste('Title\n\nIngredients:\n- 1 egg\n* 2 eggs\n• 3 eggs');
    assert.deepEqual(
      result.ingredients.map((i) => i.quantity),
      ['1', '2', '3']
    );
  });

  test('strips numbered-list markers ("1." and "1)")', () => {
    const result = parseManualPaste('Title\n\nIngredients:\n1. 1 egg\n\nInstructions:\n1) Crack egg\n2. Cook egg');
    assert.equal(result.ingredients[0].quantity, '1');
    assert.equal(result.instructions[0].text, 'Crack egg');
    assert.equal(result.instructions[1].text, 'Cook egg');
  });

  // Regression: a real ingredient quantity written as a decimal ("3.5
  // tbsp") starts with digits-then-period, which the numbered-list-marker
  // pattern (`\d+[.)]`) also matches -- without a negative lookahead for a
  // following digit, "3.5 tbsp tapioca starch" got misread as list marker
  // "3." + remainder "5 tbsp tapioca starch", silently turning 3.5 into 5.
  test('a decimal ingredient quantity is not mistaken for a numbered-list marker', () => {
    const result = parseManualPaste('Title\n\nIngredients:\n3.5 tbsp tapioca starch\n2.5 tbsp mochiko');
    assert.equal(result.ingredients[0].quantity, '3.5');
    assert.equal(result.ingredients[0].name, 'tapioca starch');
    assert.equal(result.ingredients[1].quantity, '2.5');
  });

  test('a real numbered-list marker followed by a decimal-looking step still strips correctly', () => {
    const result = parseManualPaste('Title\n\nIngredients:\n1 egg\n\nInstructions:\n1. Preheat oven\n2. Bake 3.5 hours');
    assert.equal(result.instructions[0].text, 'Preheat oven');
    assert.equal(result.instructions[1].text, 'Bake 3.5 hours');
  });
});
