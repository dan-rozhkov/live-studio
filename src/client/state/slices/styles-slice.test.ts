import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';

beforeEach(() => {
  useStore.getState().setDesignTokens([]);
});

describe('addDesignToken', () => {
  it('pushes a brand-new token', () => {
    useStore.getState().addDesignToken({ name: 'brand', value: '#0af' });
    expect(useStore.getState().designTokens).toEqual([{ name: 'brand', value: '#0af' }]);
  });

  it('is a no-op when the same name+value already exists (idempotent)', () => {
    useStore.getState().addDesignToken({ name: 'brand', value: '#0af' });
    const before = useStore.getState().designTokens;
    useStore.getState().addDesignToken({ name: 'brand', value: '#0af' });
    const after = useStore.getState().designTokens;
    expect(after).toHaveLength(1);
    // unchanged reference: early-return path does not call set's producer mutation
    expect(after).toBe(before);
  });

  it('replaces the value when the same name gets a new value', () => {
    useStore.getState().addDesignToken({ name: 'brand', value: '#0af' });
    useStore.getState().addDesignToken({ name: 'brand', value: '#f00' });
    const tokens = useStore.getState().designTokens;
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toEqual({ name: 'brand', value: '#f00' });
  });

  it('keeps distinct names as separate entries', () => {
    useStore.getState().addDesignToken({ name: 'brand', value: '#0af' });
    useStore.getState().addDesignToken({ name: 'accent', value: '#f0a' });
    const tokens = useStore.getState().designTokens;
    expect(tokens).toHaveLength(2);
    expect(tokens.map((t) => t.name)).toEqual(['brand', 'accent']);
  });
});
