// ---------------------------------------------------------------------------
// DomOperations — context menu + action bar for DOM tree operations
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { Copy, Trash2, SquarePlus, ListPlus } from 'lucide-preact';
import { useStore } from '../../state/store';
import { ContextMenu, type MenuItem } from '../ContextMenu';
import {
  getElementById,
  assignId,
  fetchDomTree,
  getElementInfoById,
  scrollElementIntoView,
  snapshotElement,
  getParentId,
} from '../../bridge/dom-bridge';
import type { DomNode } from '../../state/slices/dom-slice';
import type { Change } from '../../state/slices/edit-slice';
import type { DomTreeNode } from '../../bridge/dom-bridge';
import { useUndoStore } from '../../hooks/use-undo';
import styles from './DomOperations.module.css';

// ── Helpers ──

export const PROTECTED_TAGS = new Set(['html', 'body', 'head']);

/** Find a DomNode by id inside a tree snapshot. */
function findNodeInTree(tree: DomNode | null, targetId: number): DomNode | null {
  if (!tree) return null;
  if (tree.id === targetId) return tree;
  for (const child of tree.children) {
    const found = findNodeInTree(child, targetId);
    if (found) return found;
  }
  return null;
}

/** Convert bridge DomTreeNode to store DomNode shape. */
function convertTree(node: DomTreeNode): DomNode {
  return {
    id: node.id,
    tag: node.localName,
    text: node.textContent || undefined,
    children: node.children.map(convertTree),
    attributes: Object.keys(node.attributes).length > 0 ? node.attributes : undefined,
    component: node.component,
    sourceFile: node.source,
  };
}

/** Rebuild the DOM tree snapshot and push it into the store. */
export function rebuildDomTree(): void {
  const raw = fetchDomTree();
  if (!raw) return;
  useStore.getState().setDomTree(convertTree(raw));
}

// ── Low-level DOM operations ──

/**
 * Remove element from the live DOM.
 * Returns `true` if the element was successfully removed.
 */
export function removeElementById(id: number): boolean {
  const el = getElementById(id);
  if (!el || !el.parentNode) return false;
  el.parentNode.removeChild(el);
  return true;
}

/**
 * Insert a new child element (given tag) as the last child of `parentId`.
 * Returns the new element's registry id, or `null` on failure.
 */
export function addChildElement(parentId: number, tag: string): number | null {
  const parent = getElementById(parentId);
  if (!parent) return null;
  const newEl = document.createElement(tag);
  newEl.style.width = '100px';
  newEl.style.height = '100px';
  parent.appendChild(newEl);
  return assignId(newEl);
}

/**
 * Insert a new sibling element (given tag) immediately after `siblingId`.
 * Returns the new element's registry id, or `null` on failure.
 */
export function addSiblingElement(siblingId: number, tag: string): number | null {
  const sibling = getElementById(siblingId);
  if (!sibling || !sibling.parentNode) return null;
  const newEl = document.createElement(tag);
  newEl.style.width = '100px';
  newEl.style.height = '100px';
  sibling.parentNode.insertBefore(newEl, sibling.nextSibling);
  return assignId(newEl);
}

/**
 * Deep-clone the element at `id` and insert the clone after it.
 * Returns the clone's registry id, or `null` on failure.
 */
export function duplicateElementById(id: number): number | null {
  const el = getElementById(id);
  if (!el || !el.parentNode) return null;
  const clone = el.cloneNode(true) as Element;
  el.parentNode.insertBefore(clone, el.nextSibling);
  return assignId(clone);
}

/**
 * Move element `nodeId` to become a child of `newParentId`, inserted before
 * the element with id `newSiblingId` (or appended when null).
 * Blocks cycles (dropping into own descendant).
 */
export function moveElement(
  nodeId: number,
  newParentId: number,
  newSiblingId: number | null,
): boolean {
  const el = getElementById(nodeId);
  const parent = getElementById(newParentId);
  if (!el || !parent) return false;
  if (el === parent || el.contains(parent)) return false;
  const ref = newSiblingId != null ? (getElementById(newSiblingId) ?? null) : null;
  parent.insertBefore(el, ref);
  return true;
}

/**
 * Replace an element's tag while preserving attributes, inline styles,
 * and children. Returns the new element's registry id, or `null`.
 */
export function replaceElementTag(id: number, newTag: string): number | null {
  const el = getElementById(id);
  if (!el || !el.parentNode) return null;
  const newEl = document.createElement(newTag);
  for (let i = 0; i < el.attributes.length; i++) {
    newEl.setAttribute(el.attributes[i].name, el.attributes[i].value);
  }
  if (el instanceof HTMLElement && newEl instanceof HTMLElement) {
    newEl.style.cssText = el.style.cssText;
  }
  while (el.firstChild) newEl.appendChild(el.firstChild);
  el.parentNode.replaceChild(newEl, el);
  return assignId(newEl);
}

// ── Context menu state ──

export interface ContextMenuState {
  nodeId: number;
  x: number;
  y: number;
}

// ── useDomOperations hook ──

/**
 * Hook that provides all DOM manipulation callbacks and context menu state.
 * Consumed by the DomTree host component.
 */
export function useDomOperations() {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const domTree = useStore((s) => s.domTree);
  const selectNode = useStore((s) => s.selectNode);
  const expandToNode = useStore((s) => s.expandToNode);
  const removeFromSelection = useStore((s) => s.removeFromSelection);
  const clearSelection = useStore((s) => s.clearSelection);
  const queueEdit = useStore((s) => s.queueEdit);

  // -- open context menu on tree node --

  const handleTreeContextMenu = useCallback(
    (nodeId: number, x: number, y: number) => {
      const state = useStore.getState();
      const node = findNodeInTree(state.domTree, nodeId);
      if (!node || PROTECTED_TAGS.has(node.tag)) return;
      setContextMenu({ nodeId, x, y });
    },
    [],
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // -- tag change --

  const handleTagChange = useCallback(
    (nodeId: number, newTag: string) => {
      const node = findNodeInTree(useStore.getState().domTree, nodeId);
      if (!node) return;
      const oldTag = node.tag;
      const info = getElementInfoById(useStore.getState().domTree as any, nodeId);
      const newId = replaceElementTag(nodeId, newTag);
      if (newId === null) return;
      useUndoStore.getState().pushDom({ type: 'dom', action: 'tag-change', nodeId: newId, oldTag, newTag });
      rebuildDomTree();
      selectNode(newId);
      expandToNode(newId);
      scrollElementIntoView(newId);
      queueEdit({ type: 'dom', ...info, value: `tag: ${oldTag} \u2192 ${newTag}` } as Change);
    },
    [selectNode, expandToNode, queueEdit],
  );

  // -- delete --

  const deleteElement = useCallback(
    (nodeId: number) => {
      const node = findNodeInTree(useStore.getState().domTree, nodeId);
      if (!node || PROTECTED_TAGS.has(node.tag)) return;
      const info = getElementInfoById(useStore.getState().domTree as any, nodeId);
      const snap = snapshotElement(nodeId);
      const removed = removeElementById(nodeId);
      if (!removed) return;
      useUndoStore.getState().pushDom({ type: 'dom', action: 'delete', nodeId, ...snap });
      const state = useStore.getState();
      if (state.selectedNodeIds.length > 1) {
        removeFromSelection(nodeId);
      } else if (state.selectedNodeId === nodeId) {
        clearSelection();
      }
      rebuildDomTree();
      queueEdit({ type: 'dom', ...info, value: 'delete' } as Change);
    },
    [removeFromSelection, clearSelection, queueEdit],
  );

  const handleDeleteElement = useCallback(() => {
    if (!contextMenu) return;
    const ids = useStore.getState().selectedNodeIds;
    if (ids.length > 1) {
      const toDelete = [...ids].reverse();
      for (const id of toDelete) deleteElement(id);
    } else {
      deleteElement(contextMenu.nodeId);
    }
    setContextMenu(null);
  }, [contextMenu, deleteElement]);

  // -- add child --

  const handleAddChild = useCallback(() => {
    if (!contextMenu) return;
    const { nodeId } = contextMenu;
    const info = getElementInfoById(useStore.getState().domTree as any, nodeId);
    const newId = addChildElement(nodeId, 'div');
    if (newId === null) return;
    useUndoStore.getState().pushDom({ type: 'dom', action: 'add', nodeId: newId, parentId: nodeId });
    rebuildDomTree();
    expandToNode(nodeId);
    selectNode(newId);
    expandToNode(newId);
    scrollElementIntoView(newId);
    queueEdit({ type: 'dom', ...info, value: 'add-child div' } as Change);
    setContextMenu(null);
  }, [contextMenu, expandToNode, selectNode, queueEdit]);

  // -- add sibling --

  const handleAddSibling = useCallback(() => {
    if (!contextMenu) return;
    const { nodeId } = contextMenu;
    const info = getElementInfoById(useStore.getState().domTree as any, nodeId);
    const newId = addSiblingElement(nodeId, 'div');
    if (newId === null) return;
    useUndoStore.getState().pushDom({ type: 'dom', action: 'add', nodeId: newId, parentId: getParentId(nodeId), siblingId: nodeId });
    rebuildDomTree();
    selectNode(newId);
    expandToNode(newId);
    scrollElementIntoView(newId);
    queueEdit({ type: 'dom', ...info, value: 'add-sibling div' } as Change);
    setContextMenu(null);
  }, [contextMenu, selectNode, expandToNode, queueEdit]);

  // -- duplicate --

  const duplicateElement = useCallback(
    (nodeId: number) => {
      const node = findNodeInTree(useStore.getState().domTree, nodeId);
      if (!node || PROTECTED_TAGS.has(node.tag)) return;
      const info = getElementInfoById(useStore.getState().domTree as any, nodeId);
      const newId = duplicateElementById(nodeId);
      if (newId === null) return;
      useUndoStore.getState().pushDom({ type: 'dom', action: 'duplicate', nodeId, newNodeId: newId });
      rebuildDomTree();
      selectNode(newId);
      expandToNode(newId);
      scrollElementIntoView(newId);
      queueEdit({ type: 'dom', ...info, value: 'duplicate' } as Change);
    },
    [selectNode, expandToNode, queueEdit],
  );

  const handleDuplicateElement = useCallback(() => {
    if (!contextMenu) return;
    const ids = useStore.getState().selectedNodeIds;
    if (ids.length > 1) {
      for (const id of ids) duplicateElement(id);
    } else {
      duplicateElement(contextMenu.nodeId);
    }
    setContextMenu(null);
  }, [contextMenu, duplicateElement]);

  // -- move (drag-to-reorder) --

  const handleMoveElement = useCallback(
    (nodeId: number, newParentId: number, newSiblingId: number | null) => {
      const node = findNodeInTree(useStore.getState().domTree, nodeId);
      if (!node || PROTECTED_TAGS.has(node.tag)) return;
      const el = getElementById(nodeId);
      if (!el || !el.parentElement) return;
      const oldParent = el.parentElement;
      const oldNextSibling = el.nextElementSibling;
      const oldParentId = assignId(oldParent);
      const oldSiblingId = oldNextSibling ? assignId(oldNextSibling) : null;
      if (oldParentId === newParentId && oldSiblingId === newSiblingId) return;
      const info = getElementInfoById(useStore.getState().domTree as any, nodeId);
      const moved = moveElement(nodeId, newParentId, newSiblingId);
      if (!moved) return;
      useUndoStore.getState().pushDom({
        type: 'dom',
        action: 'move',
        nodeId,
        oldParentId,
        oldSiblingId,
        newParentId,
        newSiblingId,
      });
      rebuildDomTree();
      selectNode(nodeId);
      expandToNode(nodeId);
      scrollElementIntoView(nodeId);
      queueEdit({ type: 'dom', ...info, value: 'move' } as Change);
    },
    [selectNode, expandToNode, queueEdit],
  );

  // -- keyboard shortcuts (Cmd+D = duplicate, Delete = delete) --

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const state = useStore.getState();
      const ids = state.selectedNodeIds;
      const nodeId = state.selectedNodeId;
      if (nodeId === null) return;

      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyD') {
        e.preventDefault();
        for (const id of ids) duplicateElement(id);
      } else if (e.key === 'Delete' || (e.key === 'Backspace' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        const toDelete = [...ids].reverse();
        for (const id of toDelete) deleteElement(id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [duplicateElement, deleteElement]);

  return {
    contextMenu,
    closeContextMenu,
    handleTreeContextMenu,
    handleTagChange,
    deleteElement,
    handleDeleteElement,
    handleAddChild,
    handleAddSibling,
    duplicateElement,
    handleDuplicateElement,
    handleMoveElement,
  };
}

// ── DomContextMenu — renders contextMenu state into a portal-like overlay ──

interface DomContextMenuProps {
  contextMenu: ContextMenuState | null;
  onClose: () => void;
  onAddChild: () => void;
  onAddSibling: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export function DomContextMenu({
  contextMenu,
  onClose,
  onAddChild,
  onAddSibling,
  onDuplicate,
  onDelete,
}: DomContextMenuProps) {
  if (!contextMenu) return null;

  const selectedNodeIds = useStore((s) => s.selectedNodeIds);
  const isMulti = selectedNodeIds.length > 1;

  const items: MenuItem[] = isMulti
    ? [
        { label: `Duplicate ${selectedNodeIds.length} elements`, onSelect: onDuplicate, shortcut: '\u2318D' },
        { type: 'separator' },
        { label: `Delete ${selectedNodeIds.length} elements`, onSelect: onDelete, danger: true, shortcut: '\u2326' },
      ]
    : [
        { label: 'Add child element', onSelect: onAddChild },
        { label: 'Add sibling element', onSelect: onAddSibling },
        { label: 'Duplicate element', onSelect: onDuplicate, shortcut: '\u2318D' },
        { type: 'separator' },
        { label: 'Delete element', onSelect: onDelete, danger: true, shortcut: '\u2326' },
      ];

  return (
    <ContextMenu
      x={contextMenu.x}
      y={contextMenu.y}
      items={items}
      onClose={onClose}
    />
  );
}

// ── ActionBar — icon buttons shown above the tree when element selected ──



export function ActionBar() {
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const domTree = useStore((s) => s.domTree);
  const selectNode = useStore((s) => s.selectNode);
  const expandToNode = useStore((s) => s.expandToNode);
  const removeFromSelection = useStore((s) => s.removeFromSelection);
  const clearSelection = useStore((s) => s.clearSelection);
  const queueEdit = useStore((s) => s.queueEdit);

  const isProtected = (() => {
    if (selectedNodeId === null) return true;
    const node = findNodeInTree(domTree, selectedNodeId);
    return !node || PROTECTED_TAGS.has(node.tag);
  })();

  const handleAddChild = useCallback(() => {
    if (selectedNodeId === null) return;
    const info = getElementInfoById(useStore.getState().domTree as any, selectedNodeId);
    const newId = addChildElement(selectedNodeId, 'div');
    if (newId === null) return;
    useUndoStore.getState().pushDom({ type: 'dom', action: 'add', nodeId: newId, parentId: selectedNodeId });
    rebuildDomTree();
    expandToNode(selectedNodeId);
    selectNode(newId);
    expandToNode(newId);
    scrollElementIntoView(newId);
    queueEdit({ type: 'dom', ...info, value: 'add-child div' } as Change);
  }, [selectedNodeId, expandToNode, selectNode, queueEdit]);

  const handleAddSibling = useCallback(() => {
    if (selectedNodeId === null) return;
    const info = getElementInfoById(useStore.getState().domTree as any, selectedNodeId);
    const newId = addSiblingElement(selectedNodeId, 'div');
    if (newId === null) return;
    useUndoStore.getState().pushDom({ type: 'dom', action: 'add', nodeId: newId, parentId: getParentId(selectedNodeId), siblingId: selectedNodeId });
    rebuildDomTree();
    selectNode(newId);
    expandToNode(newId);
    scrollElementIntoView(newId);
    queueEdit({ type: 'dom', ...info, value: 'add-sibling div' } as Change);
  }, [selectedNodeId, selectNode, expandToNode, queueEdit]);

  const handleDuplicate = useCallback(() => {
    if (selectedNodeId === null) return;
    const node = findNodeInTree(useStore.getState().domTree, selectedNodeId);
    if (!node || PROTECTED_TAGS.has(node.tag)) return;
    const info = getElementInfoById(useStore.getState().domTree as any, selectedNodeId);
    const newId = duplicateElementById(selectedNodeId);
    if (newId === null) return;
    useUndoStore.getState().pushDom({ type: 'dom', action: 'duplicate', nodeId: selectedNodeId, newNodeId: newId });
    rebuildDomTree();
    selectNode(newId);
    expandToNode(newId);
    scrollElementIntoView(newId);
    queueEdit({ type: 'dom', ...info, value: 'duplicate' } as Change);
  }, [selectedNodeId, selectNode, expandToNode, queueEdit]);

  const handleDelete = useCallback(() => {
    if (selectedNodeId === null) return;
    const node = findNodeInTree(useStore.getState().domTree, selectedNodeId);
    if (!node || PROTECTED_TAGS.has(node.tag)) return;
    const info = getElementInfoById(useStore.getState().domTree as any, selectedNodeId);
    const snap = snapshotElement(selectedNodeId);
    const removed = removeElementById(selectedNodeId);
    if (!removed) return;
    useUndoStore.getState().pushDom({ type: 'dom', action: 'delete', nodeId: selectedNodeId, ...snap });
    const state = useStore.getState();
    if (state.selectedNodeIds.length > 1) {
      removeFromSelection(selectedNodeId);
    } else {
      clearSelection();
    }
    rebuildDomTree();
    queueEdit({ type: 'dom', ...info, value: 'delete' } as Change);
  }, [selectedNodeId, removeFromSelection, clearSelection, queueEdit]);

  const noSelection = selectedNodeId === null;
  const disabled = noSelection || isProtected;

  return (
    <div className={styles.actionBar}>
      <button
        className={styles.actionBtn}
        title="Add child element"
        onClick={handleAddChild}
        disabled={disabled}
      >
        <SquarePlus size={14} />
      </button>
      <button
        className={styles.actionBtn}
        title="Add sibling element"
        onClick={handleAddSibling}
        disabled={disabled}
      >
        <ListPlus size={14} />
      </button>
      <button
        className={styles.actionBtn}
        title="Duplicate element (\u2318D)"
        onClick={handleDuplicate}
        disabled={disabled}
      >
        <Copy size={14} />
      </button>
      <button
        className={`${styles.actionBtn} ${styles.dangerBtn}`}
        title="Delete element (\u2326)"
        onClick={handleDelete}
        disabled={disabled}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
