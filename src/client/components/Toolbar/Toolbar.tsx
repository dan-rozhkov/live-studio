import { h, Fragment } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useStore } from '../../state/store';
import { MousePointer, ArrowRight, Check, Bot, Code, Sun, Moon, Loader, ChevronsLeft, ChevronsRight, Copy } from 'lucide-preact';
import type { DomNode } from '../../state/slices/dom-slice';
import { getElementById } from '../../bridge/dom-bridge';
import { getVueTracerInfo } from '../../bridge/component-bridge';
import { findAncestorChain } from '../../utils/dom-tree';
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
/*  Toolbar collapse                                                   */
/* ------------------------------------------------------------------ */

const COLLAPSED_KEY = 'livestudio-toolbar-collapsed';

function useToolbarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);
  return [collapsed, toggle];
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
}

export function Toolbar({ isPicking, onTogglePicker, onSendEdit }: ToolbarProps) {
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

  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);

  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const domTree = useStore((s) => s.domTree);

  const [collapsed, toggleCollapsed] = useToolbarCollapsed();
  const [applied, setApplied] = useState(false);
  const [copied, setCopied] = useState(false);
  const wasApplyingRef = useRef(false);

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

  // Alt+. shortcut to collapse/expand
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.code === 'Period') {
        e.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleCollapsed]);

  const toolbarCls = `${styles.toolbar} ${collapsed ? styles.toolbarCollapsed : ''}`;

  return (
    <div data-ls-toolbar className={toolbarCls}>
      {!collapsed && (
        <Fragment>
          {/* Picker toggle */}
          <IconButton
            active={isPicking}
            onClick={onTogglePicker}
            title="Select element (\u2325C)"
          >
            <MousePointer size={16} />
          </IconButton>

          {/* Copy element info */}
          <IconButton
            disabled={selectedNodeId === null}
            onClick={handleCopyElementInfo}
            title="Copy element info"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </IconButton>

          <div className={styles.separator} />

          {/* Connection status + agent chat */}
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
              <Sun size={16} />
            </IconButton>
          )}

          {/* Apply button */}
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

          <div className={styles.separator} />

          {/* Theme toggle */}
          <IconButton
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
          </IconButton>
        </Fragment>
      )}

      {/* Collapse / expand toggle */}
      <button
        className={styles.collapseToggle}
        onClick={toggleCollapsed}
        title={collapsed ? 'Expand toolbar (\u2325.)' : 'Collapse toolbar (\u2325.)'}
      >
        {collapsed ? <ChevronsLeft size={14} /> : <ChevronsRight size={14} />}
      </button>
    </div>
  );
}
