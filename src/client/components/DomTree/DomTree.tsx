// ---------------------------------------------------------------------------
// DomTree — recursive DOM tree panel
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-preact';
import { useStore } from '../../state/store';
import type { DomNode } from '../../state/slices/dom-slice';
import styles from './DomTree.module.css';

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
}

function TreeNode({ node, depth, onSelect, onToggleSelect, onHover, onTagChange, onContextMenu: onCtxMenu }: TreeNodeProps) {
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

  const nodeClass = [
    styles.node,
    isSelected ? (isPrimary ? styles.selected : styles.selectedSecondary) : '',
    isHovered ? styles.hovered : '',
  ]
    .filter(Boolean)
    .join(' ');

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
          />
        ))}
    </>
  );
}

// ── DomTree (root component) ──

export interface DomTreeProps {
  onSelectNode: (id: number) => void;
  onToggleSelectNode?: (id: number) => void;
  onHover: (id: number | null) => void;
  onTagChange?: (id: number, newTag: string) => void;
  onContextMenu?: (nodeId: number, x: number, y: number) => void;
}

export function DomTree({ onSelectNode, onToggleSelectNode, onHover, onTagChange, onContextMenu }: DomTreeProps) {
  const domTree = useStore((s) => s.domTree);
  const treeRef = useRef<HTMLDivElement>(null);

  if (!domTree) {
    return <div className={styles.empty}>Loading DOM...</div>;
  }

  const rootNodes = findRootNodes(domTree);
  if (rootNodes.length === 0) {
    return <div className={styles.empty}>No elements found</div>;
  }

  return (
    <div className={styles.tree} ref={treeRef}>
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
        />
      ))}
    </div>
  );
}
