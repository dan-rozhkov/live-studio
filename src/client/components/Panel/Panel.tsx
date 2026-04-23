import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentChildren } from 'preact';
import { X } from 'lucide-preact';
import { useStore } from '../../state/store';
import type { PanelId, DockPosition } from '../../state/slices/panels-slice';
import { DockIndicators, DockHandle, detectDockZone } from './PanelDocking';
import type { DockZoneHit } from './PanelDocking';
import styles from './Panel.module.css';

// ── Types ──

export interface TabDef {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
}

export interface PanelProps {
  panelId: PanelId;
  tabs: TabDef[];
  onClose: () => void;
  headerSlot?: ComponentChildren;
  label?: string;
  children: ComponentChildren;
  className?: string;
}

// ── Constants ──

const STORAGE_PREFIX = 'live-studio-panel-';
const SNAP_THRESHOLD = 40;
const EDGE_MARGIN = 16;
const TOOLBAR_FALLBACK = 56;
const TOOLBAR_GAP = 4;
const MIN_PANEL_HEIGHT = 200;

// ── Helpers ──

function getToolbarBottom(): number {
  const el = document.querySelector('[data-ls-toolbar]');
  if (!el) return TOOLBAR_FALLBACK;
  return el.getBoundingClientRect().bottom + TOOLBAR_GAP;
}

interface PanelPrefs {
  dock: DockPosition;
  size: number;
  position?: PanelPosition;
}

interface PanelPosition {
  top: number;
  right: number;
  anchor: 'left' | 'right';
  height?: number;
}

function getStorageKey(panelId: string): string {
  return STORAGE_PREFIX + panelId + '-' + location.hostname;
}

function loadPrefs(panelId: string): PanelPrefs | null {
  try {
    const raw = localStorage.getItem(getStorageKey(panelId));
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function savePrefs(panelId: string, prefs: PanelPrefs): void {
  try {
    localStorage.setItem(getStorageKey(panelId), JSON.stringify(prefs));
  } catch { /* ignore */ }
}

function getDefaultPosition(_panelId: string, dock: DockPosition): PanelPosition {
  const top = getToolbarBottom();
  if (dock === 'left') {
    return { top, right: document.documentElement.clientWidth - 300 - EDGE_MARGIN, anchor: 'left' };
  }
  return { top, right: EDGE_MARGIN, anchor: 'right' };
}

function snapToEdges(pos: PanelPosition, panelWidth: number): PanelPosition {
  let { top, right } = pos;
  const vw = document.documentElement.clientWidth;
  const left = vw - right - panelWidth;

  if (left < right) {
    right = left < SNAP_THRESHOLD ? vw - panelWidth - EDGE_MARGIN : right;
  } else {
    right = right < SNAP_THRESHOLD ? EDGE_MARGIN : right;
  }

  if (top < SNAP_THRESHOLD) top = EDGE_MARGIN;

  const finalLeft = vw - right - panelWidth;
  const anchor = finalLeft <= right ? 'left' : 'right';
  return { top, right, anchor, height: pos.height };
}


// ── usePanelPosition hook ──

function usePanelPosition(panelId: PanelId) {
  const panel = useStore((s) => s.panels[panelId]);
  const claims = useStore((s) => s.dockedClaims);
  const setPanelDock = useStore((s) => s.setPanelDock);
  const setPanelSize = useStore((s) => s.setPanelSize);
  const [position, setPosition] = useState<PanelPosition>(() =>
    getDefaultPosition(panelId, panel.dock),
  );
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [activeZone, setActiveZone] = useState<DockZoneHit>(null);
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Load saved prefs on mount
  useEffect(() => {
    const prefs = loadPrefs(panelId);
    if (prefs) {
      setPanelDock(panelId, prefs.dock);
      setPanelSize(panelId, prefs.size);
      if (prefs.position) setPosition(prefs.position);
    }
  }, [panelId, setPanelDock, setPanelSize]);

  // Clamp to toolbar
  useEffect(() => {
    const toolbarBottom = getToolbarBottom();
    setPosition((prev) =>
      prev.top < toolbarBottom ? { ...prev, top: toolbarBottom } : prev,
    );
  }, []);

  // Viewport tracking
  const [viewport, setViewport] = useState(() => ({
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  }));

  useEffect(() => {
    let rafId = 0;
    const handleResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setViewport({
          width: document.documentElement.clientWidth,
          height: document.documentElement.clientHeight,
        });
      });
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(rafId);
    };
  }, []);

  // Debounced save
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPrefsRef = useRef('');

  useEffect(() => {
    const key = `${panel.dock}:${panel.size}:${position.top}:${position.right}:${position.height ?? ''}`;
    if (!prevPrefsRef.current || prevPrefsRef.current === key) {
      prevPrefsRef.current = key;
      return;
    }
    prevPrefsRef.current = key;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      savePrefs(panelId, {
        dock: panel.dock,
        size: panel.size,
        position,
      });
    }, 300);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [panelId, panel.dock, panel.size, position]);

  // Computed style
  const style = useMemo(() => {
    const { dock, size } = panel;

    if (dock === 'bottom') {
      const gap = 8;
      return {
        position: 'fixed' as const,
        bottom: EDGE_MARGIN,
        left: EDGE_MARGIN,
        right: claims.right > 0 ? EDGE_MARGIN + claims.right + gap : EDGE_MARGIN,
        height: size,
      };
    }

    if (position.height) {
      const left = viewport.width - position.right - size;
      return {
        position: 'fixed' as const,
        top: position.top,
        ...(position.anchor === 'left'
          ? { left: Math.max(EDGE_MARGIN, left) }
          : { right: position.right }),
        height: position.height,
        width: size,
      };
    }

    const bottom = claims.bottom > 0 ? claims.bottom + EDGE_MARGIN * 2 : EDGE_MARGIN;
    const maxTop = viewport.height - bottom - MIN_PANEL_HEIGHT;
    const top = Math.min(position.top, Math.max(getToolbarBottom(), maxTop));

    if (position.anchor === 'left') {
      const left = viewport.width - position.right - size;
      return {
        position: 'fixed' as const,
        top,
        left: Math.max(EDGE_MARGIN, left),
        bottom,
        width: size,
      };
    }

    return {
      position: 'fixed' as const,
      top,
      right: position.right,
      bottom,
      width: size,
    };
  }, [panel, claims, position, viewport]);

  // Drag handlers
  const handleDragStart = useCallback(
    (e: PointerEvent) => {
      if ((e.target as Element).closest('button')) return;
      dragging.current = true;
      setIsDragging(true);
      const el = (e.currentTarget as Element).closest('[data-ls-panel]');
      if (!el) return;
      const rect = el.getBoundingClientRect();
      dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    },
    [],
  );

  const handleDragMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging.current) return;
      if (panel.dock === 'bottom') return;

      const newTop = Math.max(0, e.clientY - dragOffset.current.y);
      const panelWidth = panel.size;
      const newRight = Math.max(
        0,
        document.documentElement.clientWidth - e.clientX - (panelWidth - dragOffset.current.x),
      );
      setPosition((prev) => ({
        top: newTop,
        right: newRight,
        anchor: prev.anchor,
        height: prev.height,
      }));

      // Detect dock zone under pointer
      const zone = detectDockZone(e.clientX, e.clientY);
      setActiveZone(zone);
    },
    [panel.dock, panel.size],
  );

  const handleDragEnd = useCallback(
    (e: PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      setIsDragging(false);
      setActiveZone(null);
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
      if (panel.dock === 'bottom') return;

      // Check if dropped in a dock zone
      const zone = detectDockZone(e.clientX, e.clientY);
      if (zone) {
        // Snap to the detected dock position
        setPanelDock(panelId, zone);
        if (zone === 'bottom') {
          // Reset position for bottom dock — it uses fixed layout
          setPosition(getDefaultPosition(panelId, zone));
        } else {
          // For left/right, snap position to appropriate edge
          const snapped = snapToEdges(
            { top: Math.max(0, e.clientY - dragOffset.current.y), right: zone === 'right' ? EDGE_MARGIN : document.documentElement.clientWidth - panel.size - EDGE_MARGIN, anchor: zone as 'left' | 'right' },
            panel.size,
          );
          setPosition(snapped);
        }
        return;
      }

      setPosition((pos) => {
        const snapped = snapToEdges(pos, panel.size);
        const newDock: DockPosition = snapped.anchor === 'left' ? 'left' : 'right';
        if (newDock !== panel.dock) {
          setPanelDock(panelId, newDock);
        }
        return snapped;
      });
    },
    [panel.dock, panel.size, panelId, setPanelDock],
  );

  // Resize handler
  const handleResizeStart = useCallback(
    (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);

      const startX = e.clientX;
      const startY = e.clientY;
      const startSize = panel.size;
      const dock = panel.dock;

      const onMove = (ev: PointerEvent) => {
        let newSize: number;
        if (dock === 'bottom') {
          newSize = Math.max(120, Math.min(window.innerHeight - 100, startSize + (startY - ev.clientY)));
        } else if (dock === 'left') {
          newSize = Math.max(200, Math.min(window.innerWidth * 0.5, startSize + (ev.clientX - startX)));
        } else {
          newSize = Math.max(200, Math.min(window.innerWidth * 0.5, startSize + (startX - ev.clientX)));
        }
        setPanelSize(panelId, newSize);
      };

      const onUp = () => {
        setIsResizing(false);
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    },
    [panel.size, panel.dock, panelId, setPanelSize],
  );

  return {
    style,
    isDragging,
    isResizing,
    activeZone,
    dragHandlers: {
      onPointerDown: handleDragStart,
      onPointerMove: handleDragMove,
      onPointerUp: handleDragEnd,
    },
    handleResizeStart,
  };
}

// ── Panel Component ──

export function Panel({ panelId, tabs, onClose, headerSlot, label, children, className }: PanelProps) {
  const panel = useStore((s) => s.panels[panelId]);
  const allPanels = useStore((s) => s.panels);
  const setPanelActiveTab = useStore((s) => s.setPanelActiveTab);
  const { style, isDragging, activeZone, dragHandlers, handleResizeStart } = usePanelPosition(panelId);

  const { dock, activeTab } = panel;

  // Compute which dock positions are occupied by *other* open panels
  const occupiedPositions = useMemo(() => {
    const occupied = new Set<DockPosition>();
    for (const [id, p] of Object.entries(allPanels)) {
      if (id !== panelId && p.open) {
        occupied.add(p.dock);
      }
    }
    return occupied;
  }, [allPanels, panelId]);

  const resizeEdgeClass =
    dock === 'bottom'
      ? styles.resizeEdgeTop
      : dock === 'left'
        ? styles.resizeEdgeRight
        : styles.resizeEdgeLeft;

  return (
    <div
      data-ls-panel={panelId}
      data-dock={dock}
      className={`${styles.panel} ${isDragging ? styles.dragging : ''} ${className ?? ''}`}
      style={style}
    >
      {/* Dock indicator zones — shown while dragging */}
      {isDragging && (
        <DockIndicators
          activeZone={activeZone}
          occupiedPositions={occupiedPositions}
          draggingPanelId={panelId}
        />
      )}

      {/* Resize edge */}
      <div
        className={`${styles.resizeEdge} ${resizeEdgeClass}`}
        onPointerDown={handleResizeStart}
      />

      {/* Header with drag + tabs */}
      <div
        className={styles.header}
        {...(dock !== 'bottom' ? dragHandlers : {})}
      >
        {/* Drag handle grip dots */}
        {dock !== 'bottom' && <DockHandle />}

        {label && <span className={styles.label}>{label}</span>}

        <div className={styles.tabBar}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
              onClick={() => !tab.disabled && setPanelActiveTab(panelId, tab.id)}
              disabled={tab.disabled}
              title={tab.disabled ? `${tab.label} (single selection only)` : (tab.shortcut ?? tab.label)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className={styles.headerRight}>
          {headerSlot}
          <button className={styles.headerButton} onClick={onClose} title="Close">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className={styles.content}>
        {children}
      </div>
    </div>
  );
}
