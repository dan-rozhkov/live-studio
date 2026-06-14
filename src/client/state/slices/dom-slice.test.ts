import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';
import type { DomNode } from './dom-slice';

// Depth-4 tree: 1 > 2 > 3 > 4 (leaf), with a sibling branch under node 2.
function makeTree(): DomNode {
  return {
    id: 1,
    tag: 'html',
    children: [
      {
        id: 2,
        tag: 'body',
        children: [
          {
            id: 3,
            tag: 'main',
            children: [{ id: 4, tag: 'span', children: [] }],
          },
          { id: 5, tag: 'aside', children: [] },
        ],
      },
    ],
  };
}

beforeEach(() => {
  useStore.setState({ domTree: null, expandedNodes: {} });
});

describe('expandToNode', () => {
  it('marks every ancestor of a deep leaf as expanded', () => {
    useStore.getState().setDomTree(makeTree());
    useStore.getState().expandToNode(4);
    expect(useStore.getState().expandedNodes).toEqual({ 1: true, 2: true, 3: true, 4: true });
  });

  it('expands only the path to a sibling, not the unrelated branch', () => {
    useStore.getState().setDomTree(makeTree());
    useStore.getState().expandToNode(5);
    expect(useStore.getState().expandedNodes).toEqual({ 1: true, 2: true, 5: true });
    expect(useStore.getState().expandedNodes[3]).toBeUndefined();
    expect(useStore.getState().expandedNodes[4]).toBeUndefined();
  });

  it('does nothing for a missing id (findNodePath returns null)', () => {
    useStore.getState().setDomTree(makeTree());
    useStore.getState().expandToNode(999);
    expect(useStore.getState().expandedNodes).toEqual({});
  });

  it('does nothing when there is no tree', () => {
    useStore.getState().expandToNode(4);
    expect(useStore.getState().expandedNodes).toEqual({});
  });
});
