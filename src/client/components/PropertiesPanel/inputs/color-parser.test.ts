import { describe, it, expect } from 'vitest';
import {
  parseCssColor,
  hsvaToHex,
  hsvaToRgba,
} from './ColorInput';

/**
 * Tests for the CSS color parser (parseCssColor) and its round-trips.
 * Red-then-fix targets from docs/code-review-2026-06-10.md P1.14:
 *  - named colors not recognized
 *  - rgb() with percentage channels not parsed
 *  - hsl() with an angle unit on the hue (deg/turn/...) not parsed
 *  - unanchored regex mis-parses color-mix(...) as the inner rgb() -> corruption
 */

const hex = (v: string) => {
  const hsva = parseCssColor(v);
  return hsva ? hsvaToHex(hsva) : null;
};

describe('parseCssColor — established formats (round-trip)', () => {
  it('parses transparent', () => {
    expect(parseCssColor('transparent')).toEqual({ h: 0, s: 0, v: 0, a: 0 });
  });

  it('parses 3/6/8-digit hex', () => {
    expect(hex('#abc')).toBe('#aabbcc');
    expect(hex('#aabbcc')).toBe('#aabbcc');
    expect(hex('#ff0000')).toBe('#ff0000');
    const a = parseCssColor('#aabbcc80');
    expect(a && Math.round(a.a * 255)).toBe(0x80);
  });

  it('rejects malformed hex', () => {
    expect(parseCssColor('#gg')).toBeNull();
    expect(parseCssColor('#12345')).toBeNull();
  });

  it('parses comma rgb / rgba', () => {
    expect(hex('rgb(255, 0, 0)')).toBe('#ff0000');
    const a = parseCssColor('rgba(0, 0, 0, 0.5)');
    expect(a?.a).toBe(0.5);
  });

  it('parses space-separated rgb with slash alpha', () => {
    const c = parseCssColor('rgb(1 2 3 / 0.5)');
    expect(c).not.toBeNull();
    const { r, g, b, a } = hsvaToRgba(c!);
    expect([r, g, b, a]).toEqual([1, 2, 3, 0.5]);
  });

  it('parses hsl/hsla without an angle unit', () => {
    expect(hex('hsl(0, 100%, 50%)')).toBe('#ff0000');
    expect(hex('hsl(120 100% 50%)')).toBe('#00ff00');
  });

  it('returns null for unrelated values', () => {
    expect(parseCssColor('not-a-color')).toBeNull();
    expect(parseCssColor('var(--x)')).toBeNull();
  });
});

describe('parseCssColor — P1.14 fixes', () => {
  it('recognizes CSS named colors (case-insensitive)', () => {
    expect(hex('red')).toBe('#ff0000');
    expect(hex('white')).toBe('#ffffff');
    expect(hex('black')).toBe('#000000');
    expect(hex('tomato')).toBe('#ff6347');
    expect(hex('rebeccapurple')).toBe('#663399');
    expect(hex('RED')).toBe('#ff0000');
  });

  it('parses rgb() with percentage channels', () => {
    expect(hex('rgb(100%, 0%, 0%)')).toBe('#ff0000');
    expect(hex('rgb(100% 100% 100%)')).toBe('#ffffff');
  });

  it('parses hsl() with an angle unit on the hue', () => {
    expect(hex('hsl(120deg 100% 50%)')).toBe('#00ff00');
    expect(hex('hsl(0.5turn 100% 50%)')).toBe('#00ffff');
  });

  it('does NOT mis-parse color-mix() as its inner rgb() (no corruption)', () => {
    expect(parseCssColor('color-mix(in srgb, rgb(1 2 3) 50%, white)')).toBeNull();
  });

  it('does NOT mis-parse oklch()/lab() wrappers containing digits', () => {
    expect(parseCssColor('oklch(0.7 0.1 200)')).toBeNull();
  });
});
