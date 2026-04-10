/**
 * PanelDocking — dock indicator zones and drag-to-dock logic for panels.
 *
 * Renders translucent edge highlights (left, right, bottom) when a panel is
 * being dragged.  When the pointer is released inside a zone the panel snaps
 * to that dock position.  Each dock position can only hold one panel at a
 * time — the "claims" system in panels-slice tracks occupancy.
 */

import type { DockPosition, PanelId } from '../../state/slices/panels-slice';
import styles from './PanelDocking.module.css';

// ── Constants ──

/** Distance from viewport edge (px) that activates a dock zone. */
export const DOCK_ZONE_SIZE = 60;

// ── Detect active dock zone ──

export type DockZoneHit = DockPosition | null;

/**
 * Given pointer coordinates, return which dock zone (if any) the pointer
 * is hovering over.
 */
export function detectDockZone(clientX: number, clientY: number): DockZoneHit {
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;

  // Bottom zone takes priority when in the corner
  if (clientY > vh - DOCK_ZONE_SIZE) return 'bottom';
  if (clientX < DOCK_ZONE_SIZE) return 'left';
  if (clientX > vw - DOCK_ZONE_SIZE) return 'right';
  return null;
}

// ── Dock Indicators (rendered during drag) ──

export interface DockIndicatorsProps {
  /** Which zone the pointer is currently over, or null */
  activeZone: DockZoneHit;
  /** Dock positions already occupied by *other* panels */
  occupiedPositions: Set<DockPosition>;
  /** The panel being dragged — so we can exclude its own current dock */
  draggingPanelId: PanelId | null;
}

/**
 * Overlay component that renders translucent dock-zone indicators on the
 * viewport edges.  Only visible when `activeZone` is non-null.
 */
export function DockIndicators({ activeZone, occupiedPositions }: DockIndicatorsProps) {
  return (
    <div className={styles.dockOverlay}>
      <DockZone
        position="left"
        active={activeZone === 'left'}
        occupied={occupiedPositions.has('left')}
      />
      <DockZone
        position="right"
        active={activeZone === 'right'}
        occupied={occupiedPositions.has('right')}
      />
      <DockZone
        position="bottom"
        active={activeZone === 'bottom'}
        occupied={occupiedPositions.has('bottom')}
      />
    </div>
  );
}

// ── Individual zone ──

interface DockZoneProps {
  position: DockPosition;
  active: boolean;
  occupied: boolean;
}

function DockZone({ position, active, occupied }: DockZoneProps) {
  const zoneClass =
    position === 'left'
      ? styles.dockZoneLeft
      : position === 'right'
        ? styles.dockZoneRight
        : styles.dockZoneBottom;

  // If another panel already occupies this position, dim the indicator
  const dimmed = occupied && active;

  return (
    <div
      className={`${styles.dockZone} ${zoneClass} ${active ? styles.active : ''}`}
      style={dimmed ? { opacity: 0.4 } : undefined}
    >
      <span className={styles.dockLabel}>
        {occupied ? `${position} (occupied)` : position}
      </span>
    </div>
  );
}

// ── Drag Handle (grip dots) ──

/**
 * A small visual grip that signals the panel header is draggable.
 * Rendered inside the panel header to give a drag affordance.
 */
export function DockHandle() {
  return (
    <div className={styles.dockHandle} title="Drag to dock">
      <div className={styles.dockDots}>
        <div className={styles.dockDotRow}>
          <span className={styles.dockDot} />
          <span className={styles.dockDot} />
        </div>
        <div className={styles.dockDotRow}>
          <span className={styles.dockDot} />
          <span className={styles.dockDot} />
        </div>
        <div className={styles.dockDotRow}>
          <span className={styles.dockDot} />
          <span className={styles.dockDot} />
        </div>
      </div>
    </div>
  );
}
