import { describe, it, expect } from 'vitest';
import { validateToken } from './validate-token';

describe('validateToken', () => {
  it('accepts a valid name and value with no existing tokens', () => {
    const result = validateToken('bg', '#0af', []);
    expect(result).toEqual({ ok: true, name: 'bg', value: '#0af' });
  });

  it('rejects an empty name', () => {
    const result = validateToken('', '#0af', []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/name/i);
  });

  it('rejects a whitespace-only name', () => {
    const result = validateToken('   ', '#0af', []);
    expect(result.ok).toBe(false);
  });

  it('rejects an empty value', () => {
    const result = validateToken('bg', '   ', []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/value/i);
  });

  it('strips leading dashes from the name', () => {
    const result = validateToken('--bg', '#0af', []);
    expect(result).toEqual({ ok: true, name: 'bg', value: '#0af' });
  });

  it('trims the value', () => {
    const result = validateToken('bg', '  #0af  ', []);
    expect(result).toEqual({ ok: true, name: 'bg', value: '#0af' });
  });

  it('rejects a duplicate name against existing tokens', () => {
    const result = validateToken('bg', '#0af', [{ name: 'bg' }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/exists|duplicate/i);
  });

  it('treats --bg as duplicate of bg', () => {
    const result = validateToken('--bg', '#0af', [{ name: 'bg' }]);
    expect(result.ok).toBe(false);
  });

  it('rejects an invalid CSS value containing a semicolon', () => {
    const result = validateToken('bg', 'red; }', []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/value/i);
  });

  it('rejects a name with illegal identifier characters', () => {
    const result = validateToken('bg color', '#0af', []);
    expect(result.ok).toBe(false);
  });
});
