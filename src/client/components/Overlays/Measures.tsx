import { useEffect, useRef, useState } from 'preact/hooks';
import { useStore } from '../../state/store';
import { getElementById, getElementAtPoint } from '../../bridge/dom-bridge';

const PANEL_TAG = 'live-studio-panel';

function isInsideStudioPanel(el: Element): boolean {
  if (el.localName === PANEL_TAG) return true;
  if (el.closest?.(PANEL_TAG)) return true;
  let node: Node | null = el;
  while (node) {
    if ((node as Element).localName === PANEL_TAG) return true;
    const root = node.getRootNode();
    if (root === document) break;
    node = (root as ShadowRoot).host ?? null;
  }
  return false;
}

const COLOR = '#F24822';
const Z = 2147483642;

interface Guide {
  line: HTMLDivElement;
  label: HTMLDivElement;
}

function createGuide(): Guide {
  const line = document.createElement('div');
  line.style.cssText =
    `position:fixed;pointer-events:none;z-index:${Z};box-sizing:border-box;display:none;`;
  document.documentElement.appendChild(line);

  const label = document.createElement('div');
  label.style.cssText =
    `position:fixed;pointer-events:none;z-index:${Z + 1};` +
    `background:${COLOR};color:white;font:500 10px/1 Inter,system-ui,sans-serif;` +
    `padding:2px 5px;border-radius:3px;white-space:nowrap;display:none;`;
  document.documentElement.appendChild(label);

  return { line, label };
}

function hideGuide(g: Guide) {
  g.line.style.display = 'none';
  g.label.style.display = 'none';
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function drawHorizontal(g: Guide, y: number, x1: number, x2: number, label?: string | null) {
  const left = Math.min(x1, x2);
  const width = Math.abs(x2 - x1);
  if (width < 1) { hideGuide(g); return; }

  Object.assign(g.line.style, {
    display: 'block',
    left: left + 'px',
    top: y + 'px',
    width: width + 'px',
    height: '0px',
    borderTop: `1px dashed ${COLOR}`,
    borderLeft: '',
  });

  if (label === null) { g.label.style.display = 'none'; return; }
  g.label.textContent = label ?? String(Math.round(width));
  g.label.style.display = 'block';
  const lw = g.label.offsetWidth;
  const lh = g.label.offsetHeight;
  g.label.style.left = clamp(left + width / 2 - lw / 2, 2, window.innerWidth - lw - 2) + 'px';
  g.label.style.top = clamp(y - lh - 3, 2, window.innerHeight - lh - 2) + 'px';
}

function drawVertical(g: Guide, x: number, y1: number, y2: number, label?: string | null) {
  const top = Math.min(y1, y2);
  const height = Math.abs(y2 - y1);
  if (height < 1) { hideGuide(g); return; }

  Object.assign(g.line.style, {
    display: 'block',
    left: x + 'px',
    top: top + 'px',
    width: '0px',
    height: height + 'px',
    borderLeft: `1px dashed ${COLOR}`,
    borderTop: '',
  });

  if (label === null) { g.label.style.display = 'none'; return; }
  g.label.textContent = label ?? String(Math.round(height));
  g.label.style.display = 'block';
  const lw = g.label.offsetWidth;
  const lh = g.label.offsetHeight;
  g.label.style.left = clamp(x + 3, 2, window.innerWidth - lw - 2) + 'px';
  g.label.style.top = clamp(top + height / 2 - lh / 2, 2, window.innerHeight - lh - 2) + 'px';
}

function contains(outer: DOMRect, inner: DOMRect): boolean {
  return (
    inner.left >= outer.left &&
    inner.right <= outer.right &&
    inner.top >= outer.top &&
    inner.bottom <= outer.bottom
  );
}

export function Measures() {
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const [altHeld, setAltHeld] = useState(false);

  const guidesRef = useRef<Guide[]>([]);
  const rafRef = useRef<number>(0);
  const targetRef = useRef<Element | null>(null);
  const outlineRef = useRef<HTMLDivElement | null>(null);

  // Alt tracking
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey) setAltHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!e.altKey) setAltHeld(false);
    };
    const onBlur = () => setAltHeld(false);
    const onVis = () => { if (document.hidden) setAltHeld(false); };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // Main rAF: render guides while active
  useEffect(() => {
    const getGuide = (i: number): Guide => {
      while (guidesRef.current.length <= i) guidesRef.current.push(createGuide());
      return guidesRef.current[i];
    };
    const hideFrom = (i: number) => {
      for (let k = i; k < guidesRef.current.length; k++) hideGuide(guidesRef.current[k]);
    };

    const stop = () => {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
      hideFrom(0);
      if (outlineRef.current) outlineRef.current.style.display = 'none';
      targetRef.current = null;
    };

    if (!altHeld || selectedNodeId === null) { stop(); return; }

    const anchor = getElementById(selectedNodeId);
    if (!anchor || !anchor.isConnected) { stop(); return; }

    const onMouseMove = (e: MouseEvent) => {
      const el = getElementAtPoint(e.clientX, e.clientY);
      if (!el || isInsideStudioPanel(el) || el === anchor) {
        targetRef.current = null;
        return;
      }
      targetRef.current = el;
    };
    document.addEventListener('mousemove', onMouseMove, true);

    let prevKey = '';

    const tick = () => {
      if (!anchor.isConnected) { stop(); return; }

      const target = targetRef.current;
      if (!target || !target.isConnected) {
        if (prevKey !== '') {
          hideFrom(0);
          if (outlineRef.current) outlineRef.current.style.display = 'none';
          prevKey = '';
        }
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const A = anchor.getBoundingClientRect();
      const T = target.getBoundingClientRect();

      const key = `${A.left},${A.top},${A.width},${A.height}|${T.left},${T.top},${T.width},${T.height}|${window.innerWidth}x${window.innerHeight}`;
      if (key === prevKey) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      prevKey = key;

      if (!outlineRef.current) {
        const div = document.createElement('div');
        div.style.cssText =
          `position:fixed;pointer-events:none;z-index:${Z};` +
          `border:1.5px solid ${COLOR};box-sizing:border-box;`;
        document.documentElement.appendChild(div);
        outlineRef.current = div;
      }
      Object.assign(outlineRef.current.style, {
        display: 'block',
        left: T.left + 'px',
        top: T.top + 'px',
        width: T.width + 'px',
        height: T.height + 'px',
      });

      let i = 0;

      if (contains(A, T)) {
        // 4 gaps: target edges → anchor edges
        const midX = (T.left + T.right) / 2;
        const midY = (T.top + T.bottom) / 2;
        if (T.top - A.top > 0) drawVertical(getGuide(i++), midX, A.top, T.top);
        if (A.bottom - T.bottom > 0) drawVertical(getGuide(i++), midX, T.bottom, A.bottom);
        if (T.left - A.left > 0) drawHorizontal(getGuide(i++), midY, A.left, T.left);
        if (A.right - T.right > 0) drawHorizontal(getGuide(i++), midY, T.right, A.right);
      } else if (contains(T, A)) {
        const midX = (A.left + A.right) / 2;
        const midY = (A.top + A.bottom) / 2;
        if (A.top - T.top > 0) drawVertical(getGuide(i++), midX, T.top, A.top);
        if (T.bottom - A.bottom > 0) drawVertical(getGuide(i++), midX, A.bottom, T.bottom);
        if (A.left - T.left > 0) drawHorizontal(getGuide(i++), midY, T.left, A.left);
        if (T.right - A.right > 0) drawHorizontal(getGuide(i++), midY, A.right, T.right);
      } else {
        // Disjoint: up to one horizontal + one vertical gap, with leader lines
        // from the measurement line perpendicular to each element when the
        // line falls outside that element's span.
        const overlapX = Math.min(A.right, T.right) - Math.max(A.left, T.left);
        const overlapY = Math.min(A.bottom, T.bottom) - Math.max(A.top, T.top);

        // Horizontal gap (X direction)
        if (overlapX < 0) {
          const y =
            overlapY > 0
              ? (Math.max(A.top, T.top) + Math.min(A.bottom, T.bottom)) / 2
              : ((A.top + A.bottom) / 2 + (T.top + T.bottom) / 2) / 2;
          const x1 = T.left > A.right ? A.right : A.left;
          const x2 = T.left > A.right ? T.left : T.right;
          drawHorizontal(getGuide(i++), y, x1, x2);
          // Leaders to anchor / target edges when y is outside their Y-span
          if (y < A.top) drawVertical(getGuide(i++), x1, y, A.top, null);
          else if (y > A.bottom) drawVertical(getGuide(i++), x1, A.bottom, y, null);
          if (y < T.top) drawVertical(getGuide(i++), x2, y, T.top, null);
          else if (y > T.bottom) drawVertical(getGuide(i++), x2, T.bottom, y, null);
        }

        // Vertical gap (Y direction)
        if (overlapY < 0) {
          const x =
            overlapX > 0
              ? (Math.max(A.left, T.left) + Math.min(A.right, T.right)) / 2
              : ((A.left + A.right) / 2 + (T.left + T.right) / 2) / 2;
          const y1 = T.top > A.bottom ? A.bottom : A.top;
          const y2 = T.top > A.bottom ? T.top : T.bottom;
          drawVertical(getGuide(i++), x, y1, y2);
          if (x < A.left) drawHorizontal(getGuide(i++), y1, x, A.left, null);
          else if (x > A.right) drawHorizontal(getGuide(i++), y1, A.right, x, null);
          if (x < T.left) drawHorizontal(getGuide(i++), y2, x, T.left, null);
          else if (x > T.right) drawHorizontal(getGuide(i++), y2, T.right, x, null);
        }
      }

      hideFrom(i);
      rafRef.current = requestAnimationFrame(tick);
    };

    tick();
    return () => {
      document.removeEventListener('mousemove', onMouseMove, true);
      stop();
    };
  }, [altHeld, selectedNodeId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      for (const g of guidesRef.current) {
        g.line.remove();
        g.label.remove();
      }
      guidesRef.current = [];
      outlineRef.current?.remove();
      outlineRef.current = null;
    };
  }, []);

  return null;
}
