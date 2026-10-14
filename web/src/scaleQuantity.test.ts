import { describe, expect, it } from 'vitest';
import { normalizeUnitSpacing } from './scaleQuantity';

describe('normalizeUnitSpacing', () => {
  // Exact lines pasted by a real recipe (masterbook.frostedpeaks.app/recipes/52)
  // that showed up with inconsistent spacing -- some ingredients had a space
  // between the number and unit ("113 g"), others didn't ("140g"), because
  // rawText preserves whatever spacing the original source used verbatim.
  it('inserts a space between a number and an immediately-adjacent unit', () => {
    expect(normalizeUnitSpacing('140g dark brown sugar')).toBe('140 g dark brown sugar');
    expect(normalizeUnitSpacing('70g white sugar')).toBe('70 g white sugar');
    expect(normalizeUnitSpacing('5g (1 tsp) vanilla paste')).toBe('5 g (1 tsp) vanilla paste');
    expect(normalizeUnitSpacing('1g (1/4 tsp) salt')).toBe('1 g (1/4 tsp) salt');
    expect(normalizeUnitSpacing('140g bitter sweet chocolate')).toBe('140 g bitter sweet chocolate');
  });

  it('leaves already-spaced units untouched', () => {
    expect(normalizeUnitSpacing('113 g (1 stick) of melted salted butter (85-95 degrees)')).toBe(
      '113 g (1 stick) of melted salted butter (85-95 degrees)'
    );
    expect(normalizeUnitSpacing('15 g (1 tbsp) heavy cream')).toBe('15 g (1 tbsp) heavy cream');
    expect(normalizeUnitSpacing('2 g (1/2 tsp) baking soda')).toBe('2 g (1/2 tsp) baking soda');
  });

  it('leaves lines with no unit abbreviation untouched', () => {
    expect(normalizeUnitSpacing('1 egg yolk')).toBe('1 egg yolk');
  });

  it('handles multiple other common unit abbreviations', () => {
    expect(normalizeUnitSpacing('250ml milk')).toBe('250 ml milk');
    expect(normalizeUnitSpacing('2kg flour')).toBe('2 kg flour');
    expect(normalizeUnitSpacing('1tbsp oil')).toBe('1 tbsp oil');
    expect(normalizeUnitSpacing('1tsp salt')).toBe('1 tsp salt');
    expect(normalizeUnitSpacing('8oz cream cheese')).toBe('8 oz cream cheese');
  });

  // Guards against the regex matching inside a longer word that merely
  // starts with a unit abbreviation, e.g. "1g" inside "1gallon" shouldn't
  // split into "1 gallon" -> "1 g allon".
  it('does not insert a space when the unit letters are part of a longer word', () => {
    expect(normalizeUnitSpacing('1gallon water')).toBe('1gallon water');
  });
});
