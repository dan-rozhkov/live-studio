// ---------------------------------------------------------------------------
// DOM Bridge — element registry, selector builder, DOM tree snapshot
// ---------------------------------------------------------------------------

/** Shape returned by getElementInfoById / getPathInfo */
export interface ElementInfo {
  element: string;
  path?: string;
  component?: string;
  source?: string;
}

/** A single node in the recursive DOM-tree snapshot */
export interface DomTreeNode {
  id: number;
  localName: string;
  className: string;
  attributes: Record<string, string>;
  children: DomTreeNode[];
  textContent: string;
  component?: string;
  source?: string;
}

// ---- internal state -------------------------------------------------------

let nextId = 1;
const elements = new Map<number, Element>();
const reverseMap = new WeakMap<Element, number>();

// ---- id registry ----------------------------------------------------------

/** Assign (or retrieve) a stable numeric id for an element. */
export function assignId(el: Element): number {
  let id = reverseMap.get(el);
  if (id === undefined) {
    id = nextId++;
    elements.set(id, el);
    reverseMap.set(el, id);
  }
  return id;
}

/** Get the Element behind a registry id, or `undefined`. */
export function getElementById(id: number): Element | undefined {
  return elements.get(id);
}

// ---- overlay detection ----------------------------------------------------

const PANEL_TAG = "live-studio-panel";

/** True when `el` belongs to the live-studio overlay / shadow DOM. */
function isOverlay(el: Element): boolean {
  if (el.localName === PANEL_TAG) return true;
  if (el.closest?.(PANEL_TAG)) return true;
  // Walk up through shadow-DOM boundaries
  let node: Node | null = el;
  while (node) {
    if ((node as Element).localName === PANEL_TAG) return true;
    const root = node.getRootNode();
    if (root === document) break;
    node = (root as ShadowRoot).host ?? null;
  }
  return false;
}

// ---- selector builder (low-level, works on live Elements) -----------------

/**
 * Build a CSS-selector string for a live DOM element.
 *
 * Priority: id > data-testid > data-id > classes + nth-of-type fallback.
 */
export function buildElementSelector(el: Element): string {
  const tag = el.localName;
  if (el.id) return `${tag}#${CSS.escape(el.id)}`;

  const testId = el.getAttribute("data-testid");
  if (testId) return `${tag}[data-testid="${CSS.escape(testId)}"]`;

  const dataId = el.getAttribute("data-id");
  if (dataId) return `${tag}[data-id="${CSS.escape(dataId)}"]`;

  if (el.className && typeof el.className === "string") {
    const classes = el.className.trim().split(/\s+/).filter(Boolean);
    if (classes.length > 0) {
      return `${tag}${classes.map((c) => `.${CSS.escape(c)}`).join("")}`;
    }
  }
  return tag;
}

// ---- selector builder (works on DomTreeNode snapshots) --------------------

/**
 * Build a CSS-selector string from a `DomTreeNode` (snapshot data).
 *
 * Same priority as `buildElementSelector` but operates on plain objects
 * rather than live DOM elements.
 */
export function buildSelector(node: DomTreeNode): string {
  const tag = node.localName;
  const attrs = node.attributes ?? {};
  if (attrs.id) return `${tag}#${attrs.id}`;
  if (attrs["data-testid"]) return `${tag}[data-testid="${attrs["data-testid"]}"]`;
  if (attrs["data-id"]) return `${tag}[data-id="${attrs["data-id"]}"]`;

  const classes = node.className
    ? (typeof node.className === "string" ? node.className : "")
        .split(/\s+/)
        .filter(Boolean)
        .map((c) => `.${c}`)
        .join("")
    : "";
  return `${tag}${classes}`;
}

// ---- ancestor chain helpers -----------------------------------------------

/** Walk the tree to find the chain of ancestors from root to `targetId`. */
function findAncestorChain(
  tree: DomTreeNode,
  targetId: number,
): DomTreeNode[] | null {
  if (tree.id === targetId) return [tree];
  for (const child of tree.children) {
    const chain = findAncestorChain(child, targetId);
    if (chain) return [tree, ...chain];
  }
  return null;
}

/** Compute the `:nth-of-type(n)` suffix when `parent` has multiple children with the same tag. */
function nthOfType(parent: DomTreeNode, node: DomTreeNode): string {
  const sameTag = parent.children.filter((c) => c.localName === node.localName);
  if (sameTag.length <= 1) return "";
  const idx = sameTag.indexOf(node) + 1;
  return `:nth-of-type(${idx})`;
}

// ---- getPathInfo / getElementInfoById -------------------------------------

/**
 * Return selector + up to 3 non-trivial ancestors for the node identified
 * by `nodeId` inside the given `domTree`.
 */
export function getPathInfo(
  domTree: DomTreeNode | null,
  nodeId: number,
): ElementInfo {
  if (!domTree) return { element: "[unknown]" };
  const chain = findAncestorChain(domTree, nodeId);
  if (!chain || chain.length === 0) return { element: "[unknown]" };

  const target = chain[chain.length - 1];
  const parent = chain.length >= 2 ? chain[chain.length - 2] : null;

  let element = buildSelector(target);
  if (parent) element += nthOfType(parent, target);

  // Up to 3 meaningful ancestors (skip html/body)
  const filtered = chain
    .slice(0, -1)
    .map((node, i) => ({ node, parent: i > 0 ? chain[i - 1] : null }))
    .filter(({ node }) => node.localName !== "html" && node.localName !== "body")
    .slice(-3);

  const ancestors = filtered.map(({ node, parent: p }) => {
    let sel = buildSelector(node);
    if (p) sel += nthOfType(p, node);
    return sel;
  });

  return {
    element,
    path: ancestors.length > 0 ? ancestors.join(" > ") : undefined,
    component: target.component,
    source: target.source,
  };
}

/**
 * Convenience wrapper: looks up `nodeId` in the given `domTree` and returns
 * element info (selector + ancestor path).
 */
export function getElementInfoById(
  domTree: DomTreeNode | null,
  nodeId: number,
): ElementInfo {
  return getPathInfo(domTree, nodeId);
}

// ---- getElementAtPoint ----------------------------------------------------

/**
 * Find the topmost user-content element at viewport coordinates `(x, y)`.
 *
 * Elements that belong to the live-studio shadow DOM are skipped so the
 * overlay never interferes with element picking.
 */
export function getElementAtPoint(x: number, y: number): Element | null {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  // If the hit element is inside our overlay, hide it temporarily and retry
  if (isOverlay(el)) {
    // Walk up to find the panel host and temporarily hide it
    let panel: Element | null = el.closest?.(PANEL_TAG) ?? null;
    if (!panel) {
      let node: Node | null = el;
      while (node) {
        if ((node as Element).localName === PANEL_TAG) {
          panel = node as Element;
          break;
        }
        const root = node.getRootNode();
        if (root === document) break;
        node = (root as ShadowRoot).host ?? null;
      }
    }
    if (panel && panel instanceof HTMLElement) {
      const prev = panel.style.pointerEvents;
      panel.style.pointerEvents = "none";
      const underneath = document.elementFromPoint(x, y);
      panel.style.pointerEvents = prev;
      if (underneath && !isOverlay(underneath)) return underneath;
      return null;
    }
    return null;
  }
  return el;
}

// ---- Framework component detection (delegated to component-bridge) --------

import { detectComponent } from "./component-bridge";

// ---- fetchDomTree ---------------------------------------------------------

/**
 * Build a recursive snapshot of the DOM tree starting from `root`
 * (defaults to `document.documentElement`).
 *
 * Overlay / live-studio elements are excluded from the tree.
 */
export function fetchDomTree(root?: Element): DomTreeNode | null {
  function walk(el: Element): DomTreeNode | null {
    if (isOverlay(el)) return null;

    const id = assignId(el);
    const attrs: Record<string, string> = {};
    for (let i = 0; i < el.attributes.length; i++) {
      attrs[el.attributes[i].name] = el.attributes[i].value;
    }

    const children: DomTreeNode[] = [];
    for (let j = 0; j < el.children.length; j++) {
      const c = walk(el.children[j]);
      if (c) children.push(c);
    }

    let text = "";
    for (let k = 0; k < el.childNodes.length; k++) {
      if (el.childNodes[k].nodeType === Node.TEXT_NODE) {
        text += el.childNodes[k].textContent;
      }
    }

    const componentInfo = detectComponent(el);
    return {
      id,
      localName: el.localName,
      className: (el.className as string) || "",
      attributes: attrs,
      children,
      textContent: text.slice(0, 200),
      component: componentInfo?.name,
      source: componentInfo?.sourceFile,
    };
  }

  return walk(root ?? document.documentElement);
}

// ---- helpers exposed for other modules ------------------------------------

/**
 * Attempt to re-find an element by its selector after a DOM mutation.
 * Returns the new numeric id or `null`.
 */
export function findReplacementElement(
  selector: string,
  oldId: number,
): number | null {
  try {
    const candidates = document.querySelectorAll(selector);
    if (candidates.length === 0) return null;
    if (candidates.length === 1) {
      const el = candidates[0];
      if (el.isConnected && !isOverlay(el)) return assignId(el);
      return null;
    }
    const oldEl = getElementById(oldId);
    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      if (el !== oldEl && el.isConnected && !isOverlay(el)) {
        return assignId(el);
      }
    }
  } catch {
    // Invalid selector — ignore
  }
  return null;
}

/** Remove registry entries for elements that are no longer in the document. */
export function purgeDetachedElements(selectedId: number | null): void {
  for (const [id, el] of elements) {
    if (!el.isConnected && id !== selectedId) {
      elements.delete(id);
    }
  }
}

/** Check whether the element behind `id` is still attached to the DOM. */
export function isElementConnected(id: number): boolean {
  const el = elements.get(id);
  return el !== undefined && el.isConnected;
}

/** Scroll the element with the given `id` smoothly into view. */
export function scrollElementIntoView(id: number): void {
  const el = elements.get(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
