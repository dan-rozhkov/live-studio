import { useEffect } from 'preact/hooks';
import { getElementById } from '../bridge/dom-bridge';
import { useStore } from '../state/store';

const PANEL_TAG = 'live-studio-panel';
const BLOCKED_EVENTS = [
  'pointerdown',
  'mousedown',
  'pointerup',
  'mouseup',
  'click',
  'dblclick',
  'auxclick',
  'contextmenu',
] as const;
const PREVENT_DEFAULT_EVENTS = new Set<string>(['click', 'dblclick', 'auxclick', 'contextmenu']);

function isInsideStudioUi(el: Element): boolean {
  if (el.localName === PANEL_TAG) return true;
  if (el.closest?.(PANEL_TAG)) return true;
  if ((el as HTMLElement).dataset?.lsVisualControl) return true;
  if (el.closest?.('[data-ls-visual-control]')) return true;

  let node: Node | null = el;
  while (node) {
    if ((node as Element).localName === PANEL_TAG) return true;
    const root = node.getRootNode();
    if (root === document) break;
    node = (root as ShadowRoot).host ?? null;
  }
  return false;
}

function getEventElement(e: Event): Element | null {
  const target = e.target;
  if (target instanceof Element) return target;
  if (target instanceof Text) return target.parentElement;
  return null;
}

function isBlockedSelectedClick(e: Event, selectedEl: Element): boolean {
  const target = getEventElement(e);
  if (target && isInsideStudioUi(target)) return false;

  if (target && selectedEl.contains(target)) return true;
  if (!(e instanceof MouseEvent)) return false;

  const hit = document.elementFromPoint(e.clientX, e.clientY);
  return !!hit && selectedEl.contains(hit);
}

export function useSelectedClickGuard(): void {
  useEffect(() => {
    function guard(e: Event): void {
      const selectedId = useStore.getState().selectedNodeId;
      if (selectedId === null) return;

      const selectedEl = getElementById(selectedId);
      if (!selectedEl || !selectedEl.isConnected) return;
      if (!isBlockedSelectedClick(e, selectedEl)) return;

      if (PREVENT_DEFAULT_EVENTS.has(e.type)) {
        e.preventDefault();
      }
      e.stopImmediatePropagation();
    }

    for (const eventName of BLOCKED_EVENTS) {
      document.addEventListener(eventName, guard, true);
    }

    return () => {
      for (const eventName of BLOCKED_EVENTS) {
        document.removeEventListener(eventName, guard, true);
      }
    };
  }, []);
}
