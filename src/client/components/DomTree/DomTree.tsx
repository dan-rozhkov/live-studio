// ---------------------------------------------------------------------------
// DomTree — recursive DOM tree panel
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-preact';
import { useStore } from '../../state/store';
import type { DomNode } from '../../state/slices/dom-slice';
import { assignId, getElementById } from '../../bridge/dom-bridge';
import styles from './DomTree.module.css';

type DropZone = 'before' | 'after' | 'inside';

interface DragState {
  nodeId: number;
  targetId: number | null;
  zone: DropZone | null;
}

interface PendingDrag {
  nodeId: number;
  startX: number;
  startY: number;
}

// ── Hidden tags (never shown in the tree) ──

const TREE_HIDDEN_TAGS = new Set([
  'script', 'style', 'link', 'meta', 'title', 'head', 'noscript', 'template', 'base',
]);

const PROTECTED_TAGS = new Set(['html', 'body', 'head']);

// ── Helpers ──

/** Locate the body (or closest meaningful root) inside the tree snapshot. */
function findRootNodes(node: DomNode): DomNode[] {
  if (node.tag === 'body') return node.children;
  if (node.tag === 'html') {
    const body = node.children.find((c) => c.tag === 'body');
    return body ? body.children : node.children;
  }
  for (const child of node.children) {
    const found = findRootNodes(child);
    if (found.length > 0) return found;
  }
  return node.children.length > 0 ? node.children : [node];
}

/** Truncate a class list for display. */
function formatClasses(raw: string | undefined): string {
  if (!raw) return '';
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const joined = parts.join('.');
  return joined.length > 30 ? joined.slice(0, 27) + '...' : joined;
}

/** Truncate text content for inline preview. */
function formatText(text: string | undefined): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (!trimmed) return '';
  return trimmed.length > 24 ? trimmed.slice(0, 21) + '...' : trimmed;
}


// ── TreeNode (recursive) ──

interface TreeNodeProps {
  node: DomNode;
  depth: number;
  onSelect: (id: number) => void;
  onToggleSelect?: (id: number) => void;
  onHover: (id: number | null) => void;
  onTagChange?: (id: number, newTag: string) => void;
  onContextMenu?: (nodeId: number, x: number, y: number) => void;
  onDragStart?: (nodeId: number, e: PointerEvent) => void;
  drag: DragState | null;
}

function TreeNode({ node, depth, onSelect, onToggleSelect, onHover, onTagChange, onContextMenu: onCtxMenu, onDragStart, drag }: TreeNodeProps) {
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const selectedNodeIds = useStore((s) => s.selectedNodeIds);
  const hoveredNodeId = useStore((s) => s.hoveredNodeId);
  const expandedNodes = useStore((s) => s.expandedNodes);
  const toggleNode = useStore((s) => s.toggleNode);

  if (TREE_HIDDEN_TAGS.has(node.tag)) return null;

  const isSelected = selectedNodeIds.includes(node.id);
  const isPrimary = selectedNodeId === node.id;
  const isHovered = hoveredNodeId === node.id && !isSelected;
  const isExpanded = !!expandedNodes[node.id];

  const visibleChildren = useMemo(
    () => node.children.filter((c) => !TREE_HIDDEN_TAGS.has(c.tag)),
    [node.children],
  );
  const hasChildren = visibleChildren.length > 0;

  const formattedClassName = useMemo(() => formatClasses(node.attributes?.class), [node.attributes]);

  const textPreview = useMemo(() => {
    if (hasChildren) return '';
    return formatText(node.text);
  }, [hasChildren, node.text]);

  // ── Tag editing ──

  const [editingTag, setEditingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const tagInputRef = useRef<HTMLInputElement>(null);

  const handleTagDoubleClick = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      if (PROTECTED_TAGS.has(node.tag)) return;
      setTagDraft(node.tag);
      setEditingTag(true);
    },
    [node.tag],
  );

  const commitTag = useCallback(() => {
    setEditingTag(false);
    const trimmed = tagDraft.trim().toLowerCase();
    if (trimmed && trimmed !== node.tag) {
      onTagChange?.(node.id, trimmed);
    }
  }, [tagDraft, node.tag, node.id, onTagChange]);

  const handleTagKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitTag();
      } else if (e.key === 'Escape') {
        setEditingTag(false);
      }
    },
    [commitTag],
  );

  useEffect(() => {
    if (editingTag && tagInputRef.current) {
      tagInputRef.current.focus();
      tagInputRef.current.select();
    }
  }, [editingTag]);

  // ── Interaction handlers ──

  const handleClick = useCallback(
    (e: MouseEvent) => {
      if ((e.shiftKey || e.metaKey || e.ctrlKey) && onToggleSelect) {
        onToggleSelect(node.id);
      } else {
        onSelect(node.id);
      }
    },
    [node.id, onSelect, onToggleSelect],
  );

  const handleChevronClick = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      toggleNode(node.id);
    },
    [node.id, toggleNode],
  );

  const handleMouseEnter = useCallback(() => onHover(node.id), [node.id, onHover]);
  const handleMouseLeave = useCallback(() => onHover(null), [onHover]);

  const handleContextMenu = useCallback(
    (e: MouseEvent) => {
      if (!onCtxMenu) return;
      e.preventDefault();
      e.stopPropagation();
      onCtxMenu(node.id, e.clientX, e.clientY);
    },
    [node.id, onCtxMenu],
  );

  // ── Auto-scroll selected node into view ──

  const nodeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isPrimary && nodeRef.current) {
      nodeRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [isPrimary]);

  // ── Render ──

  const indent = depth * 16 + 6;

  const isDragging = drag?.nodeId === node.id;
  const isDropTarget = drag?.targetId === node.id && drag.zone;

  const nodeClass = [
    styles.node,
    isSelected ? (isPrimary ? styles.selected : styles.selectedSecondary) : '',
    isHovered ? styles.hovered : '',
    isDragging ? styles.dragging : '',
    isDropTarget && drag?.zone === 'before' ? styles.dropBefore : '',
    isDropTarget && drag?.zone === 'after' ? styles.dropAfter : '',
    isDropTarget && drag?.zone === 'inside' ? styles.dropInside : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      if (!onDragStart) return;
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      // Ignore drags from the chevron or the tag-edit input
      if (target.closest(`.${styles.chevron}`)) return;
      if (target.closest(`.${styles.tagInput}`)) return;
      onDragStart(node.id, e);
    },
    [node.id, onDragStart],
  );

  return (
    <>
      <div
        ref={nodeRef}
        className={nodeClass}
        style={{ paddingLeft: indent }}
        data-node-id={node.id}
        data-depth={depth}
        data-tag={node.tag}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onPointerDown={handlePointerDown}
      >
        {/* Expand/collapse chevron */}
        <span
          className={`${styles.chevron} ${hasChildren ? (isExpanded ? styles.expanded : '') : styles.hidden}`}
          onClick={hasChildren ? handleChevronClick : undefined}
        >
          <ChevronRight size={8} />
        </span>

        {/* Tag name (double-click to edit) */}
        {editingTag ? (
          <input
            ref={tagInputRef}
            className={styles.tagInput}
            value={tagDraft}
            onInput={(e) => setTagDraft((e.target as HTMLInputElement).value)}
            onKeyDown={handleTagKeyDown}
            onBlur={commitTag}
          />
        ) : (
          <span className={styles.tag} onDblClick={handleTagDoubleClick}>
            {node.tag}
          </span>
        )}

        {/* Class names (truncated) */}
        {formattedClassName && (
          <span className={styles.className}>.{formattedClassName}</span>
        )}

        {/* Component name if detected */}
        {node.component && (
          <span className={styles.component}>&lt;{node.component}&gt;</span>
        )}

        {/* Inline text preview for leaf nodes */}
        {textPreview && (
          <span className={styles.textPreview}>{textPreview}</span>
        )}
      </div>

      {/* Recurse into children when expanded */}
      {isExpanded &&
        node.children.map((child) => (
          <TreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            onSelect={onSelect}
            onToggleSelect={onToggleSelect}
            onHover={onHover}
            onTagChange={onTagChange}
            onContextMenu={onCtxMenu}
            onDragStart={onDragStart}
            drag={drag}
          />
        ))}
    </>
  );
}

// ── DomTree (root component) ──

const DRAG_THRESHOLD = 4;
const AUTOSCROLL_ZONE = 24;
const AUTOSCROLL_STEP = 8;

export interface DomTreeProps {
  onSelectNode: (id: number) => void;
  onToggleSelectNode?: (id: number) => void;
  onHover: (id: number | null) => void;
  onTagChange?: (id: number, newTag: string) => void;
  onContextMenu?: (nodeId: number, x: number, y: number) => void;
  onMoveNode?: (nodeId: number, newParentId: number, newSiblingId: number | null) => void;
}

export function DomTree({ onSelectNode, onToggleSelectNode, onHover, onTagChange, onContextMenu, onMoveNode }: DomTreeProps) {
  const domTree = useStore((s) => s.domTree);
  const treeRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const pendingRef = useRef<PendingDrag | null>(null);

  const handleDragStart = useCallback(
    (nodeId: number, e: PointerEvent) => {
      if (!onMoveNode) return;
      const walk = (node: DomNode | null): DomNode | null => {
        if (!node) return null;
        if (node.id === nodeId) return node;
        for (const c of node.children) {
          const f = walk(c);
          if (f) return f;
        }
        return null;
      };
      const found = walk(useStore.getState().domTree);
      if (!found || PROTECTED_TAGS.has(found.tag)) return;
      pendingRef.current = { nodeId, startX: e.clientX, startY: e.clientY };
    },
    [onMoveNode],
  );

  useEffect(() => {
    if (!onMoveNode) return;

    let rafId = 0;
    let lastClientY = 0;

    const autoScroll = () => {
      rafId = 0;
      const tree = treeRef.current;
      if (!tree || !dragRef.current) return;
      const rect = tree.getBoundingClientRect();
      const topDelta = lastClientY - rect.top;
      const bottomDelta = rect.bottom - lastClientY;
      let delta = 0;
      if (topDelta >= 0 && topDelta < AUTOSCROLL_ZONE) delta = -AUTOSCROLL_STEP;
      else if (bottomDelta >= 0 && bottomDelta < AUTOSCROLL_ZONE) delta = AUTOSCROLL_STEP;
      if (delta !== 0) {
        tree.scrollTop += delta;
        rafId = requestAnimationFrame(autoScroll);
      }
    };

    const resolveTarget = (nodeId: number, x: number, y: number): { targetId: number | null; zone: DropZone | null } => {
      const tree = treeRef.current;
      if (!tree) return { targetId: null, zone: null };
      const rows = tree.querySelectorAll<HTMLElement>('[data-node-id]');
      let row: HTMLElement | null = null;
      for (const r of rows) {
        const rect = r.getBoundingClientRect();
        if (y >= rect.top && y <= rect.bottom && x >= rect.left && x <= rect.right) {
          row = r;
          break;
        }
      }
      if (!row) return { targetId: null, zone: null };
      const targetId = Number(row.dataset.nodeId);
      if (!Number.isFinite(targetId)) return { targetId: null, zone: null };
      const draggedEl = getElementById(nodeId);
      const targetEl = getElementById(targetId);
      if (!draggedEl || !targetEl) return { targetId: null, zone: null };
      if (draggedEl === targetEl || draggedEl.contains(targetEl)) {
        return { targetId, zone: null };
      }
      const rect = row.getBoundingClientRect();
      const rel = (y - rect.top) / rect.height;
      let zone: DropZone;
      if (rel < 0.25) zone = 'before';
      else if (rel > 0.75) zone = 'after';
      else zone = 'inside';
      if ((zone === 'before' || zone === 'after') && !targetEl.parentElement) {
        return { targetId, zone: null };
      }
      return { targetId, zone };
    };

    const onMove = (e: PointerEvent) => {
      lastClientY = e.clientY;
      const pending = pendingRef.current;
      const active = dragRef.current;
      if (pending && !active) {
        const dx = e.clientX - pending.startX;
        const dy = e.clientY - pending.startY;
        if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
        const { targetId, zone } = resolveTarget(pending.nodeId, e.clientX, e.clientY);
        setDrag({ nodeId: pending.nodeId, targetId, zone });
        return;
      }
      if (!active) return;
      const { targetId, zone } = resolveTarget(active.nodeId, e.clientX, e.clientY);
      if (targetId !== active.targetId || zone !== active.zone) {
        setDrag({ ...active, targetId, zone });
      }
      if (!rafId) rafId = requestAnimationFrame(autoScroll);
    };

    const commit = () => {
      const d = dragRef.current;
      if (!d || !d.targetId || !d.zone) return;
      const targetEl = getElementById(d.targetId);
      if (!targetEl) return;
      if (d.zone === 'inside') {
        onMoveNode(d.nodeId, d.targetId, null);
      } else {
        const parent = targetEl.parentElement;
        if (!parent) return;
        const parentId = assignId(parent);
        if (d.zone === 'before') {
          onMoveNode(d.nodeId, parentId, d.targetId);
        } else {
          const next = targetEl.nextElementSibling;
          onMoveNode(d.nodeId, parentId, next ? assignId(next) : null);
        }
      }
    };

    const onUp = () => {
      if (dragRef.current) commit();
      pendingRef.current = null;
      if (dragRef.current) setDrag(null);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        pendingRef.current = null;
        setDrag(null);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [onMoveNode]);

  if (!domTree) {
    return <div className={styles.empty}>Loading DOM...</div>;
  }

  const rootNodes = findRootNodes(domTree);
  if (rootNodes.length === 0) {
    return <div className={styles.empty}>No elements found</div>;
  }

  return (
    <div className={`${styles.tree} ${drag ? styles.dragging : ''}`} ref={treeRef}>
      {rootNodes.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          depth={0}
          onSelect={onSelectNode}
          onToggleSelect={onToggleSelectNode}
          onHover={onHover}
          onTagChange={onTagChange}
          onContextMenu={onContextMenu}
          onDragStart={handleDragStart}
          drag={drag}
        />
      ))}
    </div>
  );
}

