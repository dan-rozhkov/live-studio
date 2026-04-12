// ---------------------------------------------------------------------------
// Overlays — hover highlight, selection border, layout box, multi-select
// ---------------------------------------------------------------------------
// Figma-style overlays rendered on `document.documentElement` (outside the
// shadow DOM) so they appear above the user's page content.
//
//   1. Hover: light blue tint + blue border
//   2. Select: blue border + element label + size badge
//   3. Layout box: dashed border for transformed elements
//   4. Multi-select: dashed blue borders on secondary selections
// ---------------------------------------------------------------------------

import { useEffect, useRef } from 'preact/hooks';
import { useStore } from '../../state/store';
import { getElementById } from '../../bridge/dom-bridge';

// ---------------------------------------------------------------------------
// Figma-style color palette
// ---------------------------------------------------------------------------

const FIGMA_BLUE = '#0D99FF';
const FIGMA_BLUE_LIGHT = 'rgba(13, 153, 255, 0.08)';
const FIGMA_PURPLE = '#9747FF';

// Diagonal hatching patterns
const HATCH_MARGIN = `repeating-linear-gradient(-45deg,rgba(13,153,255,0.35),rgba(13,153,255,0.35) 1px,transparent 1px,transparent 5px)`;
const HATCH_PADDING = `repeating-linear-gradient(-45deg,rgba(255,105,180,0.4),rgba(255,105,180,0.4) 1px,transparent 1px,transparent 5px)`;
const HATCH_GAP = `repeating-linear-gradient(-45deg,rgba(151,71,255,0.4),rgba(151,71,255,0.4) 1px,transparent 1px,transparent 5px)`;

// Box-model hatched areas: 4 divs for T/R/B/L
interface BoxHatch { top: HTMLDivElement; right: HTMLDivElement; bottom: HTMLDivElement; left: HTMLDivElement }

function createHatchSet(hatch: string): BoxHatch {
  const make = () => {
    const d = document.createElement('div');
    d.style.cssText =
      `position:fixed;pointer-events:none;z-index:2147483637;box-sizing:border-box;background:${hatch};display:none;`;
    document.documentElement.appendChild(d);
    return d;
  };
  return { top: make(), right: make(), bottom: make(), left: make() };
}

function positionHatch(
  s: BoxHatch,
  x: number, y: number, w: number, h: number,
  vt: number, vr: number, vb: number, vl: number,
) {
  if (vt > 0) {
    Object.assign(s.top.style, { display: 'block', left: x + 'px', top: y + 'px', width: w + 'px', height: vt + 'px' });
  } else { s.top.style.display = 'none'; }
  if (vb > 0) {
    Object.assign(s.bottom.style, { display: 'block', left: x + 'px', top: (y + h - vb) + 'px', width: w + 'px', height: vb + 'px' });
  } else { s.bottom.style.display = 'none'; }
  if (vl > 0) {
    Object.assign(s.left.style, { display: 'block', left: x + 'px', top: (y + vt) + 'px', width: vl + 'px', height: (h - vt - vb) + 'px' });
  } else { s.left.style.display = 'none'; }
  if (vr > 0) {
    Object.assign(s.right.style, { display: 'block', left: (x + w - vr) + 'px', top: (y + vt) + 'px', width: vr + 'px', height: (h - vt - vb) + 'px' });
  } else { s.right.style.display = 'none'; }
}

function hideHatch(s: BoxHatch | null) {
  if (!s) return;
  s.top.style.display = s.right.style.display = s.bottom.style.display = s.left.style.display = 'none';
}

function removeHatch(s: BoxHatch | null) {
  if (!s) return;
  s.top.remove(); s.right.remove(); s.bottom.remove(); s.left.remove();
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

interface Quad {
  hasTransform: boolean;
  width: number;
  height: number;
  untransformedX: number;
  untransformedY: number;
  cssTransform: string;
  scaleX: number;
  scaleY: number;
}

/** Check whether any ancestor (or the element itself) has a CSS transform. */
function hasAnyTransform(el: Element): boolean {
  let cur: Element | null = el;
  while (cur && cur !== document.documentElement) {
    const cs = getComputedStyle(cur);
    if (cs.transform && cs.transform !== 'none') return true;
    cur = cur.parentElement;
  }
  return false;
}

/**
 * Compute the cumulative transform matrix from an element's local coordinate
 * space to viewport space, by walking up through all transformed ancestors.
 */
function getLocalToViewportMatrix(el: Element): DOMMatrix {
  const chain: Element[] = [];
  let cur: Element | null = el;
  while (cur && cur !== document.documentElement) {
    chain.push(cur);
    cur = cur.parentElement;
  }

  let matrix = new DOMMatrix();
  for (let i = chain.length - 1; i >= 0; i--) {
    const node = chain[i];
    const cs = getComputedStyle(node);
    if (cs.transform && cs.transform !== 'none') {
      const r = node.getBoundingClientRect();
      const ox = cs.transformOrigin.split(' ').map(parseFloat);
      const originX = (ox[0] ?? 0);
      const originY = (ox[1] ?? 0);

      matrix = matrix
        .translateSelf(r.left + originX, r.top + originY)
        .multiplySelf(new DOMMatrix(cs.transform))
        .translateSelf(-originX, -originY);
    } else {
      const r = node.getBoundingClientRect();
      void r;
    }
  }
  return matrix;
}

/** Get the viewport position of the element if it had no transform. */
function getUntransformedViewportPosition(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  if (!cs.transform || cs.transform === 'none') {
    return { x: r.left, y: r.top };
  }
  if (el instanceof HTMLElement) {
    let x = 0, y = 0;
    let cur: HTMLElement | null = el;
    while (cur) {
      x += cur.offsetLeft - cur.scrollLeft;
      y += cur.offsetTop - cur.scrollTop;
      cur = cur.offsetParent as HTMLElement | null;
    }
    x -= window.scrollX;
    y -= window.scrollY;
    return { x, y };
  }
  return { x: r.left, y: r.top };
}

function getElementQuad(el: Element): Quad {
  const w = (el as HTMLElement).offsetWidth || el.getBoundingClientRect().width;
  const h = (el as HTMLElement).offsetHeight || el.getBoundingClientRect().height;

  if (!hasAnyTransform(el)) {
    const r = el.getBoundingClientRect();
    return {
      hasTransform: false,
      width: w, height: h,
      untransformedX: r.left, untransformedY: r.top,
      cssTransform: 'none', scaleX: 1, scaleY: 1,
    };
  }

  const matrix = getLocalToViewportMatrix(el);
  const untransformed = getUntransformedViewportPosition(el);

  const overlayMatrix = new DOMMatrix()
    .translateSelf(-untransformed.x, -untransformed.y)
    .multiplySelf(matrix);
  const cssTransform = `matrix(${overlayMatrix.a},${overlayMatrix.b},${overlayMatrix.c},${overlayMatrix.d},${overlayMatrix.e},${overlayMatrix.f})`;

  return {
    hasTransform: true,
    width: w, height: h,
    untransformedX: untransformed.x, untransformedY: untransformed.y,
    cssTransform,
    scaleX: Math.sqrt(matrix.a * matrix.a + matrix.b * matrix.b),
    scaleY: Math.sqrt(matrix.c * matrix.c + matrix.d * matrix.d),
  };
}

// ---------------------------------------------------------------------------
// Helper: apply quad to an overlay HTMLElement
// ---------------------------------------------------------------------------

function applyQuad(
  el: HTMLElement,
  quad: Quad,
  opts?: { dashedBorder?: boolean },
): void {
  el.style.display = 'block';
  el.style.top = quad.untransformedY + 'px';
  el.style.left = quad.untransformedX + 'px';
  el.style.width = quad.width + 'px';
  el.style.height = quad.height + 'px';

  if (quad.hasTransform) {
    const avgScale = (quad.scaleX + quad.scaleY) / 2;
    el.style.transform = quad.cssTransform;
    el.style.transformOrigin = '0 0';
    el.style.borderWidth = (opts?.dashedBorder ? 1 : 1) / avgScale + 'px';
  } else {
    el.style.transform = '';
    el.style.transformOrigin = '';
    el.style.borderWidth = '1px';
  }
}

// ---------------------------------------------------------------------------
// Overlays component
// ---------------------------------------------------------------------------

export function Overlays() {
  const hoveredNodeId = useStore((s) => s.hoveredNodeId);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const selectedNodeIds = useStore((s) => s.selectedNodeIds);

  const hoverRef = useRef<HTMLDivElement | null>(null);
  const selectRef = useRef<HTMLDivElement | null>(null);
  const layoutBoxRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLDivElement | null>(null);
  const sizeRef = useRef<HTMLDivElement | null>(null);
  const paddingHatchRef = useRef<BoxHatch | null>(null);
  const marginHatchRef = useRef<BoxHatch | null>(null);
  const gapHatchRef = useRef<HTMLDivElement[]>([]);
  const selectRafRef = useRef<number>(0);
  const multiSelectEls = useRef<Map<number, HTMLDivElement>>(new Map());
  const multiSelectRaf = useRef<number>(0);

  // ---- Hover overlay -------------------------------------------------------
  useEffect(() => {
    if (hoveredNodeId === null) {
      if (hoverRef.current) hoverRef.current.style.display = 'none';
      return;
    }

    const el = getElementById(hoveredNodeId);
    if (!el || !el.isConnected) {
      if (hoverRef.current) hoverRef.current.style.display = 'none';
      return;
    }

    if (!hoverRef.current) {
      const div = document.createElement('div');
      div.style.cssText =
        `position:fixed;pointer-events:none;z-index:2147483640;` +
        `background:${FIGMA_BLUE_LIGHT};border:1px solid ${FIGMA_BLUE};` +
        `transition:top 0.05s,left 0.05s,width 0.05s,height 0.05s;box-sizing:border-box;`;
      document.documentElement.appendChild(div);
      hoverRef.current = div;
    }

    const quad = getElementQuad(el);
    applyQuad(hoverRef.current, quad);
  }, [hoveredNodeId]);

  // ---- Selection overlay (rAF loop) ----------------------------------------
  useEffect(() => {
    if (selectRafRef.current) {
      cancelAnimationFrame(selectRafRef.current);
      selectRafRef.current = 0;
    }

    const hideAll = () => {
      if (selectRef.current) selectRef.current.style.display = 'none';
      if (layoutBoxRef.current) layoutBoxRef.current.style.display = 'none';
      if (labelRef.current) labelRef.current.style.display = 'none';
      if (sizeRef.current) sizeRef.current.style.display = 'none';
      hideHatch(paddingHatchRef.current);
      hideHatch(marginHatchRef.current);
      for (const g of gapHatchRef.current) g.style.display = 'none';
    };

    if (selectedNodeId === null) { hideAll(); return; }

    const el = getElementById(selectedNodeId);
    if (!el) { hideAll(); return; }

    // Create select overlay
    if (!selectRef.current) {
      const div = document.createElement('div');
      div.style.cssText =
        `position:fixed;pointer-events:none;z-index:2147483639;` +
        `border:1.5px solid ${FIGMA_BLUE};box-sizing:border-box;`;
      document.documentElement.appendChild(div);
      selectRef.current = div;
    }

    // Element label (above top-left)
    if (!labelRef.current) {
      const lbl = document.createElement('div');
      lbl.style.cssText =
        `position:fixed;pointer-events:none;z-index:2147483641;` +
        `color:${FIGMA_BLUE};font:500 11px/1 Inter,system-ui,sans-serif;` +
        `white-space:nowrap;padding:2px 0;`;
      document.documentElement.appendChild(lbl);
      labelRef.current = lbl;
    }

    // Hatch sets
    if (!paddingHatchRef.current) paddingHatchRef.current = createHatchSet(HATCH_PADDING);
    if (!marginHatchRef.current) marginHatchRef.current = createHatchSet(HATCH_MARGIN);

    // Size badge (bottom center)
    if (!sizeRef.current) {
      const sz = document.createElement('div');
      sz.style.cssText =
        `position:fixed;pointer-events:none;z-index:2147483641;` +
        `background:${FIGMA_BLUE};color:white;font:500 10px/1 Inter,system-ui,sans-serif;` +
        `padding:3px 6px;border-radius:3px;white-space:nowrap;`;
      document.documentElement.appendChild(sz);
      sizeRef.current = sz;
    }

    let prevKey = '';

    function tick() {
      if (!el!.isConnected) { hideAll(); return; }

      const quad = getElementQuad(el!);
      const cs = getComputedStyle(el!);

      // Include box-model values in key so hatching updates when padding/margin/gap change
      const pt = parseFloat(cs.paddingTop) || 0;
      const pr = parseFloat(cs.paddingRight) || 0;
      const pb = parseFloat(cs.paddingBottom) || 0;
      const pl = parseFloat(cs.paddingLeft) || 0;
      const mt = parseFloat(cs.marginTop) || 0;
      const mr = parseFloat(cs.marginRight) || 0;
      const mb = parseFloat(cs.marginBottom) || 0;
      const ml = parseFloat(cs.marginLeft) || 0;
      const gap = cs.gap || cs.rowGap || '0';

      const key = `${quad.untransformedX},${quad.untransformedY},${quad.width},${quad.height},${quad.cssTransform},${Math.round(pt)},${Math.round(pr)},${Math.round(pb)},${Math.round(pl)},${Math.round(mt)},${Math.round(mr)},${Math.round(mb)},${Math.round(ml)},${gap}`;

      if (key !== prevKey) {
        prevKey = key;
        applyQuad(selectRef.current!, quad);

        const x = quad.untransformedX;
        const y = quad.untransformedY;
        const w = quad.width;
        const h = quad.height;

        // Element label
        const tag = el!.tagName.toLowerCase();
        const id = (el! as HTMLElement).id;
        const cls = (el! as HTMLElement).className;
        let labelText = tag;
        if (id) labelText += `#${id}`;
        else if (typeof cls === 'string' && cls.trim()) {
          const first = cls.trim().split(/\s+/)[0];
          labelText += `.${first}`;
        }
        labelRef.current!.textContent = labelText;
        labelRef.current!.style.display = 'block';
        labelRef.current!.style.left = x + 'px';
        labelRef.current!.style.top = (y - 18) + 'px';

        // Size badge
        const rw = parseFloat(cs.width) || w;
        const rh = parseFloat(cs.height) || h;
        sizeRef.current!.textContent = `${Math.round(rw)} × ${Math.round(rh)}`;
        sizeRef.current!.style.display = 'block';
        const szWidth = sizeRef.current!.offsetWidth;
        sizeRef.current!.style.left = (x + w / 2 - szWidth / 2) + 'px';
        sizeRef.current!.style.top = (y + h + 4) + 'px';

        // Padding hatching (pink)
        positionHatch(paddingHatchRef.current!, x, y, w, h, pt, pr, pb, pl);

        // Margin hatching (blue)
        positionHatch(marginHatchRef.current!, x - ml, y - mt, w + ml + mr, h + mt + mb, mt, mr, mb, ml);

        // Gap hatching (purple)
        const display = cs.display;
        const isFlex = display === 'flex' || display === 'inline-flex';
        const isGrid = display === 'grid' || display === 'inline-grid';
        for (const g of gapHatchRef.current) g.style.display = 'none';

        if ((isFlex || isGrid) && el instanceof HTMLElement) {
          const gapV = parseFloat(cs.gap) || parseFloat(cs.rowGap) || 0;
          const colGap = parseFloat(cs.columnGap) || gapV;
          const rowGap = parseFloat(cs.rowGap) || gapV;

          if (gapV > 0 || colGap > 0 || rowGap > 0) {
            const children = Array.from(el.children).filter(
              (c) => { const s = getComputedStyle(c); return s.position !== 'absolute' && s.display !== 'none'; }
            );
            let gapIdx = 0;
            for (let ci = 1; ci < children.length; ci++) {
              const prevRect = children[ci - 1].getBoundingClientRect();
              const curRect = children[ci].getBoundingClientRect();
              let gx: number, gy: number, gw: number, gh: number;
              const isHoriz = Math.abs(prevRect.top - curRect.top) < 2;
              if (isHoriz && colGap > 0) {
                gx = prevRect.right; gy = Math.min(prevRect.top, curRect.top);
                gw = curRect.left - prevRect.right; gh = Math.max(prevRect.bottom, curRect.bottom) - gy;
                if (gw < 1) continue;
              } else if (!isHoriz && rowGap > 0) {
                gx = Math.min(prevRect.left, curRect.left); gy = prevRect.bottom;
                gw = Math.max(prevRect.right, curRect.right) - gx; gh = curRect.top - prevRect.bottom;
                if (gh < 1) continue;
              } else { continue; }

              if (gapIdx >= gapHatchRef.current.length) {
                const gd = document.createElement('div');
                gd.style.cssText = `position:fixed;pointer-events:none;z-index:2147483637;box-sizing:border-box;background:${HATCH_GAP};`;
                document.documentElement.appendChild(gd);
                gapHatchRef.current.push(gd);
              }
              const gd = gapHatchRef.current[gapIdx++];
              Object.assign(gd.style, { display: 'block', left: gx + 'px', top: gy + 'px', width: gw + 'px', height: gh + 'px' });
            }
          }
        }

        // Layout box for transformed elements
        if (quad.hasTransform) {
          const selfTransformed = cs.transform && cs.transform !== 'none';
          if (selfTransformed) {
            if (!layoutBoxRef.current) {
              const lb = document.createElement('div');
              lb.style.cssText =
                `position:fixed;pointer-events:none;z-index:2147483638;` +
                `border:1px dashed ${FIGMA_PURPLE};background:none;box-sizing:border-box;`;
              document.documentElement.appendChild(lb);
              layoutBoxRef.current = lb;
            }
            const lb = layoutBoxRef.current;
            lb.style.display = 'block';
            lb.style.top = y + 'px';
            lb.style.left = x + 'px';
            lb.style.width = w + 'px';
            lb.style.height = h + 'px';
            lb.style.transform = '';
            lb.style.transformOrigin = '';
          } else if (layoutBoxRef.current) {
            layoutBoxRef.current.style.display = 'none';
          }
        } else if (layoutBoxRef.current) {
          layoutBoxRef.current.style.display = 'none';
        }
      }

      selectRafRef.current = requestAnimationFrame(tick);
    }

    tick();

    return () => {
      if (selectRafRef.current) {
        cancelAnimationFrame(selectRafRef.current);
        selectRafRef.current = 0;
      }
    };
  }, [selectedNodeId]);

  // ---- Multi-select overlays -----------------------------------------------
  useEffect(() => {
    if (multiSelectRaf.current) {
      cancelAnimationFrame(multiSelectRaf.current);
      multiSelectRaf.current = 0;
    }

    const primaryId = selectedNodeId;
    const secondaryIds = new Set(
      selectedNodeIds.filter((id) => id !== primaryId),
    );

    for (const [id, div] of multiSelectEls.current) {
      if (!secondaryIds.has(id)) {
        div.remove();
        multiSelectEls.current.delete(id);
      }
    }

    for (const id of secondaryIds) {
      if (!multiSelectEls.current.has(id)) {
        const div = document.createElement('div');
        div.style.cssText =
          `position:fixed;pointer-events:none;z-index:2147483638;` +
          `border:1px dashed ${FIGMA_BLUE};background:${FIGMA_BLUE_LIGHT};box-sizing:border-box;`;
        document.documentElement.appendChild(div);
        multiSelectEls.current.set(id, div);
      }
    }

    if (multiSelectEls.current.size === 0) return;

    const prevKeys = new Map<number, string>();

    function tickMulti() {
      for (const [id, div] of multiSelectEls.current) {
        const el = getElementById(id);
        if (!el || !el.isConnected) {
          div.remove();
          multiSelectEls.current.delete(id);
          prevKeys.delete(id);
          continue;
        }

        const quad = getElementQuad(el);
        const key = `${quad.untransformedX},${quad.untransformedY},${quad.width},${quad.height},${quad.cssTransform}`;
        if (key === prevKeys.get(id)) continue;
        prevKeys.set(id, key);

        applyQuad(div, quad, { dashedBorder: true });
      }

      if (multiSelectEls.current.size > 0) {
        multiSelectRaf.current = requestAnimationFrame(tickMulti);
      } else {
        multiSelectRaf.current = 0;
      }
    }

    tickMulti();

    return () => {
      if (multiSelectRaf.current) {
        cancelAnimationFrame(multiSelectRaf.current);
        multiSelectRaf.current = 0;
      }
    };
  }, [selectedNodeIds, selectedNodeId]);

  // ---- Cleanup on unmount ---------------------------------------------------
  useEffect(() => {
    return () => {
      hoverRef.current?.remove();
      selectRef.current?.remove();
      layoutBoxRef.current?.remove();
      labelRef.current?.remove();
      sizeRef.current?.remove();
      removeHatch(paddingHatchRef.current);
      removeHatch(marginHatchRef.current);
      for (const g of gapHatchRef.current) g.remove();
      gapHatchRef.current = [];
      for (const div of multiSelectEls.current.values()) {
        div.remove();
      }
      multiSelectEls.current.clear();
      if (selectRafRef.current) cancelAnimationFrame(selectRafRef.current);
      if (multiSelectRaf.current) cancelAnimationFrame(multiSelectRaf.current);
    };
  }, []);

  return null;
}
