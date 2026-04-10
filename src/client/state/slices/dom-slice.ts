import type { StateCreator } from 'zustand';

export interface DomNode {
  id: number;
  tag: string;
  text?: string;
  children: DomNode[];
  attributes?: Record<string, string>;
  component?: string;
  sourceFile?: string;
}

export interface DomSlice {
  domTree: DomNode | null;
  selectedNodeId: number | null;
  selectedNodeIds: number[];
  hoveredNodeId: number | null;
  expandedNodes: Record<number, boolean>;

  setDomTree: (tree: DomNode | null) => void;
  selectNode: (nodeId: number | null) => void;
  selectNodes: (nodeIds: number[]) => void;
  toggleNodeSelection: (nodeId: number) => void;
  removeFromSelection: (nodeId: number) => void;
  setPrimaryNode: (nodeId: number) => void;
  setHoveredNodeId: (nodeId: number | null) => void;
  clearSelection: () => void;
  toggleNode: (nodeId: number) => void;
  expandToNode: (nodeId: number) => void;
}

function findNodePath(tree: DomNode, targetId: number): number[] | null {
  if (tree.id === targetId) return [tree.id];
  for (const child of tree.children) {
    const path = findNodePath(child, targetId);
    if (path) return [tree.id, ...path];
  }
  return null;
}

type ImmerSet = (fn: (state: DomSlice) => void) => void;

export const createDomSlice = (set: ImmerSet, _get: () => DomSlice): DomSlice => ({
  domTree: null,
  selectedNodeId: null,
  selectedNodeIds: [],
  hoveredNodeId: null,
  expandedNodes: {},

  setDomTree: (tree) =>
    set((state) => {
      state.domTree = tree;
    }),

  selectNode: (nodeId) =>
    set((state) => {
      state.selectedNodeIds = nodeId !== null ? [nodeId] : [];
    }),

  selectNodes: (nodeIds) =>
    set((state) => {
      state.selectedNodeIds = nodeIds;
    }),

  toggleNodeSelection: (nodeId) =>
    set((state) => {
      const idx = state.selectedNodeIds.indexOf(nodeId);
      if (idx >= 0) {
        state.selectedNodeIds.splice(idx, 1);
      } else {
        state.selectedNodeIds.push(nodeId);
      }
    }),

  removeFromSelection: (nodeId) =>
    set((state) => {
      state.selectedNodeIds = state.selectedNodeIds.filter((id) => id !== nodeId);
    }),

  setPrimaryNode: (nodeId) =>
    set((state) => {
      const idx = state.selectedNodeIds.indexOf(nodeId);
      if (idx < 0) return;
      state.selectedNodeIds.splice(idx, 1);
      state.selectedNodeIds.push(nodeId);
    }),

  setHoveredNodeId: (nodeId) =>
    set((state) => {
      state.hoveredNodeId = nodeId;
    }),

  clearSelection: () =>
    set((state) => {
      state.selectedNodeIds = [];
    }),

  toggleNode: (nodeId) =>
    set((state) => {
      if (state.expandedNodes[nodeId]) {
        delete state.expandedNodes[nodeId];
      } else {
        state.expandedNodes[nodeId] = true;
      }
    }),

  expandToNode: (nodeId) =>
    set((state) => {
      const tree = state.domTree;
      if (!tree) return;
      const path = findNodePath(tree, nodeId);
      if (path) {
        for (const id of path) {
          state.expandedNodes[id] = true;
        }
      }
    }),
});
