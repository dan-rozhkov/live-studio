// ---------------------------------------------------------------------------
// use-page-bridge — MutationObserver + DOM tree sync hook
// ---------------------------------------------------------------------------

import { useEffect, useCallback, useRef } from 'preact/hooks';
import {
  fetchDomTree,
  getElementById,
  purgeDetachedElements,
  isElementConnected,
  buildElementSelector,
  findReplacementElement,
  type DomTreeNode,
} from '../bridge/dom-bridge';
import { useStore } from '../state/store';
import type { DomNode } from '../state/slices/dom-slice';

// ---- tree conversion -------------------------------------------------------

/** Convert the bridge's `DomTreeNode` to the store's `DomNode` shape. */
function convertTree(node: DomTreeNode): DomNode {
  return {
    id: node.id,
    tag: node.localName,
    text: node.textContent || undefined,
    children: node.children.map(convertTree),
    attributes: Object.keys(node.attributes).length > 0 ? node.attributes : undefined,
    component: node.component,
    sourceFile: node.source,
  };
}

// ---- constants -------------------------------------------------------------

const PANEL_TAG = 'live-studio-panel';

/** Debounce delay (ms) for body mutation observer. */
const BODY_DEBOUNCE_MS = 500;

// ---- hook ------------------------------------------------------------------

/**
 * Preact hook that observes the page DOM for mutations and keeps the store's
 * `domTree` in sync.
 *
 * - Sets up a `MutationObserver` on `document.body` (childList + subtree).
 * - Debounces rebuilds to avoid excessive updates during rapid DOM changes.
 * - Filters out mutations originating from live-studio's own shadow DOM.
 * - Re-selects the previously selected element after tree rebuilds when possible.
 * - Cleans up the observer on unmount.
 */
export function usePageBridge(): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);

  const setDomTree = useStore((s) => s.setDomTree);
  const selectNode = useStore((s) => s.selectNode);
  const expandToNode = useStore((s) => s.expandToNode);

  // -- rebuild tree -----------------------------------------------------------

  const rebuildTree = useCallback((): DomNode | null => {
    try {
      const raw = fetchDomTree();
      if (!raw) return null;
      const tree = convertTree(raw);
      setDomTree(tree);
      return tree;
    } catch (e) {
      console.error('[live-studio] Failed to fetch DOM tree:', e);
      return null;
    }
  }, [setDomTree]);

  // -- handle body mutations --------------------------------------------------

  const handleBodyDirty = useCallback(() => {
    const state = useStore.getState();
    const currentId = state.selectedNodeId;
    let selectorForReselect: string | null = null;
    let staleSelection = false;

    // Check whether the currently selected element is still connected
    if (currentId !== null && !isElementConnected(currentId)) {
      const el = getElementById(currentId);
      if (el) selectorForReselect = buildElementSelector(el);
      staleSelection = true;
    }

    const tree = rebuildTree();

    // Try to re-select a replacement element if the old one was detached
    if (staleSelection) {
      let newId: number | null = null;
      if (selectorForReselect && currentId !== null) {
        newId = findReplacementElement(selectorForReselect, currentId);
      }
      if (newId !== null) {
        selectNode(newId);
        expandToNode(newId);
      } else {
        selectNode(null);
      }
    }

    // Remove registry entries for detached elements
    purgeDetachedElements(useStore.getState().selectedNodeId);
  }, [rebuildTree, selectNode, expandToNode]);

  // -- setup observer + initial build -----------------------------------------

  useEffect(() => {
    let cancelled = false;

    function init(): void {
      if (cancelled) return;

      // Initial tree build
      rebuildTree();

      if (cancelled) return;

      // Set up body mutation observer
      const observer = new MutationObserver((mutations) => {
        // Filter: ignore mutations that only affect our own shadow DOM
        const hasRelevantMutation = mutations.some((m) => {
          const target = m.target as Element;
          // Skip mutations inside our panel's shadow DOM
          if (target.localName === PANEL_TAG) return false;
          if (target.closest?.(PANEL_TAG)) return false;
          // Walk up through shadow roots
          let node: Node | null = target;
          while (node) {
            if ((node as Element).localName === PANEL_TAG) return false;
            const root = node.getRootNode();
            if (root === document) break;
            node = (root as ShadowRoot).host ?? null;
          }
          return true;
        });

        if (!hasRelevantMutation) return;

        // Debounce
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          handleBodyDirty();
        }, BODY_DEBOUNCE_MS);
      });

      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
      }
      observerRef.current = observer;
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      init();
    }

    return () => {
      cancelled = true;
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [rebuildTree, handleBodyDirty]);
}
