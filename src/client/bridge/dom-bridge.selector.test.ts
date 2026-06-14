// ---------------------------------------------------------------------------
// dom-bridge.selector.test.ts — selector pipeline (plan task §4.1 / P0.4)
//
// Red-then-fix. These tests assert the DESIRED behavior of the selector
// pipeline as it is actually used in production:
//
//   real DOM → fetchDomTree() → convert to the store's DomNode shape
//   (exactly as use-page-bridge does) → getElementInfoById(storeTree, id)
//
// Every real caller (DomTree/DomOperations.tsx) passes the *store* tree into
// getElementInfoById, but the selector builder used to read `node.localName`
// and `node.className`. The store shape uses `tag` and drops `className`
// (the class lives in `attributes.class`), so the agent received selectors
// like "undefined#save-btn" or a bare "undefined" — the P0.4 bug.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from 'vitest';

import {
  fetchDomTree,
  assignId,
  getElementInfoById,
  buildSelector,
  type DomTreeNode,
} from './dom-bridge';
import type { DomNode } from '../state/slices/dom-slice';

// jsdom does not implement CSS.escape, which the selector builder relies on for
// classes/ids that need escaping (e.g. Tailwind's `md:flex`). It is a standard
// browser global; polyfill a minimal version so the pipeline can be exercised.
if (typeof (globalThis as { CSS?: unknown }).CSS === 'undefined') {
  (globalThis as { CSS?: unknown }).CSS = {};
}
const cssGlobal = (globalThis as { CSS: { escape?: (s: string) => string } }).CSS;
if (typeof cssGlobal.escape !== 'function') {
  cssGlobal.escape = (s: string) => String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

// Faithful copy of use-page-bridge's convertTree: this is the exact shape that
// flows into getElementInfoById in production.
function convertTree(node: DomTreeNode): DomNode {
  return {
    id: node.id,
    tag: node.localName,
    text: node.textContent || undefined,
    children: node.children.map(convertTree),
    attributes:
      Object.keys(node.attributes).length > 0 ? node.attributes : undefined,
    component: node.component,
    sourceFile: node.source,
  };
}

/** Run the full production pipeline and return the ElementInfo for `el`. */
function infoFor(el: Element) {
  const raw = fetchDomTree(document.body);
  if (!raw) throw new Error('fetchDomTree returned null');
  const storeTree = convertTree(raw);
  const id = assignId(el); // idempotent — returns the id assigned during fetch
  return getElementInfoById(storeTree as unknown as DomTreeNode, id);
}

beforeEach(() => {
  document.body.innerHTML = `
    <div id="root">
      <main>
        <button id="save-btn">Save</button>
        <button data-testid="cancel">Cancel</button>
        <ul>
          <li>one</li>
          <li class="active">two</li>
          <li>three</li>
        </ul>
        <span class="md:flex gap-2">tw</span>
        <p>plain</p>
        <p>plain2</p>
      </main>
    </div>
  `;
});

describe('selector pipeline (store tree → getElementInfoById)', () => {
  it('builds an id selector with the correct tag (not "undefined")', () => {
    const el = document.querySelector('#save-btn')!;
    const info = infoFor(el);

    // getPathInfo also appends a (here redundant) :nth-of-type — valid & resolves.
    expect(info.element).toContain('button#save-btn');
    expect(info.element).not.toContain('undefined');
    expect(document.querySelector(info.element)).toBe(el);
  });

  it('builds a data-testid selector', () => {
    const el = document.querySelector('[data-testid="cancel"]')!;
    const info = infoFor(el);

    expect(info.element).toContain('button[data-testid="cancel"]');
    expect(info.element).not.toContain('undefined');
    expect(document.querySelector(info.element)).toBe(el);
  });

  it('builds a class selector and escapes classes that need it (md:flex)', () => {
    const el = document.querySelector('span')!;
    const info = infoFor(el);

    // The raw class "md:flex" must be escaped to a valid selector.
    expect(info.element).toContain('span');
    expect(info.element).not.toContain('undefined');
    // An unescaped ".md:flex" would throw in querySelector — the fix must escape it.
    expect(() => document.querySelector(info.element)).not.toThrow();
    expect(document.querySelector(info.element)).toBe(el);
  });

  it('disambiguates same-tag siblings with :nth-of-type', () => {
    const second = document.querySelectorAll('main > p')[1];
    const info = infoFor(second);

    expect(info.element).toBe('p:nth-of-type(2)');
    expect(info.element).not.toContain('undefined');
    expect(document.querySelector(info.element)).toBe(second);
  });

  it('combines class + nth-of-type for a classed sibling', () => {
    const activeLi = document.querySelector('li.active')!;
    const info = infoFor(activeLi);

    expect(info.element).toBe('li.active:nth-of-type(2)');
    expect(document.querySelector(info.element)).toBe(activeLi);
  });

  it('never emits "undefined" anywhere in element or path for any node', () => {
    const all = document.body.querySelectorAll('*');
    for (const el of Array.from(all)) {
      const info = infoFor(el);
      expect(info.element).not.toContain('undefined');
      if (info.path) expect(info.path).not.toContain('undefined');
      // The element selector must resolve to a real element.
      expect(() => document.querySelector(info.element)).not.toThrow();
    }
  });
});

describe('buildSelector — bridge-shape (DomTreeNode) compatibility', () => {
  // The fix must keep working for the original bridge shape (localName/className),
  // not only the store shape — buildSelector is exported and shape-agnostic.
  const make = (over: Partial<DomTreeNode>): DomTreeNode => ({
    id: 1,
    localName: 'div',
    className: '',
    attributes: {},
    children: [],
    textContent: '',
    ...over,
  });

  it('uses id over classes', () => {
    expect(buildSelector(make({ attributes: { id: 'x' }, className: 'a' }))).toBe(
      'div#x',
    );
  });

  it('joins classes with the tag', () => {
    expect(buildSelector(make({ className: 'a b' }))).toBe('div.a.b');
  });

  it('falls back to the bare tag with no attrs/classes', () => {
    expect(buildSelector(make({}))).toBe('div');
  });
});
