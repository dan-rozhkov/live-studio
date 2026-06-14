import { describe, it, expect } from 'vitest';
import { isColorValue, isNumericValue } from './css-value';

describe('isColorValue', () => {
  it.each([
    ['#FFF', true],
    ['#aabbccdd', true],
    ['rgb(1 2 3 / .5)', true],
    ['hsl(120deg 50% 50%)', true],
    ['red', true],
    ['transparent', true],
  ])('recognizes %s as a color', (value, expected) => {
    expect(isColorValue(value)).toBe(expected);
  });

  // Characterization: pin the ACTUAL (prefix-based / named-list) behavior.
  it.each([
    // '#gg' is not a valid hex color, but the predicate only checks the '#' prefix.
    ['#gg', true],
    // 'rgb()' is empty/invalid, but the predicate only checks the 'rgb' prefix.
    ['rgb()', true],
    // var(--x) is not a color literal and is not in the named list → false.
    ['var(--x)', false],
  ])('pins current behavior for %s', (value, expected) => {
    expect(isColorValue(value)).toBe(expected);
  });

  it('matches named colors case-insensitively and trims whitespace', () => {
    expect(isColorValue('  RED  ')).toBe(true);
    expect(isColorValue('TRANSPARENT')).toBe(true);
  });

  it('recognizes modern color function prefixes', () => {
    expect(isColorValue('oklch(0.7 0.1 200)')).toBe(true);
    expect(isColorValue('lab(50% 40 59)')).toBe(true);
    expect(isColorValue('color(display-p3 1 0 0)')).toBe(true);
  });
});

describe('isNumericValue', () => {
  it.each([
    ['10.5em', true],
    ['-5px', true],
    ['45deg', true],
    ['0', true],
  ])('recognizes %s as numeric', (value, expected) => {
    expect(isNumericValue(value)).toBe(expected);
  });

  // Characterization: pin the ACTUAL regex behavior.
  it.each([
    // 'fr' is NOT in the unit allow-list, so the unit part fails to match → false.
    ['2fr', false],
    // 'auto' is a keyword, not numeric → false.
    ['auto', false],
    // calc(...) is not a bare number+unit → false.
    ['calc(100% - 10px)', false],
  ])('pins current behavior for %s', (value, expected) => {
    expect(isNumericValue(value)).toBe(expected);
  });

  it('allows optional whitespace between number and unit, and trims input', () => {
    expect(isNumericValue('10 px')).toBe(true);
    expect(isNumericValue('  12px  ')).toBe(true);
  });
});
