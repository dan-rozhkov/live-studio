// ---------------------------------------------------------------------------
// DragControls — visual drag handles for margin, padding, gap, border-radius
// ---------------------------------------------------------------------------
// Renders imperatively on document.documentElement (same as Overlays)
// to show draggable handles on the selected element:
//   - Margin: outer edge handles for margin-top/right/bottom/left
//   - Padding: inner edge handles for padding-top/right/bottom/left
//   - Gap: between flex children, drag to adjust gap
//   - Border-radius: corner circle, drag to adjust border-radius
//
// Handles show only when an element is selected and picker is not active.
// Values update in real time during drag; changes are queued to edit-slice
// on drag end.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from 'preact/hooks';
import { useStore } from '../../state/store';
import { getElementById } from '../../bridge/dom-bridge';
import { refreshIfSelected } from '../../utils/select-node';
import type { DomNode } from '../../state/slices/dom-slice';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PADDING_COLOR = '#FF69B4';  // Figma pink
const GAP_COLOR = '#9747FF';      // Figma purple
const RADIUS_COLOR = '#0D99FF';   // Selection blue
const MARGIN_COLOR = '#0D99FF';   // Selection blue

const RADIUS_CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'] as const;
type RadiusCorner = typeof RADIUS_CORNERS[number];

const OPPOSITE_SIDE: Record<string, string> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function buildSelectorFromNode(node: DomNode): string {
  const tag = node.tag;
  const attrs = node.attributes ?? {};
  if (attrs.id) return `${tag}#${attrs.id}`;
  if (attrs['data-testid']) return `${tag}[data-testid="${attrs['data-testid']}"]`;
  if (attrs['data-id']) return `${tag}[data-id="${attrs['data-id']}"]`;
  return tag;
}

function findNodeInTree(tree: DomNode | null, id: number): DomNode | null {
  if (!tree) return null;
  if (tree.id === id) return tree;
  for (const child of tree.children) {
    const found = findNodeInTree(child, id);
    if (found) return found;
  }
  return null;
}

function isVisualControlElement(el: Element): boolean {
  if ((el as HTMLElement).dataset?.lsVisualControl) return true;
  if (el.tagName === 'LIVE-STUDIO-PANEL') return true;
  return false;
}

// ---------------------------------------------------------------------------
// Dot grip pattern (matches reference implementation)
// ---------------------------------------------------------------------------

function setDotGrip(
  gs: CSSStyleDeclaration,
  color: string,
  isVertical: boolean,
  _clampDim: number,
): void {
  if (isVertical) {
    gs.width = '1px';
    gs.height = '10px';
    gs.background = color;
  } else {
    gs.width = '10px';
    gs.height = '1px';
    gs.background = color;
  }
}

// ---------------------------------------------------------------------------
// Indicator DOM creation helpers
// ---------------------------------------------------------------------------

interface Indicator {
  container: HTMLDivElement;
  line: HTMLDivElement;
  hitArea: HTMLDivElement;
  grip: HTMLDivElement;
  label: HTMLDivElement;
  side?: string;
  isVertical?: boolean;
}

interface DragTarget {
  el: Element;
  selector: string;
  initialValues: Record<string, string>;
}

function createIndicator(name: string, color: string): Indicator {
  const container = document.createElement('div');
  container.setAttribute('data-ls-visual-control', `${name}-container`);
  container.style.cssText =
    'position:fixed;pointer-events:none;z-index:2147483641;box-sizing:border-box;display:none;overflow:visible;';

  const line = document.createElement('div');
  line.setAttribute('data-ls-visual-control', `${name}-line`);
  line.style.cssText =
    'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;opacity:0;transition:opacity 0.15s;box-sizing:border-box;';
  container.appendChild(line);

  const hitArea = document.createElement('div');
  hitArea.setAttribute('data-ls-visual-control', `${name}-handle`);
  hitArea.style.cssText =
    'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:24px;height:24px;pointer-events:auto;display:flex;align-items:center;justify-content:center;';
  container.appendChild(hitArea);

  const grip = document.createElement('div');
  grip.setAttribute('data-ls-visual-control', `${name}-grip`);
  grip.style.cssText = 'border-radius:1px;';
  hitArea.appendChild(grip);

  const label = document.createElement('div');
  label.setAttribute('data-ls-visual-control', `${name}-tooltip`);
  label.style.cssText = `position:absolute;padding:2px 6px;border-radius:4px;font-size:10px;font-family:monospace;white-space:nowrap;background:${color};color:#fff;border:none;z-index:1;pointer-events:none;opacity:0;transition:opacity 0.15s;`;
  container.appendChild(label);

  // Hover feedback
  hitArea.addEventListener('mouseenter', () => {
    line.style.opacity = '1';
    label.style.opacity = '1';
  });
  hitArea.addEventListener('mouseleave', () => {
    if ((hitArea as any).dataset.dragging) return;
    line.style.opacity = '0';
    label.style.opacity = '0';
  });

  document.documentElement.appendChild(container);
  return { container, line, hitArea, grip, label };
}

// ---------------------------------------------------------------------------
// Drag helpers
// ---------------------------------------------------------------------------

function startDrag(
  target: HTMLDivElement,
  line: HTMLDivElement,
  label: HTMLDivElement,
  grip: HTMLDivElement,
  e: PointerEvent,
  cursor: string,
): void {
  target.setPointerCapture(e.pointerId);
  (target as any).dataset.dragging = '1';
  line.style.opacity = '1';
  label.style.opacity = '1';
  document.documentElement.style.cursor = cursor;
  document.documentElement.style.userSelect = 'none';
}

function endDrag(
  target: HTMLDivElement,
  line: HTMLDivElement,
  label: HTMLDivElement,
  grip: HTMLDivElement,
  e: PointerEvent,
  onMove: (e: PointerEvent) => void,
  onUp: (e: PointerEvent) => void,
): void {
  target.releasePointerCapture(e.pointerId);
  delete (target as any).dataset.dragging;
  document.documentElement.style.cursor = '';
  document.documentElement.style.userSelect = '';
  target.removeEventListener('pointermove', onMove as EventListener);
  target.removeEventListener('pointerup', onUp as EventListener);
  target.removeEventListener('lostpointercapture', onUp as EventListener);
  line.style.opacity = '0';
  label.style.opacity = '0';
}

// ---------------------------------------------------------------------------
// Box spacing positions
// ---------------------------------------------------------------------------

interface BoxSpacingPosition {
  top: number;
  left: number;
  width: number;
  height: number;
  side: string;
  value: string;
}

function computeMarginPositions(el: Element, rect: DOMRect): BoxSpacingPosition[] {
  const cs = getComputedStyle(el);
  const mt = parseFloat(cs.marginTop) || 0;
  const mr = parseFloat(cs.marginRight) || 0;
  const mb = parseFloat(cs.marginBottom) || 0;
  const ml = parseFloat(cs.marginLeft) || 0;
  const w = rect.width;
  const h = rect.height;
  const positions: BoxSpacingPosition[] = [];
  const horizontalMarginWidth = Math.max(w + ml + mr, 2);

  if (mt > 0) positions.push({ top: -mt, left: -ml, width: horizontalMarginWidth, height: mt, side: 'top', value: Math.round(mt) + 'px' });
  if (mb > 0) positions.push({ top: h, left: -ml, width: horizontalMarginWidth, height: mb, side: 'bottom', value: Math.round(mb) + 'px' });
  if (ml > 0) positions.push({ top: 0, left: -ml, width: ml, height: h, side: 'left', value: Math.round(ml) + 'px' });
  if (mr > 0) positions.push({ top: 0, left: w, width: mr, height: h, side: 'right', value: Math.round(mr) + 'px' });

  return positions;
}

function computePaddingPositions(el: Element, rect: DOMRect): BoxSpacingPosition[] {
  const cs = getComputedStyle(el);
  const pt = parseFloat(cs.paddingTop) || 0;
  const pr = parseFloat(cs.paddingRight) || 0;
  const pb = parseFloat(cs.paddingBottom) || 0;
  const pl = parseFloat(cs.paddingLeft) || 0;
  const w = rect.width;
  const h = rect.height;

  return [
    { top: 0, left: 0, width: w, height: Math.max(pt, 2), side: 'top', value: Math.round(pt) + 'px' },
    { top: h - Math.max(pb, 2), left: 0, width: w, height: Math.max(pb, 2), side: 'bottom', value: Math.round(pb) + 'px' },
    { top: pt, left: 0, width: Math.max(pl, 2), height: h - pt - pb, side: 'left', value: Math.round(pl) + 'px' },
    { top: pt, left: w - Math.max(pr, 2), width: Math.max(pr, 2), height: h - pt - pb, side: 'right', value: Math.round(pr) + 'px' },
  ];
}

// ---------------------------------------------------------------------------
// Gap positions
// ---------------------------------------------------------------------------

interface GapPosition {
  top: number;
  left: number;
  width: number;
  height: number;
  isVertical: boolean;
}

function computeGapPositions(el: Element, rect: DOMRect): GapPosition[] {
  const cs = getComputedStyle(el);
  const d = cs.display;
  if (d !== 'flex' && d !== 'inline-flex') return [];

  const isRow = (cs.flexDirection || 'row').startsWith('row');
  const children: Element[] = [];
  for (let i = 0; i < el.children.length; i++) {
    const child = el.children[i];
    if (isVisualControlElement(child)) continue;
    const childCs = getComputedStyle(child);
    if (childCs.display === 'none' || childCs.position === 'absolute' || childCs.position === 'fixed') continue;
    children.push(child);
  }
  if (children.length < 2) return [];

  const rects = children.map((c) => {
    const r = c.getBoundingClientRect();
    return new DOMRect(r.left - rect.left, r.top - rect.top, r.width, r.height);
  });

  // Group into wrap lines
  const lines = groupIntoLines(rects, isRow, cs.flexWrap !== 'nowrap');
  const positions: GapPosition[] = [];

  for (const line of lines) {
    const sorted = [...line].sort((a, b) => (isRow ? a.left - b.left : a.top - b.top));
    for (let i = 0; i < sorted.length - 1; i++) {
      const curr = sorted[i];
      const next = sorted[i + 1];
      if (isRow) {
        positions.push({
          top: 0,
          left: curr.right,
          width: Math.max(next.left - curr.right, 2),
          height: rect.height,
          isVertical: true,
        });
      } else {
        positions.push({
          top: curr.bottom,
          left: 0,
          width: rect.width,
          height: Math.max(next.top - curr.bottom, 2),
          isVertical: false,
        });
      }
    }
  }
  return positions;
}

function groupIntoLines(rects: DOMRect[], isRow: boolean, canWrap: boolean): DOMRect[][] {
  if (!canWrap || rects.length === 0) return [rects];
  const sorted = [...rects].sort((a, b) =>
    isRow
      ? a.top !== b.top ? a.top - b.top : a.left - b.left
      : a.left !== b.left ? a.left - b.left : a.top - b.top,
  );
  const lines: DOMRect[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const r = sorted[i];
    const prev = lines[lines.length - 1][0];
    const same = isRow
      ? r.top < prev.bottom && r.bottom > prev.top
      : r.left < prev.right && r.right > prev.left;
    if (same) lines[lines.length - 1].push(r);
    else lines.push([r]);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Serialize rects for change-detection
// ---------------------------------------------------------------------------

function serializeRects(positions: Array<{ top: number; left: number; width: number; height: number }>): string {
  let s = '';
  for (const p of positions) s += `${p.top | 0},${p.left | 0},${p.width | 0},${p.height | 0};`;
  return s;
}

// ---------------------------------------------------------------------------
// DragControls component
// ---------------------------------------------------------------------------

export function DragControls() {
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const isPickingElement = useStore((s) => s.isPickingElement);
  const domTree = useStore((s) => s.domTree);

  // Refs for imperative DOM management
  const marginIndicators = useRef<Indicator[]>([]);
  const paddingIndicators = useRef<Indicator[]>([]);
  const gapIndicators = useRef<Indicator[]>([]);
  const radiusHandle = useRef<{
    container: HTMLDivElement;
    handles: HTMLDivElement[];
    label: HTMLDivElement;
  } | null>(null);
  const rafRef = useRef<number>(0);
  const prevMarginKey = useRef('');
  const prevPaddingKey = useRef('');
  const prevGapKey = useRef('');
  const dragTargetRef = useRef<DragTarget | null>(null);

  useEffect(() => {
    // Cancel previous loop
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }

    resetVisualState();
    dragTargetRef.current = null;

    // Hide all if no selection or in picker mode
    if (selectedNodeId === null || isPickingElement) {
      hideAll();
      return;
    }

    const el = getElementById(selectedNodeId);
    if (!el || !el.isConnected) {
      hideAll();
      return;
    }

    // Find node for selector
    const node = findNodeInTree(domTree, selectedNodeId);
    const selector = node ? buildSelectorFromNode(node) : '';

    // Track initial computed values for change detection
    const initialValues: Record<string, string> = {};
    dragTargetRef.current = { el, selector, initialValues };

    // ---- Margin setup ----
    setupMarginIndicators(el);

    // ---- Padding setup ----
    setupPaddingIndicators(el);

    // ---- Gap setup ----
    setupGapIndicators(el);

    // ---- Border-radius setup ----
    setupRadiusHandle(el);

    // ---- Animation loop ----
    function tick() {
      if (!el!.isConnected) {
        hideAll();
        return;
      }

      const rect = el!.getBoundingClientRect();

      // Update margin indicators
      updateMarginPositions(el!, rect);

      // Update padding indicators
      updatePaddingPositions(el!, rect);

      // Update gap indicators
      updateGapPositions(el!, rect);

      // Update border-radius handle
      updateRadiusPosition(el!, rect);

      rafRef.current = requestAnimationFrame(tick);
    }

    tick();

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };

    // ================================================================
    // Setup functions
    // ================================================================

    function setupPaddingIndicators(el: Element) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 50 || rect.height < 50) return;

      const positions = computePaddingPositions(el, rect);
      prevPaddingKey.current = serializeRects(positions);

      // Ensure we have 4 indicators
      while (paddingIndicators.current.length < 4) {
        const ind = createIndicator('padding', PADDING_COLOR);
        setupPaddingDrag(ind);
        paddingIndicators.current.push(ind);
      }

      syncPaddingPositions(positions, rect);
    }

    function setupMarginIndicators(el: Element) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 50 || rect.height < 50) return;

      const positions = computeMarginPositions(el, rect);
      prevMarginKey.current = serializeRects(positions);

      while (marginIndicators.current.length < positions.length) {
        const ind = createIndicator('margin', MARGIN_COLOR);
        setupMarginDrag(ind);
        marginIndicators.current.push(ind);
      }

      syncMarginPositions(positions, rect);
    }

    function setupGapIndicators(el: Element) {
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const d = cs.display;
      if (d !== 'flex' && d !== 'inline-flex') return;
      if (rect.width < 50 || rect.height < 50) return;

      const positions = computeGapPositions(el, rect);
      prevGapKey.current = serializeRects(positions);

      // Sync indicator count
      while (gapIndicators.current.length < positions.length) {
        const ind = createIndicator('gap', GAP_COLOR);
        setupGapDrag(ind);
        gapIndicators.current.push(ind);
      }

      syncGapPositions(positions, el, rect);
    }

    function setupRadiusHandle(el: Element) {
      const rect = el.getBoundingClientRect();
      if (!canShowRadiusHandle(el, rect)) {
        if (radiusHandle.current) radiusHandle.current.container.style.display = 'none';
        return;
      }

      if (!radiusHandle.current) {
        const container = document.createElement('div');
        container.setAttribute('data-ls-visual-control', 'radius');
        container.style.cssText =
          'position:fixed;pointer-events:none;z-index:2147483641;display:none;overflow:visible;';

        const label = document.createElement('div');
        label.setAttribute('data-ls-visual-control', 'radius-tooltip');
        label.style.cssText = `position:absolute;left:12px;top:-6px;padding:2px 6px;border-radius:4px;font-size:10px;font-family:monospace;white-space:nowrap;background:${RADIUS_COLOR};color:#fff;border:none;z-index:1;pointer-events:none;opacity:0;transition:opacity 0.15s;`;

        container.appendChild(label);

        const handles = RADIUS_CORNERS.map((corner) => {
          const handle = document.createElement('div');
          handle.setAttribute('data-ls-visual-control', 'radius-handle');
          handle.dataset.corner = corner;
          handle.style.cssText = `position:absolute;width:12px;height:12px;border-radius:50%;background:${hexToRgba(RADIUS_COLOR, 0.25)};pointer-events:auto;cursor:${getRadiusCursor(corner)};transform:translate(-50%,-50%);transition:transform 0.15s,filter 0.15s;`;

          const inner = document.createElement('div');
          inner.style.cssText = `position:absolute;top:50%;left:50%;width:4px;height:4px;border-radius:50%;background:${RADIUS_COLOR};transform:translate(-50%,-50%);`;
          handle.appendChild(inner);

          handle.addEventListener('mouseenter', () => {
            label.style.opacity = '1';
            positionRadiusLabel(label, handle);
          });
          handle.addEventListener('mouseleave', () => {
            if ((handle as any).dataset.dragging) return;
            label.style.opacity = '0';
          });

          container.appendChild(handle);
          return handle;
        });

        document.documentElement.appendChild(container);
        radiusHandle.current = { container, handles, label };
        setupRadiusDrag();
      }

      updateRadiusPosition(el, rect);
    }

    // ---- Position sync ----

    function syncBoxSpacingPosition(
      ind: Indicator,
      pos: BoxSpacingPosition,
      rect: DOMRect,
      color: string,
      borderSideBySpacingSide: Record<string, keyof CSSStyleDeclaration>,
    ) {
      ind.side = pos.side;
      const s = ind.container.style;
      s.display = 'block';
      s.top = (rect.top + pos.top) + 'px';
      s.left = (rect.left + pos.left) + 'px';
      s.width = pos.width + 'px';
      s.height = pos.height + 'px';

      const ls = ind.line.style;
      ls.borderTop = 'none';
      ls.borderRight = 'none';
      ls.borderBottom = 'none';
      ls.borderLeft = 'none';
      const border = `1px dashed ${hexToRgba(color, 0.4)}`;
      ls[borderSideBySpacingSide[pos.side] as any] = border;

      const isH = pos.side === 'top' || pos.side === 'bottom';
      setDotGrip(ind.grip.style, color, !isH, isH ? pos.height : pos.width);
      ind.hitArea.style.cursor = isH ? 'ns-resize' : 'ew-resize';
      (ind.hitArea as any).dataset.side = pos.side;

      ind.label.textContent = pos.value;
      if (pos.side === 'top') {
        ind.label.style.left = '50%';
        ind.label.style.bottom = '';
        ind.label.style.top = '-6px';
        ind.label.style.right = '';
        ind.label.style.transform = 'translate(-50%,-100%)';
      } else if (pos.side === 'bottom') {
        ind.label.style.left = '50%';
        ind.label.style.top = '';
        ind.label.style.bottom = '-6px';
        ind.label.style.right = '';
        ind.label.style.transform = 'translate(-50%,100%)';
      } else if (pos.side === 'left') {
        ind.label.style.top = '50%';
        ind.label.style.right = '';
        ind.label.style.left = '-6px';
        ind.label.style.bottom = '';
        ind.label.style.transform = 'translate(-100%,-50%)';
      } else {
        ind.label.style.top = '50%';
        ind.label.style.left = '';
        ind.label.style.right = '-6px';
        ind.label.style.bottom = '';
        ind.label.style.transform = 'translate(100%,-50%)';
      }
    }

    function syncMarginPositions(positions: BoxSpacingPosition[], rect: DOMRect) {
      for (let i = 0; i < positions.length; i++) {
        const pos = positions[i];
        const ind = marginIndicators.current[i];
        if (!ind) continue;

        syncBoxSpacingPosition(ind, pos, rect, MARGIN_COLOR, {
          top: 'borderTop',
          bottom: 'borderBottom',
          left: 'borderLeft',
          right: 'borderRight',
        });
      }

      for (let i = positions.length; i < marginIndicators.current.length; i++) {
        marginIndicators.current[i].container.style.display = 'none';
      }
    }

    function syncPaddingPositions(positions: BoxSpacingPosition[], rect: DOMRect) {
      for (let i = 0; i < positions.length; i++) {
        const pos = positions[i];
        const ind = paddingIndicators.current[i];
        if (!ind) continue;

        // Hide grip when padding value is 0
        const numVal = parseFloat(pos.value) || 0;
        if (numVal === 0) {
          ind.container.style.display = 'none';
          continue;
        }

        syncBoxSpacingPosition(ind, pos, rect, PADDING_COLOR, {
          top: 'borderBottom',
          bottom: 'borderTop',
          left: 'borderRight',
          right: 'borderLeft',
        });

        if (pos.side === 'top') {
          ind.label.style.left = '50%';
          ind.label.style.bottom = '-6px';
          ind.label.style.top = '';
          ind.label.style.transform = 'translate(-50%,100%)';
        } else if (pos.side === 'bottom') {
          ind.label.style.left = '50%';
          ind.label.style.top = '-6px';
          ind.label.style.bottom = '';
          ind.label.style.transform = 'translate(-50%,-100%)';
        } else if (pos.side === 'left') {
          ind.label.style.top = '50%';
          ind.label.style.right = '-6px';
          ind.label.style.left = '';
          ind.label.style.bottom = '';
          ind.label.style.transform = 'translate(100%,-50%)';
        } else {
          ind.label.style.top = '50%';
          ind.label.style.left = '-6px';
          ind.label.style.right = '';
          ind.label.style.bottom = '';
          ind.label.style.transform = 'translate(-100%,-50%)';
        }
      }

      // Hide extra indicators
      for (let i = positions.length; i < paddingIndicators.current.length; i++) {
        paddingIndicators.current[i].container.style.display = 'none';
      }
    }

    function syncGapPositions(positions: GapPosition[], el: Element, rect: DOMRect) {
      const cs = getComputedStyle(el);
      const gapNum = Math.round(parseFloat(cs.gap || cs.rowGap || '0') || 0);
      const gapValue = gapNum === 0 ? '0' : gapNum + 'px';

      for (let i = 0; i < positions.length; i++) {
        const pos = positions[i];
        const ind = gapIndicators.current[i];
        if (!ind) continue;

        // Hide grip when gap value is 0
        if (gapNum === 0) {
          ind.container.style.display = 'none';
          continue;
        }

        ind.isVertical = pos.isVertical;
        const s = ind.container.style;
        s.display = 'block';
        s.top = (rect.top + pos.top) + 'px';
        s.left = (rect.left + pos.left) + 'px';
        s.width = pos.width + 'px';
        s.height = pos.height + 'px';

        const ls = ind.line.style;
        if (pos.isVertical) {
          ls.borderLeft = `1px dashed ${hexToRgba(GAP_COLOR, 0.4)}`;
          ls.borderTop = 'none';
        } else {
          ls.borderTop = `1px dashed ${hexToRgba(GAP_COLOR, 0.4)}`;
          ls.borderLeft = 'none';
        }

        setDotGrip(ind.grip.style, GAP_COLOR, pos.isVertical, pos.isVertical ? pos.width : pos.height);
        ind.hitArea.style.cursor = pos.isVertical ? 'col-resize' : 'row-resize';
        (ind.hitArea as any).dataset.vertical = pos.isVertical ? '1' : '0';

        ind.label.textContent = gapValue;
        if (pos.isVertical) {
          ind.label.style.left = '50%';
          ind.label.style.top = '-6px';
          ind.label.style.transform = 'translate(-50%,-100%)';
        } else {
          ind.label.style.top = '50%';
          ind.label.style.left = '-6px';
          ind.label.style.transform = 'translate(-100%,-50%)';
        }
      }

      // Hide extra indicators
      for (let i = positions.length; i < gapIndicators.current.length; i++) {
        gapIndicators.current[i].container.style.display = 'none';
      }
    }

    // ---- Update functions (called in rAF tick) ----

    function updateMarginPositions(el: Element, rect: DOMRect) {
      if (rect.width < 50 || rect.height < 50) {
        for (const ind of marginIndicators.current) ind.container.style.display = 'none';
        return;
      }
      const positions = computeMarginPositions(el, rect);
      const key = serializeRects(positions);
      if (key !== prevMarginKey.current) {
        prevMarginKey.current = key;
        while (marginIndicators.current.length < positions.length) {
          const ind = createIndicator('margin', MARGIN_COLOR);
          setupMarginDrag(ind);
          marginIndicators.current.push(ind);
        }
        syncMarginPositions(positions, rect);
      } else {
        for (let i = 0; i < positions.length; i++) {
          const pos = positions[i];
          const ind = marginIndicators.current[i];
          if (!ind) continue;
          ind.container.style.top = (rect.top + pos.top) + 'px';
          ind.container.style.left = (rect.left + pos.left) + 'px';
        }
      }
    }

    function updatePaddingPositions(el: Element, rect: DOMRect) {
      if (rect.width < 50 || rect.height < 50) {
        for (const ind of paddingIndicators.current) ind.container.style.display = 'none';
        return;
      }
      const positions = computePaddingPositions(el, rect);
      const key = serializeRects(positions);
      if (key !== prevPaddingKey.current) {
        prevPaddingKey.current = key;
        syncPaddingPositions(positions, rect);
      } else {
        // Still update viewport position even if padding values haven't changed
        for (let i = 0; i < positions.length; i++) {
          const pos = positions[i];
          const ind = paddingIndicators.current[i];
          if (!ind) continue;
          ind.container.style.top = (rect.top + pos.top) + 'px';
          ind.container.style.left = (rect.left + pos.left) + 'px';
        }
      }
    }

    function updateGapPositions(el: Element, rect: DOMRect) {
      const cs = getComputedStyle(el);
      const d = cs.display;
      if (d !== 'flex' && d !== 'inline-flex' || rect.width < 50 || rect.height < 50) {
        for (const ind of gapIndicators.current) ind.container.style.display = 'none';
        return;
      }
      const positions = computeGapPositions(el, rect);
      const key = serializeRects(positions);
      if (key !== prevGapKey.current) {
        prevGapKey.current = key;
        // May need more indicators
        while (gapIndicators.current.length < positions.length) {
          const ind = createIndicator('gap', GAP_COLOR);
          setupGapDrag(ind);
          gapIndicators.current.push(ind);
        }
        syncGapPositions(positions, el, rect);
      } else {
        for (let i = 0; i < positions.length; i++) {
          const pos = positions[i];
          const ind = gapIndicators.current[i];
          if (!ind) continue;
          ind.container.style.top = (rect.top + pos.top) + 'px';
          ind.container.style.left = (rect.left + pos.left) + 'px';
        }
      }
    }

    function updateRadiusPosition(el: Element, rect: DOMRect) {
      if (!radiusHandle.current) return;
      if (!canShowRadiusHandle(el, rect)) {
        radiusHandle.current.container.style.display = 'none';
        return;
      }
      const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
      const offset = Math.min(Math.max(radius, 5), Math.min(rect.width, rect.height) / 2);

      radiusHandle.current.container.style.display = 'block';
      radiusHandle.current.container.style.top = rect.top + 'px';
      radiusHandle.current.container.style.left = rect.left + 'px';
      radiusHandle.current.container.style.width = rect.width + 'px';
      radiusHandle.current.container.style.height = rect.height + 'px';

      const left = offset + 'px';
      const right = (rect.width - offset) + 'px';
      const top = offset + 'px';
      const bottom = (rect.height - offset) + 'px';
      for (const handle of radiusHandle.current.handles) {
        const corner = handle.dataset.corner as RadiusCorner | undefined;
        handle.style.left = (corner === 'top-right' || corner === 'bottom-right') ? right : left;
        handle.style.top = (corner === 'bottom-right' || corner === 'bottom-left') ? bottom : top;
      }

      radiusHandle.current.label.textContent = radius === 0 ? '0' : Math.round(radius) + 'px';
    }

    function canShowRadiusHandle(el: Element, rect: DOMRect): boolean {
      if (rect.width < 50 || rect.height < 50) return false;

      const cs = getComputedStyle(el);
      const bg = cs.backgroundColor;
      if (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') return false;

      const tl = cs.borderTopLeftRadius;
      return (
        tl === cs.borderTopRightRadius &&
        tl === cs.borderBottomRightRadius &&
        tl === cs.borderBottomLeftRadius
      );
    }

    function getRadiusCursor(corner: RadiusCorner): string {
      return corner === 'top-right' || corner === 'bottom-left' ? 'nesw-resize' : 'nwse-resize';
    }

    function getRadiusLocalPoint(corner: RadiusCorner, e: PointerEvent, rect: DOMRect): { x: number; y: number } {
      if (corner === 'top-right') {
        return { x: rect.right - e.clientX, y: e.clientY - rect.top };
      }
      if (corner === 'bottom-right') {
        return { x: rect.right - e.clientX, y: rect.bottom - e.clientY };
      }
      if (corner === 'bottom-left') {
        return { x: e.clientX - rect.left, y: rect.bottom - e.clientY };
      }
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function positionRadiusLabel(label: HTMLDivElement, handle: HTMLDivElement): void {
      label.style.left = handle.style.left;
      label.style.top = handle.style.top;
      label.style.right = '';
      label.style.bottom = '';

      const corner = handle.dataset.corner as RadiusCorner | undefined;
      label.style.transform =
        corner === 'bottom-right' || corner === 'bottom-left'
          ? 'translate(-50%,12px)'
          : 'translate(-50%,calc(-100% - 12px))';
    }

    function setupBoxSpacingDrag(
      ind: Indicator,
      propertyBase: 'margin' | 'padding',
      indicators: { current: Indicator[] },
      dragSigns: Record<string, number>,
      minValue: number,
    ) {
      let startX = 0;
      let startY = 0;
      let startVal = 0;
      let side = 'top';
      let activeTarget: DragTarget | null = null;

      function onDown(e: PointerEvent) {
        e.stopPropagation();
        e.preventDefault();
        activeTarget = dragTargetRef.current;
        if (!activeTarget?.el.isConnected) return;

        side = (ind.hitArea as any).dataset.side || 'top';
        const isV = side === 'top' || side === 'bottom';
        startX = e.clientX;
        startY = e.clientY;
        const { el, initialValues } = activeTarget;
        const cs = getComputedStyle(el);
        startVal = parseFloat(cs.getPropertyValue(`${propertyBase}-${side}`)) || 0;

        // Record initial for change tracking
        const prop = `${propertyBase}-${side}`;
        if (!(prop in initialValues)) {
          initialValues[prop] = cs.getPropertyValue(prop);
        }
        const oppProp = `${propertyBase}-${OPPOSITE_SIDE[side]}`;
        if (!(oppProp in initialValues)) {
          initialValues[oppProp] = cs.getPropertyValue(oppProp);
        }

        startDrag(ind.hitArea, ind.line, ind.label, ind.grip, e, isV ? 'ns-resize' : 'ew-resize');

        // Highlight all indicators for the same spacing type.
        for (const sibling of indicators.current) {
          if (sibling === ind) continue;
          sibling.line.style.opacity = '1';
          sibling.grip.style.transform = 'scale(1.3)';
          sibling.grip.style.filter = 'brightness(1.8)';
        }

        ind.hitArea.addEventListener('pointermove', onMove as EventListener);
        ind.hitArea.addEventListener('pointerup', onUp as EventListener);
        ind.hitArea.addEventListener('lostpointercapture', onUp as EventListener);
      }

      function onMove(e: PointerEvent) {
        if (!activeTarget?.el.isConnected) return;

        const isV = side === 'top' || side === 'bottom';
        const sign = dragSigns[side] ?? 1;
        const delta = isV ? (e.clientY - startY) : (e.clientX - startX);
        const val = Math.max(minValue, Math.round(startVal + delta * sign)) + 'px';
        const prop = `${propertyBase}-${side}`;
        const { el } = activeTarget;
        (el as HTMLElement).style.setProperty(prop, val);

        // Sync opposite side unless Shift is held
        if (!e.shiftKey) {
          const opp = `${propertyBase}-${OPPOSITE_SIDE[side]}`;
          (el as HTMLElement).style.setProperty(opp, val);
        }

        ind.label.textContent = val;
      }

      function onUp(e: PointerEvent) {
        endDrag(ind.hitArea, ind.line, ind.label, ind.grip, e, onMove as any, onUp as any);

        // Reset sibling highlights
        for (const sibling of indicators.current) {
          if (sibling === ind) continue;
          sibling.line.style.opacity = '0';
          sibling.grip.style.transform = '';
          sibling.grip.style.filter = '';
        }

        // Queue edits for changed spacing values.
        if (activeTarget?.selector && activeTarget.el.isConnected) {
          const { el, selector, initialValues } = activeTarget;
          const cs = getComputedStyle(el);
          const prop = `${propertyBase}-${side}`;
          const newVal = cs.getPropertyValue(prop);
          const oldVal = initialValues[prop] || '0px';
          if (newVal !== oldVal) {
            useStore.getState().queueEdit({
              type: 'style',
              element: selector,
              name: prop,
              value: `${oldVal} \u2192 ${newVal}`,
            });
            initialValues[prop] = newVal;
          }

          const oppProp = `${propertyBase}-${OPPOSITE_SIDE[side]}`;
          const newOppVal = cs.getPropertyValue(oppProp);
          const oldOppVal = initialValues[oppProp] || '0px';
          if (newOppVal !== oldOppVal) {
            useStore.getState().queueEdit({
              type: 'style',
              element: selector,
              name: oppProp,
              value: `${oldOppVal} \u2192 ${newOppVal}`,
            });
            initialValues[oppProp] = newOppVal;
          }
          refreshIfSelected(useStore.getState().selectedNodeId);
        }
        activeTarget = null;
      }

      ind.hitArea.addEventListener('pointerdown', onDown as EventListener);
    }

    // ---- Drag setup for margin ----
    function setupMarginDrag(ind: Indicator) {
      setupBoxSpacingDrag(ind, 'margin', marginIndicators, {
        top: -1,
        bottom: 1,
        left: -1,
        right: 1,
      }, 0);
    }

    // ---- Drag setup for padding ----
    function setupPaddingDrag(ind: Indicator) {
      setupBoxSpacingDrag(ind, 'padding', paddingIndicators, {
        top: 1,
        bottom: -1,
        left: 1,
        right: -1,
      }, 0);
    }

    // ---- Drag setup for gap ----
    function setupGapDrag(ind: Indicator) {
      let startX = 0;
      let startY = 0;
      let startGap = 0;
      let isVertical = false;
      let activeTarget: DragTarget | null = null;

      function onDown(e: PointerEvent) {
        e.stopPropagation();
        e.preventDefault();
        activeTarget = dragTargetRef.current;
        if (!activeTarget?.el.isConnected) return;

        isVertical = (ind.hitArea as any).dataset.vertical === '1';
        startX = e.clientX;
        startY = e.clientY;
        const { el, initialValues } = activeTarget;
        startGap = parseFloat(getComputedStyle(el).gap) || 0;

        if (!('gap' in initialValues)) {
          initialValues['gap'] = getComputedStyle(el).gap || '0px';
        }

        startDrag(ind.hitArea, ind.line, ind.label, ind.grip, e, isVertical ? 'col-resize' : 'row-resize');

        // Highlight all gap indicators
        for (const sibling of gapIndicators.current) {
          if (sibling === ind) continue;
          sibling.line.style.opacity = '1';
          sibling.grip.style.transform = 'scale(1.3)';
          sibling.grip.style.filter = 'brightness(1.8)';
        }

        ind.hitArea.addEventListener('pointermove', onMove as EventListener);
        ind.hitArea.addEventListener('pointerup', onUp as EventListener);
        ind.hitArea.addEventListener('lostpointercapture', onUp as EventListener);
      }

      function onMove(e: PointerEvent) {
        if (!activeTarget?.el.isConnected) return;

        const delta = isVertical ? (e.clientX - startX) : (e.clientY - startY);
        const val = Math.max(0, Math.round(startGap + delta)) + 'px';
        (activeTarget.el as HTMLElement).style.gap = val;
        ind.label.textContent = val;

        // Update all gap indicator labels
        for (const sibling of gapIndicators.current) {
          if (sibling !== ind) sibling.label.textContent = val;
        }
      }

      function onUp(e: PointerEvent) {
        endDrag(ind.hitArea, ind.line, ind.label, ind.grip, e, onMove as any, onUp as any);

        // Reset sibling highlights
        for (const sibling of gapIndicators.current) {
          if (sibling === ind) continue;
          sibling.line.style.opacity = '0';
          sibling.grip.style.transform = '';
          sibling.grip.style.filter = '';
        }

        // Queue edit
        if (activeTarget?.selector && activeTarget.el.isConnected) {
          const { el, selector, initialValues } = activeTarget;
          const newVal = (el as HTMLElement).style.gap || getComputedStyle(el).gap;
          const oldVal = initialValues['gap'] || '0px';
          if (newVal !== oldVal) {
            useStore.getState().queueEdit({
              type: 'style',
              element: selector,
              name: 'gap',
              value: `${oldVal} \u2192 ${newVal}`,
            });
            initialValues['gap'] = newVal;
          }
          refreshIfSelected(useStore.getState().selectedNodeId);
        }
        activeTarget = null;
      }

      ind.hitArea.addEventListener('pointerdown', onDown as EventListener);
    }

    // ---- Drag setup for border-radius ----
    function setupRadiusDrag() {
      const rh = radiusHandle.current;
      if (!rh) return;
      let activeTarget: DragTarget | null = null;
      let activeHandle: HTMLDivElement | null = null;
      let activeCorner: RadiusCorner = 'top-left';

      function onDown(e: PointerEvent) {
        e.stopPropagation();
        e.preventDefault();
        activeTarget = dragTargetRef.current;
        if (!activeTarget?.el.isConnected) return;
        activeHandle = e.currentTarget as HTMLDivElement;
        activeCorner = (activeHandle.dataset.corner as RadiusCorner | undefined) ?? 'top-left';

        const { el, initialValues } = activeTarget;
        if (!('border-radius' in initialValues)) {
          initialValues['border-radius'] = getComputedStyle(el).borderRadius || '0px';
        }

        activeHandle.setPointerCapture(e.pointerId);
        (activeHandle as any).dataset.dragging = '1';
        rh!.label.style.opacity = '1';
        positionRadiusLabel(rh!.label, activeHandle);
        document.documentElement.style.cursor = getRadiusCursor(activeCorner);
        document.documentElement.style.userSelect = 'none';

        activeHandle.addEventListener('pointermove', onMove as EventListener);
        activeHandle.addEventListener('pointerup', onUp as EventListener);
        activeHandle.addEventListener('lostpointercapture', onUp as EventListener);
      }

      function onMove(e: PointerEvent) {
        if (!activeTarget?.el.isConnected) return;

        const { el } = activeTarget;
        const rect = el.getBoundingClientRect();
        const local = getRadiusLocalPoint(activeCorner, e, rect);
        const localX = local.x;
        const localY = local.y;

        if (localX < 0 || localX > rect.width || localY < 0 || localY > rect.height) return;

        const dist = Math.hypot(localX, localY);
        const maxR = Math.min(rect.width, rect.height) / 2;
        const val = Math.max(0, Math.min(maxR, Math.round(dist))) + 'px';
        (el as HTMLElement).style.borderRadius = val;
        rh!.label.textContent = val;
      }

      function onUp(e: PointerEvent) {
        if (!activeHandle) return;
        activeHandle.releasePointerCapture(e.pointerId);
        delete (activeHandle as any).dataset.dragging;
        document.documentElement.style.cursor = '';
        document.documentElement.style.userSelect = '';
        activeHandle.removeEventListener('pointermove', onMove as EventListener);
        activeHandle.removeEventListener('pointerup', onUp as EventListener);
        activeHandle.removeEventListener('lostpointercapture', onUp as EventListener);
        rh!.label.style.opacity = '0';

        // Queue edit
        if (activeTarget?.selector && activeTarget.el.isConnected) {
          const { el, selector, initialValues } = activeTarget;
          const newVal = (el as HTMLElement).style.borderRadius || getComputedStyle(el).borderRadius;
          const oldVal = initialValues['border-radius'] || '0px';
          if (newVal !== oldVal) {
            useStore.getState().queueEdit({
              type: 'style',
              element: selector,
              name: 'border-radius',
              value: `${oldVal} \u2192 ${newVal}`,
            });
            initialValues['border-radius'] = newVal;
          }
          refreshIfSelected(useStore.getState().selectedNodeId);
        }
        activeTarget = null;
        activeHandle = null;
      }

      for (const handle of rh.handles) {
        handle.addEventListener('pointerdown', onDown as EventListener);
      }
    }

    // ---- Hide all indicators ----
    function hideAll() {
      for (const ind of marginIndicators.current) ind.container.style.display = 'none';
      for (const ind of paddingIndicators.current) ind.container.style.display = 'none';
      for (const ind of gapIndicators.current) ind.container.style.display = 'none';
      if (radiusHandle.current) radiusHandle.current.container.style.display = 'none';
    }

    function resetVisualState() {
      for (const ind of [...marginIndicators.current, ...paddingIndicators.current, ...gapIndicators.current]) {
        delete (ind.hitArea as any).dataset.dragging;
        ind.line.style.opacity = '0';
        ind.label.style.opacity = '0';
        ind.grip.style.transform = '';
        ind.grip.style.filter = '';
      }
      if (radiusHandle.current) {
        for (const handle of radiusHandle.current.handles) {
          delete (handle as any).dataset.dragging;
          handle.style.transform = 'translate(-50%,-50%)';
          handle.style.filter = '';
        }
        radiusHandle.current.label.style.opacity = '0';
      }
      document.documentElement.style.cursor = '';
      document.documentElement.style.userSelect = '';
    }
  }, [selectedNodeId, isPickingElement, domTree]);

  // ---- Cleanup on unmount ----
  useEffect(() => {
    return () => {
      for (const ind of marginIndicators.current) ind.container.remove();
      marginIndicators.current = [];
      for (const ind of paddingIndicators.current) ind.container.remove();
      paddingIndicators.current = [];
      for (const ind of gapIndicators.current) ind.container.remove();
      gapIndicators.current = [];
      if (radiusHandle.current) {
        radiusHandle.current.container.remove();
        radiusHandle.current = null;
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, []);

  // This component renders nothing — all controls are imperative DOM
  return null;
}
