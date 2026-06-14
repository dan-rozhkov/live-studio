import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchDesignTokens } from './token-bridge';

function clearRootCustomProps() {
  const style = document.documentElement.style;
  // Remove any leftover custom properties from prior tests.
  for (let i = style.length - 1; i >= 0; i--) {
    const prop = style[i];
    if (prop.startsWith('--')) style.removeProperty(prop);
  }
}

beforeEach(() => {
  document.head.innerHTML = '';
  clearRootCustomProps();
});

afterEach(() => {
  document.head.innerHTML = '';
  clearRootCustomProps();
  vi.restoreAllMocks();
});

describe('fetchDesignTokens', () => {
  it('returns only --* custom properties set inline on :root, stripped of the -- prefix', () => {
    document.documentElement.style.setProperty('--a', '1px');
    document.documentElement.style.setProperty('--b', 'red');
    document.documentElement.style.setProperty('color', 'blue'); // non-token prop

    const tokens = fetchDesignTokens();

    expect(tokens).toEqual(
      expect.arrayContaining([
        { name: 'a', value: '1px' },
        { name: 'b', value: 'red' },
      ]),
    );
    // The non-custom property must NOT appear.
    expect(tokens.some((t) => t.name === 'color')).toBe(false);
    expect(tokens).toHaveLength(2);
  });

  it('picks up custom properties declared in a :root <style> block', () => {
    const style = document.createElement('style');
    style.textContent = ':root { --c: 2px; --d: blue; }';
    document.head.appendChild(style);

    const tokens = fetchDesignTokens();

    expect(tokens).toEqual(
      expect.arrayContaining([
        { name: 'c', value: '2px' },
        { name: 'd', value: 'blue' },
      ]),
    );
  });

  it('trims whitespace from token values', () => {
    const style = document.createElement('style');
    style.textContent = ':root { --spaced:   10px  ; }';
    document.head.appendChild(style);

    const tokens = fetchDesignTokens();
    const spaced = tokens.find((t) => t.name === 'spaced');
    expect(spaced?.value).toBe('10px');
  });

  it('returns an empty array when no custom properties are defined', () => {
    expect(fetchDesignTokens()).toEqual([]);
  });

  it('does not throw and returns [] when getComputedStyle throws (cross-origin / access error)', () => {
    vi.spyOn(window, 'getComputedStyle').mockImplementation(() => {
      throw new Error('SecurityError: cross-origin stylesheet access');
    });

    expect(() => fetchDesignTokens()).not.toThrow();
    expect(fetchDesignTokens()).toEqual([]);
  });
});
