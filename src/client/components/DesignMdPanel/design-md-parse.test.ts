import { describe, expect, it } from 'vitest';
import { contrastRatio, parseDesignMd, resolveRef, toCssLength } from './design-md-parse';

describe('parseDesignMd', () => {
  it('parses YAML front matter and body', () => {
    const parsed = parseDesignMd(`---
name: Studio
colors:
  primary: '#336699'
---
# Notes`);

    expect(parsed.error).toBeUndefined();
    expect(parsed.doc.name).toBe('Studio');
    expect(parsed.doc.colors?.primary).toBe('#336699');
    expect(parsed.body.trim()).toBe('# Notes');
  });

  it('returns body with an error when front matter is missing', () => {
    const parsed = parseDesignMd('# Notes');

    expect(parsed.doc).toEqual({});
    expect(parsed.body).toBe('# Notes');
    expect(parsed.error).toBe('No YAML front matter found.');
  });

  it('returns a YAML parse error without throwing', () => {
    const parsed = parseDesignMd(`---
name: [unterminated
---
Body`);

    expect(parsed.doc).toEqual({});
    expect(parsed.body.trim()).toBe('Body');
    expect(parsed.error).toContain('YAML parse error:');
  });
});

describe('resolveRef', () => {
  it('resolves nested token references', () => {
    const doc = {
      colors: {
        primary: '#123456',
        accent: '{colors.primary}',
      },
    };

    expect(resolveRef(doc, '{colors.accent}')).toEqual({ value: '#123456' });
  });

  it('reports unresolved and circular references', () => {
    const doc = {
      colors: {
        a: '{colors.b}',
        b: '{colors.a}',
      },
    };

    expect(resolveRef(doc, '{colors.missing}')).toEqual({
      value: '{colors.missing}',
      unresolved: 'colors.missing',
    });
    expect(resolveRef(doc, '{colors.a}')).toEqual({
      value: '{colors.a}',
      unresolved: 'colors.a',
    });
  });
});

describe('design token helpers', () => {
  it('converts numeric lengths to px and leaves string lengths intact', () => {
    expect(toCssLength(8)).toBe('8px');
    expect(toCssLength('1rem')).toBe('1rem');
  });

  it('computes contrast for valid hex colors only', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21);
    expect(contrastRatio('rgb(0 0 0)', '#fff')).toBeNull();
  });
});
