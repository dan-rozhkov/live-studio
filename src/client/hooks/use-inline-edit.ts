// ---------------------------------------------------------------------------
// use-inline-edit — Preact hook for inline text editing via contentEditable
// ---------------------------------------------------------------------------
// Double-click on a selected element with text content makes it editable.
// - Enter or blur → commit text change to edit-slice
// - Escape → cancel and restore original text
// - Picker interaction is suppressed while editing
// - A blue outline indicates edit mode
// ---------------------------------------------------------------------------

import { useEffect, useRef } from 'preact/hooks';
import { useStore } from '../state/store';
import { getElementById, assignId, getElementAtPoint } from '../bridge/dom-bridge';

const PANEL_TAG = 'live-studio-panel';

/** True when `el` lives inside the live-studio shadow DOM. */
function isInsidePanel(el: Element): boolean {
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

/** Collect direct text nodes of an element. */
function getTextNodes(el: Element): Text[] {
  const result: Text[] = [];
  for (let i = 0; i < el.childNodes.length; i++) {
    if (el.childNodes[i].nodeType === Node.TEXT_NODE) {
      result.push(el.childNodes[i] as Text);
    }
  }
  return result;
}

/** True when the element contains at least one non-empty direct text node. */
function hasTextContent(el: Element): boolean {
  for (let i = 0; i < el.childNodes.length; i++) {
    if (
      el.childNodes[i].nodeType === Node.TEXT_NODE &&
      el.childNodes[i].textContent?.trim()
    ) {
      return true;
    }
  }
  return false;
}

/** Read concatenated text from direct text nodes. */
function readText(el: Element): string {
  return getTextNodes(el)
    .map((n) => n.textContent)
    .join('');
}

export interface InlineEditResult {
  id: number;
  oldText: string;
  newText: string;
}

/**
 * Inline text editing hook.
 *
 * Registers document-level listeners for double-click to start editing and
 * click to select (when not picking). Deactivates when the element picker or
 * multi-select is active.
 *
 * @param onEditComplete    - called when the user commits a text edit
 * @param onElementSelected - called when the user clicks an element (single-click select)
 */
export function useInlineEdit(
  onEditComplete: (id: number, oldText: string, newText: string) => void,
  onElementSelected: (id: number) => void,
): void {
  const isPickingElement = useStore((s) => s.isPickingElement);
  const isMultiSelect = useStore((s) => s.selectedNodeIds.length > 1);

  // Keep callbacks in a ref so the effect doesn't re-run when they change
  const callbacksRef = useRef({ onEditComplete, onElementSelected });
  callbacksRef.current = { onEditComplete, onElementSelected };

  useEffect(() => {
    if (isPickingElement || isMultiSelect) return;

    let inlineEditActive = false;
    let pendingCommit: (() => void) | null = null;

    function beginEdit(el: Element): void {
      // Commit any previous pending edit first
      if (pendingCommit) pendingCommit();

      inlineEditActive = true;
      const id = assignId(el);
      callbacksRef.current.onElementSelected(id);

      // Save original text nodes for cancel
      const savedNodes = getTextNodes(el).map((n) => ({
        node: n,
        text: n.textContent,
      }));
      const originalText = readText(el);

      const htmlEl = el as HTMLElement;
      htmlEl.contentEditable = 'true';
      htmlEl.style.outline = '2px solid rgba(111,168,220,0.7)';
      htmlEl.focus();

      // Select all text
      const sel = window.getSelection();
      const range = document.createRange();
      const textNodes = getTextNodes(el);
      if (textNodes.length > 0) {
        range.setStart(textNodes[0], 0);
        range.setEnd(textNodes[textNodes.length - 1], textNodes[textNodes.length - 1].length);
      } else {
        range.selectNodeContents(el);
      }
      sel?.removeAllRanges();
      sel?.addRange(range);

      function commit(): void {
        if (!inlineEditActive || pendingCommit !== commit) return;
        const newText = readText(el);
        htmlEl.contentEditable = 'false';
        htmlEl.style.outline = '';
        el.removeEventListener('keydown', onKey, true);
        el.removeEventListener('blur', onBlur, true);
        inlineEditActive = false;
        pendingCommit = null;
        if (originalText !== newText) {
          callbacksRef.current.onEditComplete(id, originalText, newText);
        }
      }

      function cancel(): void {
        for (const s of savedNodes) s.node.textContent = s.text;
        htmlEl.contentEditable = 'false';
        htmlEl.style.outline = '';
        el.removeEventListener('keydown', onKey, true);
        el.removeEventListener('blur', onBlur, true);
        inlineEditActive = false;
        pendingCommit = null;
      }

      function onKey(e: Event): void {
        const ke = e as KeyboardEvent;
        if (ke.key === 'Escape') {
          ke.preventDefault();
          ke.stopPropagation();
          cancel();
        } else if (ke.key === 'Enter' && !ke.shiftKey) {
          ke.preventDefault();
          ke.stopPropagation();
          commit();
        }
      }

      function onBlur(): void {
        // Delay slightly so we don't commit during a re-focus
        setTimeout(commit, 0);
      }

      el.addEventListener('keydown', onKey, true);
      el.addEventListener('blur', onBlur, true);

      pendingCommit = commit;
    }

    function onClick(e: MouseEvent): void {
      if (inlineEditActive) return;
      const target = e.target as Element;
      if (
        target.localName === PANEL_TAG ||
        (target.closest && target.closest(PANEL_TAG))
      ) {
        return;
      }
      // Also skip clicks on visual control overlays (drag handles, grips)
      if ((target as HTMLElement).dataset?.lsVisualControl || target.closest?.('[data-ls-visual-control]')) {
        return;
      }
      const el = getElementAtPoint(e.clientX, e.clientY);
      const state = useStore.getState();
      const selectedId = state.selectedNodeId;
      // Deselect if clicking outside the currently selected element
      if (selectedId !== null) {
        const selectedEl = getElementById(selectedId);
        if (!selectedEl || !el || !selectedEl.contains(el)) {
          state.clearSelection();
          return;
        }
      }
      if (!el) return;
      if (hasTextContent(el)) {
        // Let double-click handle edit; single click just selects
        if (e.detail >= 2) {
          e.preventDefault();
        }
      }
    }

    function onDblClick(e: MouseEvent): void {
      if (inlineEditActive) return;
      const target = e.target as Element;
      if (
        target.localName === PANEL_TAG ||
        (target.closest && target.closest(PANEL_TAG))
      ) {
        return;
      }
      const el = getElementAtPoint(e.clientX, e.clientY);
      if (!el || !hasTextContent(el)) return;
      e.preventDefault();
      e.stopPropagation();
      beginEdit(el);
    }

    document.addEventListener('click', onClick, true);
    document.addEventListener('dblclick', onDblClick, true);

    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('dblclick', onDblClick, true);
      // Clean up any active edit
      if (pendingCommit) pendingCommit();
      inlineEditActive = false;
      pendingCommit = null;
    };
  }, [isPickingElement, isMultiSelect]);
}
