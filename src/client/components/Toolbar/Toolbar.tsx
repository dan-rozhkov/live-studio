import { h } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useStore } from '../../state/store';
import { MousePointer2, ArrowRight, Check, Bot, Code, Eye, Loader, Copy, Camera } from 'lucide-preact';
import type { DomNode } from '../../state/slices/dom-slice';
import { getElementById } from '../../bridge/dom-bridge';
import { getVueTracerInfo } from '../../bridge/component-bridge';
import { findAncestorChain } from '../../utils/dom-tree';
import { DockHandle } from '../Panel/PanelDocking';
import styles from './Toolbar.module.css';

/* ------------------------------------------------------------------ */
/*  IconButton                                                         */
/* ------------------------------------------------------------------ */

interface IconButtonProps {
  active?: boolean;
  muted?: boolean;
  mode?: 'primary';
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
  children: preact.ComponentChildren;
}

function IconButton({ active, muted, mode, disabled, onClick, title, children }: IconButtonProps) {
  const cls = [
    styles.toolbarButton,
    active ? styles.active : '',
    mode === 'primary' ? styles.primary : '',
    muted ? styles.muted : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={cls} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Toolbar position (drag)                                            */
/* ------------------------------------------------------------------ */

const POSITION_KEY = 'livestudio-toolbar-position';
const EDGE_MARGIN = 8;

interface ToolbarPosition {
  top: number;
  left: number;
}

function loadPosition(): ToolbarPosition | null {
  try {
    const raw = localStorage.getItem(POSITION_KEY);
    return raw ? (JSON.parse(raw) as ToolbarPosition) : null;
  } catch {
    return null;
  }
}

function savePosition(pos: ToolbarPosition): void {
  try {
    localStorage.setItem(POSITION_KEY, JSON.stringify(pos));
  } catch {
    /* noop */
  }
}

interface ClampBounds {
  w: number;
  h: number;
  vw: number;
  vh: number;
}

function measureBounds(el: HTMLElement | null): ClampBounds {
  const rect = el?.getBoundingClientRect();
  return {
    w: rect?.width ?? 0,
    h: rect?.height ?? 0,
    vw: document.documentElement.clientWidth,
    vh: document.documentElement.clientHeight,
  };
}

function clampPosition(pos: ToolbarPosition, b: ClampBounds): ToolbarPosition {
  return {
    left: Math.max(EDGE_MARGIN, Math.min(pos.left, b.vw - b.w - EDGE_MARGIN)),
    top: Math.max(EDGE_MARGIN, Math.min(pos.top, b.vh - b.h - EDGE_MARGIN)),
  };
}

/* ------------------------------------------------------------------ */
/*  Connection status dot                                              */
/* ------------------------------------------------------------------ */

type StatusColor = 'connected' | 'polling' | 'disconnected';

function StatusDot({ status }: { status: StatusColor }) {
  return <span className={`${styles.statusDot} ${styles[status]}`} />;
}

/* ------------------------------------------------------------------ */
/*  Toolbar                                                            */
/* ------------------------------------------------------------------ */

export interface ToolbarProps {
  isPicking: boolean;
  onTogglePicker: () => void;
  onSendEdit: () => void;
  onScreenshot: () => void;
}

export function Toolbar({ isPicking, onTogglePicker, onSendEdit, onScreenshot }: ToolbarProps) {
  const mcpStatus = useStore((s) => s.mcpStatus);
  const agentPolling = useStore((s) => s.agentPolling);
  const autoApply = useStore((s) => s.autoApply);
  const setAutoApply = useStore((s) => s.setAutoApply);
  const stagedChanges = useStore((s) => s.stagedChanges);
  const applying = useStore((s) => s.applying);
  const panic = useStore((s) => s.panic);
  const togglePanelTab = useStore((s) => s.togglePanelTab);
  const chatOpen = useStore(
    (s) => s.panels.navigator.open && s.panels.navigator.activeTab === 'chat',
  );

  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const domTree = useStore((s) => s.domTree);

  const [applied, setApplied] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shotCopied, setShotCopied] = useState(false);
  const wasApplyingRef = useRef(false);

  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<ToolbarPosition | null>(() => loadPosition());
  const dragOffset = useRef({ x: 0, y: 0 });
  const dragBounds = useRef({ w: 0, h: 0, vw: 0, vh: 0 });
  const dragging = useRef(false);

  const isConnected = mcpStatus === 'connected';
  const isAgentActive = isConnected && agentPolling;
  const hasChanges = stagedChanges.length > 0;
  const applyDisabled = autoApply || applying || applied || !hasChanges;

  // Derive connection status for the dot
  const statusColor: StatusColor = isConnected
    ? agentPolling
      ? 'connected'
      : 'polling'
    : 'disconnected';

  // Track applying -> applied transition
  useEffect(() => {
    if (applying) {
      wasApplyingRef.current = true;
      setApplied(false);
    } else if (wasApplyingRef.current) {
      wasApplyingRef.current = false;
      setApplied(true);
    }
  }, [applying]);

  useEffect(() => {
    if (hasChanges) setApplied(false);
  }, [hasChanges]);

  const handleCopyElementInfo = useCallback(() => {
    if (selectedNodeId === null || !domTree) return;
    const chain = findAncestorChain(domTree, selectedNodeId);
    if (!chain) return;
    const lines: string[] = [];
    lines.push(`Page URL: ${location.href}`);
    lines.push(`Viewport: ${window.innerWidth}x${window.innerHeight}`);

    // Try vue-tracer for exact component-scoped info
    const realEl = getElementById(selectedNodeId);
    const tracerInfo = realEl ? getVueTracerInfo(realEl) : null;
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
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [selectedNodeId, domTree]);

  // Listen for keyboard-shortcut copy to show check icon
  useEffect(() => {
    const handler = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    };
    window.addEventListener('livestudio:copied', handler);
    return () => window.removeEventListener('livestudio:copied', handler);
  }, []);

  // Screenshot feedback
  useEffect(() => {
    const onCopied = () => {
      setShotCopied(true);
      setTimeout(() => setShotCopied(false), 1500);
    };
    window.addEventListener('livestudio:screenshot-copied', onCopied);
    return () => window.removeEventListener('livestudio:screenshot-copied', onCopied);
  }, []);

  const isPositioned = position !== null;
  useEffect(() => {
    if (!isPositioned) return;
    const onResize = () => {
      setPosition((prev) => (prev ? clampPosition(prev, measureBounds(toolbarRef.current)) : prev));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isPositioned]);

  const handleDragStart = useCallback((e: PointerEvent) => {
    const el = toolbarRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragging.current = true;
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    dragBounds.current = {
      w: rect.width,
      h: rect.height,
      vw: document.documentElement.clientWidth,
      vh: document.documentElement.clientHeight,
    };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    e.preventDefault();
  }, []);

  const handleDragMove = useCallback((e: PointerEvent) => {
    if (!dragging.current) return;
    const next = clampPosition(
      { left: e.clientX - dragOffset.current.x, top: e.clientY - dragOffset.current.y },
      dragBounds.current,
    );
    setPosition(next);
  }, []);

  const handleDragEnd = useCallback((e: PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    setPosition((prev) => {
      if (!prev) return prev;
      savePosition(prev);
      return prev;
    });
  }, []);

  const positionStyle = position
    ? { top: position.top, left: position.left, bottom: 'auto', transform: 'none' }
    : undefined;

  return (
    <div
      ref={toolbarRef}
      data-ls-toolbar
      className={styles.toolbar}
      style={positionStyle}
    >
      <div
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
      >
        <DockHandle />
      </div>

      <IconButton
        active={isPicking}
        onClick={onTogglePicker}
        title="Select element (\u2325C)"
      >
        <MousePointer2 size={16} />
      </IconButton>

      <IconButton
        disabled={selectedNodeId === null}
        onClick={handleCopyElementInfo}
        title="Copy element info"
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}
      </IconButton>

      <IconButton
        onClick={onScreenshot}
        title={
          selectedNodeId !== null
            ? 'Copy selection as image (\u2318\u21E7S)'
            : 'Copy zone as image \u2014 drag to select (\u2318\u21E7S)'
        }
      >
        {shotCopied ? <Check size={16} /> : <Camera size={16} />}
      </IconButton>

      <div className={styles.separator} />

      <span className={styles.agentStatus}>
        <IconButton
          active={chatOpen}
          title={
            panic
              ? 'Agent error \u2014 click to view'
              : isConnected
                ? 'Chat with agent (\u2325T)'
                : 'Agent not connected'
          }
          onClick={() => togglePanelTab('navigator', 'chat')}
        >
          {isAgentActive ? <Bot size={16} /> : <Code size={16} />}
        </IconButton>
        <StatusDot status={statusColor} />
      </span>

      {isAgentActive && <div className={styles.separator} />}
      {isAgentActive && (
        <IconButton
          active={autoApply}
          onClick={() => setAutoApply(!autoApply)}
          title={autoApply ? 'Auto-apply on (click to disable)' : 'Auto-apply off (click to enable)'}
        >
          <Eye size={16} />
        </IconButton>
      )}

      {isAgentActive && (
        <IconButton
          mode="primary"
          disabled={applyDisabled}
          onClick={onSendEdit}
          title={
            applying
              ? 'Applying\u2026'
              : applied
                ? 'Applied'
                : 'Apply changes (\u2318\u21B5)'
          }
        >
          {applying ? (
            <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
          ) : applied ? (
            <Check size={16} />
          ) : (
            <ArrowRight size={16} />
          )}
        </IconButton>
      )}
    </div>
  );
}
