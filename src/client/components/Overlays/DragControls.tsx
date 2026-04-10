// ---------------------------------------------------------------------------
// DragControls — visual drag handles for padding, gap, border-radius
// ---------------------------------------------------------------------------
// Renders imperatively on document.documentElement (same as Overlays)
// to show draggable handles on the selected element:
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
import type { DomNode } from '../../state/slices/dom-slice';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PADDING_COLOR = '#FF69B4';  // Figma pink
const GAP_COLOR = '#9747FF';      // Figma purple
const RADIUS_COLOR = '#F59E0B';   // Figma orange

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
// Padding positions
// ---------------------------------------------------------------------------

interface PaddingPosition {
  top: number;
  left: number;
  width: number;
  height: number;
  side: string;
  value: string;
}

function computePaddingPositions(el: Element, rect: DOMRect): PaddingPosition[] {
  const cs = getComputedStyle(el);
  const pt = parseFloat(cs.paddingTop) || 0;
  const pr = parseFloat(cs.paddingRight) || 0;
  const pb = parseFloat(cs.paddingBottom) || 0;
  const pl = parseFloat(cs.paddingLeft) || 0;
  const w = rect.width;
  const h = rect.height;

  return [
    { top: 0, left: 0, width: w, height: Math.max(pt, 2), side: 'top', value: cs.paddingTop },
    { top: h - Math.max(pb, 2), left: 0, width: w, height: Math.max(pb, 2), side: 'bottom', value: cs.paddingBottom },
    { top: pt, left: 0, width: Math.max(pl, 2), height: h - pt - pb, side: 'left', value: cs.paddingLeft },
    { top: pt, left: w - Math.max(pr, 2), width: Math.max(pr, 2), height: h - pt - pb, side: 'right', value: cs.paddingRight },
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
  const paddingIndicators = useRef<Indicator[]>([]);
  const gapIndicators = useRef<Indicator[]>([]);
  const radiusHandle = useRef<{
    container: HTMLDivElement;
    handle: HTMLDivElement;
    inner: HTMLDivElement;
    label: HTMLDivElement;
  } | null>(null);
  const rafRef = useRef<number>(0);
  const prevPaddingKey = useRef('');
  const prevGapKey = useRef('');

  useEffect(() => {
    // Cancel previous loop
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }

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
    // Setup functions (closures over el, selector, initialValues)
    // ================================================================

    function setupPaddingIndicators(el: Element) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 50 || rect.height < 50) return;

      const positions = computePaddingPositions(el, rect);
      prevPaddingKey.current = serializeRects(positions);

      // Ensure we have 4 indicators
      while (paddingIndicators.current.length < 4) {
        const ind = createIndicator('padding', PADDING_COLOR);
        setupPaddingDrag(ind, el, selector, initialValues);
        paddingIndicators.current.push(ind);
      }

      syncPaddingPositions(positions, rect);
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
        setupGapDrag(ind, el, selector, initialValues);
        gapIndicators.current.push(ind);
      }

      syncGapPositions(positions, el, rect);
    }

    function setupRadiusHandle(el: Element) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 50 || rect.height < 50) return;

      const cs = getComputedStyle(el);
      const bg = cs.backgroundColor;
      if (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') return;

      // Only show for uniform border-radius
      const tl = cs.borderTopLeftRadius;
      if (
        tl !== cs.borderTopRightRadius ||
        tl !== cs.borderBottomRightRadius ||
        tl !== cs.borderBottomLeftRadius
      ) return;

      if (!radiusHandle.current) {
        const container = document.createElement('div');
        container.setAttribute('data-ls-visual-control', 'radius');
        container.style.cssText =
          'position:fixed;pointer-events:none;z-index:2147483641;display:none;overflow:visible;';

        const handle = document.createElement('div');
        handle.setAttribute('data-ls-visual-control', 'radius-handle');
        handle.style.cssText = `position:absolute;width:12px;height:12px;border-radius:50%;background:${hexToRgba(RADIUS_COLOR, 0.25)};pointer-events:auto;cursor:nwse-resize;transform:translate(-50%,-50%);transition:transform 0.15s,filter 0.15s;`;

        const inner = document.createElement('div');
        inner.style.cssText = `position:absolute;top:50%;left:50%;width:4px;height:4px;border-radius:50%;background:${RADIUS_COLOR};transform:translate(-50%,-50%);`;
        handle.appendChild(inner);

        const label = document.createElement('div');
        label.setAttribute('data-ls-visual-control', 'radius-tooltip');
        label.style.cssText = `position:absolute;left:12px;top:-6px;padding:2px 6px;border-radius:4px;font-size:10px;font-family:monospace;white-space:nowrap;background:${RADIUS_COLOR};color:#fff;border:none;z-index:1;pointer-events:none;opacity:0;transition:opacity 0.15s;`;

        container.appendChild(handle);
        container.appendChild(label);

        // Hover
        handle.addEventListener('mouseenter', () => {
          label.style.opacity = '1';
          handle.style.transform = 'translate(-50%,-50%) scale(1.3)';
          handle.style.filter = 'brightness(1.5)';
        });
        handle.addEventListener('mouseleave', () => {
          if ((handle as any).dataset.dragging) return;
          label.style.opacity = '0';
          handle.style.transform = 'translate(-50%,-50%)';
          handle.style.filter = '';
        });

        document.documentElement.appendChild(container);
        radiusHandle.current = { container, handle, inner, label };
      }

      setupRadiusDrag(el, selector, initialValues);
      updateRadiusPosition(el, rect);
    }

    // ---- Position sync ----

    function syncPaddingPositions(positions: PaddingPosition[], rect: DOMRect) {
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
        const border = `1px dashed ${hexToRgba(PADDING_COLOR, 0.4)}`;
        if (pos.side === 'top') ls.borderBottom = border;
        else if (pos.side === 'bottom') ls.borderTop = border;
        else if (pos.side === 'left') ls.borderRight = border;
        else ls.borderLeft = border;

        const isH = pos.side === 'top' || pos.side === 'bottom';
        setDotGrip(ind.grip.style, PADDING_COLOR, !isH, isH ? pos.height : pos.width);
        ind.hitArea.style.cursor = isH ? 'ns-resize' : 'ew-resize';
        (ind.hitArea as any).dataset.side = pos.side;

        ind.label.textContent = pos.value;
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
      const gapValue = (cs.gap || cs.rowGap || '0px') === '0px' ? '0' : (cs.gap || cs.rowGap);
      const gapNum = parseFloat(gapValue) || 0;

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
          setupGapDrag(ind, el, selector, initialValues);
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
      if (rect.width < 50 || rect.height < 50) {
        radiusHandle.current.container.style.display = 'none';
        return;
      }
      const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
      const offset = Math.max(radius, 8);

      radiusHandle.current.container.style.display = 'block';
      radiusHandle.current.container.style.top = (rect.top + offset) + 'px';
      radiusHandle.current.container.style.left = (rect.left + offset) + 'px';
      radiusHandle.current.container.style.width = '1px';
      radiusHandle.current.container.style.height = '1px';

      radiusHandle.current.label.textContent = radius === 0 ? '0' : Math.round(radius) + 'px';
    }

    // ---- Drag setup for padding ----
    function setupPaddingDrag(
      ind: Indicator,
      el: Element,
      selector: string,
      _initValues: Record<string, string>,
    ) {
      let startX = 0;
      let startY = 0;
      let startVal = 0;
      let side = 'top';

      function onDown(e: PointerEvent) {
        e.stopPropagation();
        e.preventDefault();
        side = (ind.hitArea as any).dataset.side || 'top';
        const isV = side === 'top' || side === 'bottom';
        startX = e.clientX;
        startY = e.clientY;
        const cs = getComputedStyle(el);
        startVal = parseFloat(cs.getPropertyValue(`padding-${side}`)) || 0;

        // Record initial for change tracking
        const prop = `padding-${side}`;
        if (!(prop in _initValues)) {
          _initValues[prop] = cs.getPropertyValue(prop);
        }
        const oppProp = `padding-${OPPOSITE_SIDE[side]}`;
        if (!(oppProp in _initValues)) {
          _initValues[oppProp] = cs.getPropertyValue(oppProp);
        }

        startDrag(ind.hitArea, ind.line, ind.label, ind.grip, e, isV ? 'ns-resize' : 'ew-resize');

        // Highlight all padding indicators
        for (const sibling of paddingIndicators.current) {
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
        const isV = side === 'top' || side === 'bottom';
        const sign = side === 'bottom' || side === 'right' ? -1 : 1;
        const delta = isV ? (e.clientY - startY) : (e.clientX - startX);
        const val = Math.max(0, Math.round(startVal + delta * sign)) + 'px';
        const prop = `padding-${side}`;
        (el as HTMLElement).style.setProperty(prop, val);

        // Sync opposite side unless Shift is held
        if (!e.shiftKey) {
          const opp = `padding-${OPPOSITE_SIDE[side]}`;
          (el as HTMLElement).style.setProperty(opp, val);
        }

        ind.label.textContent = val;
      }

      function onUp(e: PointerEvent) {
        endDrag(ind.hitArea, ind.line, ind.label, ind.grip, e, onMove as any, onUp as any);

        // Reset sibling highlights
        for (const sibling of paddingIndicators.current) {
          if (sibling === ind) continue;
          sibling.line.style.opacity = '0';
          sibling.grip.style.transform = '';
          sibling.grip.style.filter = '';
        }

        // Queue edits for changed padding values
        if (selector) {
          const cs = getComputedStyle(el);
          const prop = `padding-${side}`;
          const newVal = cs.getPropertyValue(prop);
          const oldVal = _initValues[prop] || '0px';
          if (newVal !== oldVal) {
            useStore.getState().queueEdit({
              type: 'style',
              element: selector,
              name: prop,
              value: `${oldVal} \u2192 ${newVal}`,
            });
            _initValues[prop] = newVal;
          }

          const oppProp = `padding-${OPPOSITE_SIDE[side]}`;
          const newOppVal = cs.getPropertyValue(oppProp);
          const oldOppVal = _initValues[oppProp] || '0px';
          if (newOppVal !== oldOppVal) {
            useStore.getState().queueEdit({
              type: 'style',
              element: selector,
              name: oppProp,
              value: `${oldOppVal} \u2192 ${newOppVal}`,
            });
            _initValues[oppProp] = newOppVal;
          }
        }
      }

      ind.hitArea.addEventListener('pointerdown', onDown as EventListener);
    }

    // ---- Drag setup for gap ----
    function setupGapDrag(
      ind: Indicator,
      el: Element,
      selector: string,
      _initValues: Record<string, string>,
    ) {
      let startX = 0;
      let startY = 0;
      let startGap = 0;
      let isVertical = false;

      function onDown(e: PointerEvent) {
        e.stopPropagation();
        e.preventDefault();
        isVertical = (ind.hitArea as any).dataset.vertical === '1';
        startX = e.clientX;
        startY = e.clientY;
        startGap = parseFloat(getComputedStyle(el).gap) || 0;

        if (!('gap' in _initValues)) {
          _initValues['gap'] = getComputedStyle(el).gap || '0px';
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
        const delta = isVertical ? (e.clientX - startX) : (e.clientY - startY);
        const val = Math.max(0, Math.round(startGap + delta)) + 'px';
        (el as HTMLElement).style.gap = val;
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
        if (selector) {
          const newVal = (el as HTMLElement).style.gap || getComputedStyle(el).gap;
          const oldVal = _initValues['gap'] || '0px';
          if (newVal !== oldVal) {
            useStore.getState().queueEdit({
              type: 'style',
              element: selector,
              name: 'gap',
              value: `${oldVal} \u2192 ${newVal}`,
            });
            _initValues['gap'] = newVal;
          }
        }
      }

      ind.hitArea.addEventListener('pointerdown', onDown as EventListener);
    }

    // ---- Drag setup for border-radius ----
    function setupRadiusDrag(
      el: Element,
      selector: string,
      _initValues: Record<string, string>,
    ) {
      const rh = radiusHandle.current;
      if (!rh) return;

      if (!('border-radius' in _initValues)) {
        _initValues['border-radius'] = getComputedStyle(el).borderRadius || '0px';
      }

      function onDown(e: PointerEvent) {
        e.stopPropagation();
        e.preventDefault();

        rh!.handle.setPointerCapture(e.pointerId);
        (rh!.handle as any).dataset.dragging = '1';
        rh!.label.style.opacity = '1';
        rh!.handle.style.transform = 'translate(-50%,-50%) scale(1.3)';
        rh!.handle.style.filter = 'brightness(1.8)';
        document.documentElement.style.cursor = 'nwse-resize';
        document.documentElement.style.userSelect = 'none';

        rh!.handle.addEventListener('pointermove', onMove as EventListener);
        rh!.handle.addEventListener('pointerup', onUp as EventListener);
        rh!.handle.addEventListener('lostpointercapture', onUp as EventListener);
      }

      function onMove(e: PointerEvent) {
        const rect = el.getBoundingClientRect();
        const localX = e.clientX - rect.left;
        const localY = e.clientY - rect.top;

        if (localX < 0 || localX > rect.width || localY < 0 || localY > rect.height) return;

        const dist = Math.hypot(localX, localY);
        const maxR = Math.min(rect.width, rect.height) / 2;
        const val = Math.max(0, Math.min(maxR, Math.round(dist))) + 'px';
        (el as HTMLElement).style.borderRadius = val;
        rh!.label.textContent = val;
      }

      function onUp(e: PointerEvent) {
        rh!.handle.releasePointerCapture(e.pointerId);
        delete (rh!.handle as any).dataset.dragging;
        document.documentElement.style.cursor = '';
        document.documentElement.style.userSelect = '';
        rh!.handle.removeEventListener('pointermove', onMove as EventListener);
        rh!.handle.removeEventListener('pointerup', onUp as EventListener);
        rh!.handle.removeEventListener('lostpointercapture', onUp as EventListener);
        rh!.label.style.opacity = '0';
        rh!.handle.style.transform = 'translate(-50%,-50%)';
        rh!.handle.style.filter = '';

        // Queue edit
        if (selector) {
          const newVal = (el as HTMLElement).style.borderRadius || getComputedStyle(el).borderRadius;
          const oldVal = _initValues['border-radius'] || '0px';
          if (newVal !== oldVal) {
            useStore.getState().queueEdit({
              type: 'style',
              element: selector,
              name: 'border-radius',
              value: `${oldVal} \u2192 ${newVal}`,
            });
            _initValues['border-radius'] = newVal;
          }
        }
      }

      rh.handle.addEventListener('pointerdown', onDown as EventListener);
    }

    // ---- Hide all indicators ----
    function hideAll() {
      for (const ind of paddingIndicators.current) ind.container.style.display = 'none';
      for (const ind of gapIndicators.current) ind.container.style.display = 'none';
      if (radiusHandle.current) radiusHandle.current.container.style.display = 'none';
    }
  }, [selectedNodeId, isPickingElement, domTree]);

  // ---- Cleanup on unmount ----
  useEffect(() => {
    return () => {
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
