import type { DomNode } from '../state/slices/dom-slice';

export function findAncestorChain(tree: DomNode, targetId: number): DomNode[] | null {
  if (tree.id === targetId) return [tree];
  for (const child of tree.children) {
    const chain = findAncestorChain(child, targetId);
    if (chain) return [tree, ...chain];
  }
  return null;
}
