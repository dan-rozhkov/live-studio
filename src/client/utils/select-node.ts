import { getElementById, scrollElementIntoView } from '../bridge/dom-bridge';
import { fetchComputedStyles } from '../bridge/style-bridge';
import { fetchDesignTokens } from '../bridge/token-bridge';
import { extractComponentProps } from '../bridge/component-bridge';
import { useStore } from '../state/store';

/**
 * Select a node by ID: update the store selection, expand the tree path,
 * scroll the element into view, and fetch its computed styles into the store.
 */
export function selectAndFetchStyles(nodeId: number): void {
  const store = useStore.getState();
  store.selectNode(nodeId);
  store.expandToNode(nodeId);
  scrollElementIntoView(nodeId);

  const el = getElementById(nodeId);
  if (el) {
    store.setComputedStyles(fetchComputedStyles(el));
    const parent = el.parentElement;
    store.setParentDisplay(parent ? window.getComputedStyle(parent).display : '');
    store.setSelectedComponent(extractComponentProps(el));
  } else {
    store.setSelectedComponent(null);
  }

  // Load design tokens once (they come from :root and don't change per element)
  if (store.designTokens.length === 0) {
    const tokens = fetchDesignTokens();
    if (tokens.length > 0) {
      store.setDesignTokens(tokens);
    }
  }
}

/**
 * If the given nodeId is currently selected, refresh its computed styles.
 */
export function refreshIfSelected(nodeId: number | null | undefined): void {
  if (nodeId == null) return;
  const store = useStore.getState();
  if (store.selectedNodeId !== nodeId) return;
  const el = getElementById(nodeId);
  if (el) {
    store.setComputedStyles(fetchComputedStyles(el));
  }
}
