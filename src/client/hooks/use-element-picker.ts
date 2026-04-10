// ---------------------------------------------------------------------------
// use-element-picker — Preact hook for visual element picking
// ---------------------------------------------------------------------------
// Activated when `isPickingElement` is true in the store.
// - mousemove: highlights element under cursor via hoveredNodeId
// - click: selects element (assignId + selectNode), deactivates picker
// - Escape: cancels picker
// - Skips elements inside the live-studio shadow DOM
// ---------------------------------------------------------------------------

import { useCallback, useEffect } from 'preact/hooks';
import { useStore } from '../state/store';
import { getElementAtPoint, assignId } from '../bridge/dom-bridge';

const PANEL_TAG = 'live-studio-panel';

/** True when `el` lives inside the live-studio shadow DOM. */
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

/**
 * Element picker hook.
 *
 * @param onElementPicked  - called with the picked element's numeric id
 * @param onMarqueePicked  - optional, called with ids from marquee selection
 * @returns `{ isPickingElement, togglePicker }`
 */
export function useElementPicker(
  onElementPicked: (id: number) => void,
  onMarqueePicked?: (ids: number[]) => void,
) {
  const isPickingElement = useStore((s) => s.isPickingElement);
  const setPickingElement = useStore((s) => s.setPickingElement);
  const setHoveredNodeId = useStore((s) => s.setHoveredNodeId);

  const togglePicker = useCallback(() => {
    if (isPickingElement) {
      setHoveredNodeId(null);
      setPickingElement(false);
    } else {
      setPickingElement(true);
    }
  }, [isPickingElement, setPickingElement, setHoveredNodeId]);

  // ---- main picker logic (listeners while active) -------------------------
  useEffect(() => {
    if (!isPickingElement) return;

    // Set crosshair cursor while picking
    document.documentElement.style.setProperty('cursor', 'crosshair', 'important');

    function onMouseMove(e: MouseEvent) {
      const el = getElementAtPoint(e.clientX, e.clientY);
      if (!el || isInsideStudioPanel(el)) {
        setHoveredNodeId(null);
        return;
      }
      const id = assignId(el);
      setHoveredNodeId(id);
    }

    function suppress(e: Event) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }

    function onClick(e: MouseEvent) {
      e.preventDefault();
      e.stopImmediatePropagation();

      const el = getElementAtPoint(e.clientX, e.clientY);
      if (!el || isInsideStudioPanel(el)) return;

      const id = assignId(el);
      setHoveredNodeId(null);
      setPickingElement(false);
      onElementPicked(id);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        setHoveredNodeId(null);
        setPickingElement(false);
      }
    }

    // Use capture phase so we intercept before page handlers
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('mousedown', suppress, true);
    document.addEventListener('mouseup', suppress, true);
    document.addEventListener('pointerdown', suppress, true);
    document.addEventListener('pointerup', suppress, true);
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.documentElement.style.cursor = '';
      document.removeEventListener('mousemove', onMouseMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('mousedown', suppress, true);
      document.removeEventListener('mouseup', suppress, true);
      document.removeEventListener('pointerdown', suppress, true);
      document.removeEventListener('pointerup', suppress, true);
      document.removeEventListener('keydown', onKeyDown, true);
      setHoveredNodeId(null);
    };
  }, [isPickingElement, onElementPicked, onMarqueePicked, setPickingElement, setHoveredNodeId]);

  // ---- Alt+C keyboard shortcut to toggle picker ----------------------------
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.altKey && e.code === 'KeyC' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        togglePicker();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [togglePicker]);

  return { isPickingElement, togglePicker };
}
