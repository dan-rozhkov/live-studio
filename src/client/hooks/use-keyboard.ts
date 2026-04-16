import { useEffect, useCallback } from 'preact/hooks';
import { useStore } from '../state/store';
import { useUndoStore, type UndoOp, type UndoDirection } from './use-undo';
import type { DomNode } from '../state/slices/dom-slice';
import { getElementById } from '../bridge/dom-bridge';
import { getTracerInfo } from '../bridge/component-bridge';
import { findAncestorChain } from '../utils/dom-tree';

// ── Constants ────────────────────────────────────────────────────────

const TREE_HIDDEN_TAGS = new Set([
  'script', 'style', 'link', 'meta', 'title',
  'head', 'noscript', 'template', 'base',
]);

// ── Helpers ──────────────────────────────────────────────────────────

/** Walk through the shadow-DOM chain to find the deepest active element. */
function isInputFocused(): boolean {
  let el: Element | null = document.activeElement;
  while (el?.shadowRoot?.activeElement) {
    el = el.shadowRoot.activeElement;
  }
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    !!(el as HTMLElement)?.isContentEditable
  );
}

/** Collect the ordered list of visible node IDs based on expanded state. */
function getVisibleNodeIds(tree: DomNode, expandedNodes: Record<number, boolean>): number[] {
  const ids: number[] = [];
  function walk(node: DomNode): void {
    if (TREE_HIDDEN_TAGS.has(node.tag)) return;
    ids.push(node.id);
    if (expandedNodes[node.id]) {
      for (const child of node.children) walk(child);
    }
  }
  const start = findTreeStart(tree);
  if (start) walk(start);
  return ids;
}

function findTreeStart(node: DomNode): DomNode | null {
  if (node.tag === 'html') return node;
  if (node.tag === 'body') return node;
  for (const child of node.children) {
    const found = findTreeStart(child);
    if (found) return found;
  }
  return node.children[0] ?? null;
}

function findNodeInTree(tree: DomNode, nodeId: number): DomNode | null {
  if (tree.id === nodeId) return tree;
  for (const child of tree.children) {
    const found = findNodeInTree(child, nodeId);
    if (found) return found;
  }
  return null;
}

function findNodePath(tree: DomNode, targetId: number): number[] | null {
  if (tree.id === targetId) return [tree.id];
  for (const child of tree.children) {
    const path = findNodePath(child, targetId);
    if (path) return [tree.id, ...path];
  }
  return null;
}

// ── Hook ─────────────────────────────────────────────────────────────

export interface UseKeyboardOptions {
  /**
   * Called when an undo/redo entry needs to be applied to the DOM.
   * The consumer is responsible for reversing/replaying the change.
   */
  applyEntry?: (entry: UndoOp, direction: UndoDirection) => void;
  /** Callback to send the current edit batch (Cmd+Enter). */
  sendEdit?: () => void;
  /** Select a single node (replaces current selection and syncs DOM highlight). */
  handleSelectNode?: (nodeId: number) => void;
  /** Delete a selected element by node ID. */
  deleteElement?: (nodeId: number) => void;
  /** Duplicate a selected element by node ID. */
  duplicateElement?: (nodeId: number) => void;
}

/**
 * Global keyboard event handler for the studio.
 *
 * Bindings:
 * - Cmd/Ctrl+Z          → undo
 * - Shift+Cmd/Ctrl+Z    → redo
 * - Escape              → cancel picker / deselect
 * - Delete / Backspace  → delete selected element(s)
 * - Cmd/Ctrl+D          → duplicate selected element(s)
 * - Cmd/Ctrl+C          → copy element info
 * - Cmd/Ctrl+Enter      → send edit
 * - Arrow Up / Down     → navigate visible DOM tree
 * - Arrow Right         → expand / enter children
 * - Arrow Left          → collapse / go to parent
 *
 * All shortcuts are suppressed while an input, textarea, or contentEditable
 * element is focused.
 */
export function useKeyboard(opts: UseKeyboardOptions = {}): void {
  const { applyEntry, sendEdit, handleSelectNode, deleteElement, duplicateElement } = opts;

  const clearSelection = useStore((s) => s.clearSelection);
  const setPickingElement = useStore((s) => s.setPickingElement);
  const setHoveredNodeId = useStore((s) => s.setHoveredNodeId);
  const undoClear = useUndoStore((s) => s.clear);

  // ── Undo / Redo (Cmd+Z / Shift+Cmd+Z) ───────────────────────────
  useEffect(() => {
    if (!applyEntry) return;
    const handler = (e: KeyboardEvent) => {
      if (isInputFocused()) return;
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) {
        const entry = useUndoStore.getState().redo();
        if (entry) applyEntry(entry, 'redo');
      } else {
        const entry = useUndoStore.getState().undo();
        if (entry) applyEntry(entry, 'undo');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [applyEntry]);

  // ── Escape → cancel picker / deselect ────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isInputFocused()) return;
      e.preventDefault();
      const store = useStore.getState();
      if (store.isPickingElement) {
        setPickingElement(false);
        setHoveredNodeId(null);
        return;
      }
      clearSelection();
      undoClear();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [clearSelection, undoClear, setPickingElement, setHoveredNodeId]);

  // ── Cmd/Ctrl+C → copy element info ────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isInputFocused()) return;
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod || e.code !== 'KeyC') return;

      const { selectedNodeId, domTree } = useStore.getState();
      if (selectedNodeId === null || !domTree) return;

      const chain = findAncestorChain(domTree, selectedNodeId);
      if (!chain) return;

      e.preventDefault();
      const lines: string[] = [];
      lines.push(`Page URL: ${location.href}`);
      lines.push(`Viewport: ${window.innerWidth}x${window.innerHeight}`);

      const realEl = getElementById(selectedNodeId);
      const tracerInfo = realEl ? getTracerInfo(realEl) : null;
      if (tracerInfo) {
        lines.push(`Component Tree: ${tracerInfo.tree}`);
        lines.push(`File: ${tracerInfo.file}`);
      } else {
        const filtered = chain.filter((n) => n.tag !== 'html' && n.tag !== 'body');
        lines.push(`Component Tree: ${filtered.map((n) => n.tag).join(' > ')}`);
        for (let i = chain.length - 1; i >= 0; i--) {
          if (chain[i].sourceFile) {
            lines.push(`File: ${chain[i].sourceFile}`);
            break;
          }
        }
      }
      navigator.clipboard.writeText(lines.join('\n'));
      window.dispatchEvent(new CustomEvent('livestudio:copied'));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Cmd+Enter → send edit ────────────────────────────────────────
  useEffect(() => {
    if (!sendEdit) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        sendEdit();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sendEdit]);

  // ── Delete / Backspace / Cmd+D ───────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isInputFocused()) return;
      const { selectedNodeId: nodeId, selectedNodeIds: ids } = useStore.getState();
      if (nodeId === null) return;

      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyD') {
        e.preventDefault();
        if (duplicateElement) {
          for (const id of ids) duplicateElement(id);
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (deleteElement) {
          const toDelete = [...ids].reverse();
          for (const id of toDelete) deleteElement(id);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [deleteElement, duplicateElement]);

  // ── Arrow keys → DOM tree navigation ─────────────────────────────
  useEffect(() => {
    if (!handleSelectNode) return;
    const handler = (e: KeyboardEvent) => {
      const { key } = e;
      if (
        key !== 'ArrowUp' &&
        key !== 'ArrowDown' &&
        key !== 'ArrowLeft' &&
        key !== 'ArrowRight'
      ) {
        return;
      }
      if (isInputFocused()) return;

      const store = useStore.getState();
      if (!store.domTree || store.selectedNodeId === null) return;
      e.preventDefault();

      if (key === 'ArrowUp' || key === 'ArrowDown') {
        const visible = getVisibleNodeIds(store.domTree, store.expandedNodes);
        const idx = visible.indexOf(store.selectedNodeId);
        if (idx === -1) return;
        const nextIdx = key === 'ArrowUp' ? idx - 1 : idx + 1;
        if (nextIdx >= 0 && nextIdx < visible.length) {
          handleSelectNode(visible[nextIdx]);
        }
      } else if (key === 'ArrowRight') {
        const node = findNodeInTree(store.domTree, store.selectedNodeId);
        if (!node) return;
        const visibleChildren = node.children.filter((c) => !TREE_HIDDEN_TAGS.has(c.tag));
        if (visibleChildren.length === 0) return;
        if (!store.expandedNodes[store.selectedNodeId]) {
          store.toggleNode(store.selectedNodeId);
        } else {
          handleSelectNode(visibleChildren[0].id);
        }
      } else if (key === 'ArrowLeft') {
        if (store.expandedNodes[store.selectedNodeId]) {
          store.toggleNode(store.selectedNodeId);
        } else {
          const path = findNodePath(store.domTree, store.selectedNodeId);
          if (path && path.length >= 2) {
            handleSelectNode(path[path.length - 2]);
          }
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSelectNode]);

  // ── Shift+Enter → select parent node ─────────────────────────────
  useEffect(() => {
    if (!handleSelectNode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) return;
      if (!(e.shiftKey && e.key === 'Enter')) return;

      const store = useStore.getState();
      if (!store.domTree || store.selectedNodeId === null) return;

      const path = findNodePath(store.domTree, store.selectedNodeId);
      if (path && path.length >= 2) {
        e.preventDefault();
        handleSelectNode(path[path.length - 2]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSelectNode]);
}
