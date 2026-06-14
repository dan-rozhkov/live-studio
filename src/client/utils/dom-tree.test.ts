import { describe, it, expect } from 'vitest';
import { findAncestorChain } from './dom-tree';
import type { DomNode } from '../state/slices/dom-slice';

function node(id: number, children: DomNode[] = []): DomNode {
  return { id, tag: 'div', children };
}

// 5-node linear chain: 1 > 2 > 3 > 4 > 5
function makeChain(): DomNode {
  return node(1, [node(2, [node(3, [node(4, [node(5)])])])]);
}

describe('findAncestorChain', () => {
  it('returns the ordered chain from root to a target in the middle', () => {
    const tree = makeChain();
    const chain = findAncestorChain(tree, 3);
    expect(chain?.map((n) => n.id)).toEqual([1, 2, 3]);
  });

  it('returns the full path to a leaf target', () => {
    const tree = makeChain();
    const chain = findAncestorChain(tree, 5);
    expect(chain?.map((n) => n.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('returns just the root when the root is the target', () => {
    const tree = makeChain();
    const chain = findAncestorChain(tree, 1);
    expect(chain?.map((n) => n.id)).toEqual([1]);
  });

  it('returns null when the target is absent', () => {
    const tree = makeChain();
    expect(findAncestorChain(tree, 999)).toBeNull();
  });

  it('descends the correct branch in a tree with multiple children', () => {
    const tree = node(1, [
      node(2, [node(4), node(5)]),
      node(3, [node(6), node(7)]),
    ]);
    expect(findAncestorChain(tree, 7)?.map((n) => n.id)).toEqual([1, 3, 7]);
    expect(findAncestorChain(tree, 4)?.map((n) => n.id)).toEqual([1, 2, 4]);
  });

  it('returns the actual node references, not copies', () => {
    const leaf = node(5);
    const tree = node(1, [node(2, [leaf])]);
    const chain = findAncestorChain(tree, 5);
    expect(chain?.[chain.length - 1]).toBe(leaf);
    expect(chain?.[0]).toBe(tree);
  });
});
