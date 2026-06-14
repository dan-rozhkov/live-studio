import { describe, it, expect } from 'vitest';
import { coalesceOrPush, type Change } from './edit-slice';

const ARROW = ' → ';

function styleChange(value: string, overrides: Partial<Change> = {}): Change {
  return {
    type: 'style',
    element: '#node-1',
    name: 'color',
    value,
    ...overrides,
  };
}

describe('coalesceOrPush', () => {
  it('pushes the first change onto an empty list', () => {
    const changes: Change[] = [];
    coalesceOrPush(changes, styleChange(`4px${ARROW}8px`));
    expect(changes).toHaveLength(1);
    expect(changes[0].value).toBe(`4px${ARROW}8px`);
  });

  it('merges consecutive edits of the same node+property into one A -> C', () => {
    const changes: Change[] = [];
    coalesceOrPush(changes, styleChange(`4px${ARROW}8px`));
    coalesceOrPush(changes, styleChange(`8px${ARROW}12px`));
    expect(changes).toHaveLength(1);
    // keeps original "from" (4px) and adopts the new "to" (12px)
    expect(changes[0].value).toBe(`4px${ARROW}12px`);
  });

  it('removes the entry entirely when a merge cycles back to the original value', () => {
    const changes: Change[] = [];
    coalesceOrPush(changes, styleChange(`4px${ARROW}8px`));
    coalesceOrPush(changes, styleChange(`8px${ARROW}4px`));
    expect(changes).toHaveLength(0);
  });

  it('does NOT merge changes targeting a different node (element)', () => {
    const changes: Change[] = [];
    coalesceOrPush(changes, styleChange(`4px${ARROW}8px`, { element: '#node-1' }));
    coalesceOrPush(changes, styleChange(`8px${ARROW}12px`, { element: '#node-2' }));
    expect(changes).toHaveLength(2);
    expect(changes[0].value).toBe(`4px${ARROW}8px`);
    expect(changes[1].value).toBe(`8px${ARROW}12px`);
  });

  it('does NOT merge changes targeting a different property (name)', () => {
    const changes: Change[] = [];
    coalesceOrPush(changes, styleChange(`4px${ARROW}8px`, { name: 'color' }));
    coalesceOrPush(changes, styleChange(`8px${ARROW}12px`, { name: 'background' }));
    expect(changes).toHaveLength(2);
  });

  it('does NOT merge changes of a different type', () => {
    const changes: Change[] = [];
    coalesceOrPush(changes, styleChange(`4px${ARROW}8px`, { type: 'style' }));
    coalesceOrPush(changes, styleChange(`8px${ARROW}12px`, { type: 'attribute' }));
    expect(changes).toHaveLength(2);
  });

  it('does NOT merge changes targeting a different path', () => {
    const changes: Change[] = [];
    coalesceOrPush(changes, styleChange(`4px${ARROW}8px`, { path: 'a/b' }));
    coalesceOrPush(changes, styleChange(`8px${ARROW}12px`, { path: 'a/c' }));
    expect(changes).toHaveLength(2);
  });

  it('replaces last.value when arrow parts are absent (no "from -> to" format)', () => {
    const changes: Change[] = [];
    coalesceOrPush(changes, styleChange('plain-value'));
    coalesceOrPush(changes, styleChange('newer-value'));
    // same node+property, but values are not in "A -> B" shape -> fallthrough replace
    expect(changes).toHaveLength(1);
    expect(changes[0].value).toBe('newer-value');
  });

  it('chains three consecutive edits into a single A -> D', () => {
    const changes: Change[] = [];
    coalesceOrPush(changes, styleChange(`1px${ARROW}2px`));
    coalesceOrPush(changes, styleChange(`2px${ARROW}3px`));
    coalesceOrPush(changes, styleChange(`3px${ARROW}4px`));
    expect(changes).toHaveLength(1);
    expect(changes[0].value).toBe(`1px${ARROW}4px`);
  });
});
