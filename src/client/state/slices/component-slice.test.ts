import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';
import type { ComponentProps } from '../../bridge/component-bridge';

function comp(overrides: Partial<ComponentProps> = {}): ComponentProps {
  return {
    name: 'Button',
    source: 'src/Button.tsx:1:1',
    framework: 'react',
    isRoot: true,
    props: { label: 'Hi', count: 1 },
    ...overrides,
  };
}

beforeEach(() => {
  useStore.setState({ selectedComponent: null });
});

describe('setSelectedComponent (sameComponent shallow-equal)', () => {
  it('sets a component when previously null', () => {
    const c = comp();
    useStore.getState().setSelectedComponent(c);
    expect(useStore.getState().selectedComponent).toBe(c);
  });

  it('treats a shallow-equal component as the same — keeps the existing reference', () => {
    const first = comp();
    useStore.getState().setSelectedComponent(first);
    // structurally identical but a different object/props reference
    useStore.getState().setSelectedComponent(comp({ props: { label: 'Hi', count: 1 } }));
    expect(useStore.getState().selectedComponent).toBe(first);
  });

  it('replaces when a prop value differs', () => {
    useStore.getState().setSelectedComponent(comp());
    const changed = comp({ props: { label: 'Bye', count: 1 } });
    useStore.getState().setSelectedComponent(changed);
    expect(useStore.getState().selectedComponent).toBe(changed);
  });

  it('replaces when the prop set size differs', () => {
    useStore.getState().setSelectedComponent(comp());
    const changed = comp({ props: { label: 'Hi', count: 1, extra: true } });
    useStore.getState().setSelectedComponent(changed);
    expect(useStore.getState().selectedComponent).toBe(changed);
  });

  it('replaces when name/source/framework/isRoot differ', () => {
    useStore.getState().setSelectedComponent(comp());
    const changed = comp({ name: 'Card' });
    useStore.getState().setSelectedComponent(changed);
    expect(useStore.getState().selectedComponent).toBe(changed);
  });

  it('clears to null', () => {
    useStore.getState().setSelectedComponent(comp());
    useStore.getState().setSelectedComponent(null);
    expect(useStore.getState().selectedComponent).toBeNull();
  });
});
