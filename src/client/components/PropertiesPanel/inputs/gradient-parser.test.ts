import { describe, it, expect } from 'vitest';
import {
  parseGradient,
  serializeGradient,
  isGradientValue,
} from './GradientInput';

/**
 * Tests for the CSS gradient parser/serializer and round-trips.
 * Red-then-fix targets from docs/code-review-2026-06-10.md P0.8:
 *  - multi-layer / trailing-content values are swallowed and corrupted
 *    (e.g. `linear-gradient(...), url(...)` loses the url layer)
 *  - standard angle syntax (negative angles, turn/rad units) not parsed
 */

describe('parseGradient — established syntax (round-trip)', () => {
  it('parses a plain linear gradient', () => {
    const g = parseGradient('linear-gradient(red, blue)');
    expect(g?.type).toBe('linear');
    expect(g?.stops.map((s) => s.color)).toEqual(['red', 'blue']);
  });

  it('parses linear with angle and explicit stops', () => {
    const g = parseGradient('linear-gradient(45deg, red 0%, blue 100%)');
    expect(g?.angle).toBe(45);
    expect(g?.stops.map((s) => [s.color, s.position])).toEqual([['red', 0], ['blue', 100]]);
  });

  it('parses radial with shape + position', () => {
    const g = parseGradient('radial-gradient(circle at 30% 30%, red, blue)');
    expect(g?.type).toBe('radial');
    expect(g?.shape).toBe('circle');
    expect(g?.posX).toBe('30%');
    expect(g?.posY).toBe('30%');
  });

  it('parses repeating + px stop unit', () => {
    const g = parseGradient('repeating-linear-gradient(red 0px, blue 20px)');
    expect(g?.repeating).toBe(true);
    expect(g?.stopUnit).toBe('px');
  });

  it('parses conic from-angle', () => {
    const g = parseGradient('conic-gradient(from 45deg, red, blue)');
    expect(g?.type).toBe('conic');
    expect(g?.angle).toBe(45);
  });

  it('returns null for non-gradients', () => {
    expect(parseGradient('none')).toBeNull();
    expect(parseGradient('var(--g)')).toBeNull();
    expect(parseGradient('linear-gradient(red)')).toBeNull(); // <2 stops
  });

  it('round-trips through serialize → parse', () => {
    const css = 'linear-gradient(90deg, red 0%, blue 100%)';
    const g = parseGradient(css)!;
    const reparsed = parseGradient(serializeGradient(g))!;
    expect(reparsed.angle).toBe(90);
    expect(reparsed.stops.map((s) => [s.color, s.position])).toEqual([['red', 0], ['blue', 100]]);
  });
});

describe('isGradientValue — established', () => {
  it('accepts single gradients', () => {
    expect(isGradientValue('linear-gradient(red, blue)')).toBe(true);
    expect(isGradientValue('radial-gradient(circle, red, blue)')).toBe(true);
  });
  it('rejects plain values', () => {
    expect(isGradientValue('none')).toBe(false);
    expect(isGradientValue('var(--g)')).toBe(false);
    expect(isGradientValue('#fff')).toBe(false);
  });
});

describe('parseGradient / isGradientValue — P0.8 fixes', () => {
  it('rejects a gradient followed by another background layer (no corruption)', () => {
    const css = 'linear-gradient(red, blue), url(x.png)';
    expect(isGradientValue(css)).toBe(false);
    expect(parseGradient(css)).toBeNull();
  });

  it('rejects multiple stacked gradients', () => {
    const css = 'linear-gradient(red, blue), radial-gradient(green, yellow)';
    expect(isGradientValue(css)).toBe(false);
    expect(parseGradient(css)).toBeNull();
  });

  it('rejects trailing junk after the closing paren', () => {
    expect(isGradientValue('linear-gradient(red, blue) repeat')).toBe(false);
  });

  it('parses a negative angle', () => {
    const g = parseGradient('linear-gradient(-45deg, red, blue)');
    expect(g?.angle).toBe(-45);
    expect(g?.stops.map((s) => s.color)).toEqual(['red', 'blue']);
  });

  it('parses turn / rad angle units (and does not leak the angle into stops)', () => {
    const turn = parseGradient('linear-gradient(0.25turn, red, blue)');
    expect(turn?.angle).toBe(90); // 0.25turn = 90deg, distinct from the 180 default
    expect(turn?.stops.map((s) => s.color)).toEqual(['red', 'blue']);
    const rad = parseGradient('linear-gradient(1.5708rad, red, blue)');
    expect(Math.round(rad!.angle)).toBe(90);
    expect(rad?.stops.map((s) => s.color)).toEqual(['red', 'blue']);
  });
});

describe.skip('parseGradient — known limitations (deferred, not fixed here)', () => {
  it('conic angular color stops (red 0deg) are not modeled in %/px stop units', () => {
    // parseStopPart treats only %/px positions; deg stops would need a separate model.
  });
  it('double-position stops (red 0% 50%) collapse to a single position', () => {
    // CSS Color 4 double-position syntax is not represented in GradientStop.
  });
});
