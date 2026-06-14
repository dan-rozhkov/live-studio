// ---------------------------------------------------------------------------
// use-page-bridge.test.tsx — characterization tests (plan task H1)
//
// Covers: debounce coalescing, shadow-DOM/panel filtering, variant-swap
// suppression, and stale-selection recovery. Tests assert the REAL current
// behavior of src/client/hooks/use-page-bridge.ts.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/preact';

import { usePageBridge } from './use-page-bridge';
import { useStore } from '../state/store';
import * as variantsBridge from '../bridge/variants-bridge';
import { assignId } from '../bridge/dom-bridge';

const BODY_DEBOUNCE_MS = 500;

// Tiny harness: invoking the hook is the whole point.
function Harness(): null {
  usePageBridge();
  return null;
}

/**
 * Wait for a MutationObserver callback to be delivered (microtask) and then
 * advance past the hook's debounce window so handleBodyDirty runs.
 */
async function flushMutationAndDebounce(): Promise<void> {
  // MutationObserver callbacks arrive as a microtask.
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(BODY_DEBOUNCE_MS);
}

// jsdom does not implement CSS.escape, which the production selector builder
// (buildElementSelector) relies on. It is a standard browser global; polyfill
// a minimal version so the stale-selection recovery path can be exercised.
if (typeof (globalThis as { CSS?: unknown }).CSS === 'undefined') {
  (globalThis as { CSS?: unknown }).CSS = {};
}
const cssGlobal = (globalThis as { CSS: { escape?: (s: string) => string } }).CSS;
if (typeof cssGlobal.escape !== 'function') {
  cssGlobal.escape = (s: string) => String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

beforeEach(() => {
  vi.useFakeTimers();
  document.head.innerHTML = '';
  document.body.innerHTML = '';

  // Reset the relevant store state to a known baseline.
  useStore.setState({
    domTree: null,
    selectedNodeId: null,
    selectedNodeIds: [],
    hoveredNodeId: null,
    expandedNodes: {},
  });

  // Default: no variant swap in progress.
  vi.spyOn(variantsBridge, 'isVariantSwapInProgress').mockReturnValue(false);
});

afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/**
 * The hook captures the `setDomTree` action reference at render time via its
 * selector, so the spy MUST be installed before render(). Returns the spy with
 * the initial mount-build call already cleared.
 */
function spyOnSetDomTreeBeforeRender(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(useStore.getState(), 'setDomTree');
}

describe('usePageBridge — initial build', () => {
  it('builds the DOM tree once on mount', () => {
    const setDomTree = spyOnSetDomTreeBeforeRender();

    document.body.innerHTML = '<div id="root"><span>hi</span></div>';
    render(<Harness />);

    // rebuildTree() called synchronously during the mount effect.
    expect(setDomTree).toHaveBeenCalledTimes(1);
    const tree = useStore.getState().domTree;
    expect(tree).not.toBeNull();
  });
});

describe('usePageBridge — debounce coalescing', () => {
  it('coalesces many rapid mutations into a single rebuild after the window', async () => {
    const setDomTree = spyOnSetDomTreeBeforeRender();
    document.body.innerHTML = '<div id="root"></div>';
    render(<Harness />);
    setDomTree.mockClear(); // drop the initial mount build

    const root = document.getElementById('root')!;

    // 10 rapid mutations, each within the debounce window.
    for (let i = 0; i < 10; i++) {
      const child = document.createElement('p');
      child.textContent = `p${i}`;
      root.appendChild(child);
    }

    await flushMutationAndDebounce();

    // setDomTree is the action handleBodyDirty -> rebuildTree calls exactly once.
    expect(setDomTree).toHaveBeenCalledTimes(1);
  });

  it('does not rebuild before the debounce window elapses', async () => {
    const setDomTree = spyOnSetDomTreeBeforeRender();
    document.body.innerHTML = '<div id="root"></div>';
    render(<Harness />);
    setDomTree.mockClear();

    const root = document.getElementById('root')!;
    root.appendChild(document.createElement('p'));

    // Deliver the mutation microtask, but advance LESS than the debounce window.
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(BODY_DEBOUNCE_MS - 50);
    expect(setDomTree).not.toHaveBeenCalled();

    // Cross the threshold.
    await vi.advanceTimersByTimeAsync(50);
    expect(setDomTree).toHaveBeenCalledTimes(1);
  });
});

describe('usePageBridge — panel / shadow-DOM filtering', () => {
  it('ignores mutations inside the live-studio panel element', async () => {
    const setDomTree = spyOnSetDomTreeBeforeRender();
    document.body.innerHTML = '<div id="root"></div>';
    const panel = document.createElement('live-studio-panel');
    document.body.appendChild(panel);
    render(<Harness />);
    setDomTree.mockClear();

    // Mutate strictly inside the panel; target.closest('live-studio-panel') matches.
    const inner = document.createElement('div');
    panel.appendChild(inner);

    await flushMutationAndDebounce();

    expect(setDomTree).not.toHaveBeenCalled();
  });

  it('ignores mutations whose target IS the panel element', async () => {
    const setDomTree = spyOnSetDomTreeBeforeRender();
    render(<Harness />);
    setDomTree.mockClear();

    // Appending the panel itself produces a childList mutation on body whose
    // added node is the panel, but body is the target -> NOT filtered by this.
    // Instead mutate an attribute on the panel so target.localName === panel.
    const panel = document.createElement('live-studio-panel');
    document.body.appendChild(panel);
    // flush the body childList mutation that adding the panel created
    await flushMutationAndDebounce();
    setDomTree.mockClear();

    panel.setAttribute('data-x', '1'); // target === panel
    await flushMutationAndDebounce();

    expect(setDomTree).not.toHaveBeenCalled();
  });

  it('still rebuilds for a normal page mutation outside the panel', async () => {
    const setDomTree = spyOnSetDomTreeBeforeRender();
    document.body.innerHTML = '<div id="root"></div>';
    document.body.appendChild(document.createElement('live-studio-panel'));
    render(<Harness />);
    setDomTree.mockClear();

    document.getElementById('root')!.appendChild(document.createElement('p'));

    await flushMutationAndDebounce();

    expect(setDomTree).toHaveBeenCalledTimes(1);
  });
});

describe('usePageBridge — variant-swap suppression', () => {
  it('ignores mutations while isVariantSwapInProgress() is true', async () => {
    const setDomTree = spyOnSetDomTreeBeforeRender();
    document.body.innerHTML = '<div id="root"></div>';
    render(<Harness />);
    setDomTree.mockClear();

    (variantsBridge.isVariantSwapInProgress as ReturnType<typeof vi.fn>).mockReturnValue(true);

    document.getElementById('root')!.appendChild(document.createElement('p'));
    await flushMutationAndDebounce();

    expect(setDomTree).not.toHaveBeenCalled();
  });

  it('resumes rebuilds once the swap is over', async () => {
    const setDomTree = spyOnSetDomTreeBeforeRender();
    document.body.innerHTML = '<div id="root"></div>';
    render(<Harness />);
    setDomTree.mockClear();

    const spy = variantsBridge.isVariantSwapInProgress as ReturnType<typeof vi.fn>;

    spy.mockReturnValue(true);
    document.getElementById('root')!.appendChild(document.createElement('p'));
    await flushMutationAndDebounce();
    expect(setDomTree).not.toHaveBeenCalled();

    spy.mockReturnValue(false);
    document.getElementById('root')!.appendChild(document.createElement('p'));
    await flushMutationAndDebounce();
    expect(setDomTree).toHaveBeenCalledTimes(1);
  });
});

describe('usePageBridge — stale-selection recovery', () => {
  it('re-selects a replacement element by selector when the selected node is detached', async () => {
    // Two sibling buttons with the same selector signature (same class).
    document.body.innerHTML =
      '<div id="root">' +
      '<button class="btn" id="a">A</button>' +
      '<button class="btn" id="b">B</button>' +
      '</div>';

    render(<Harness />);
    await Promise.resolve(); // let the mount build settle

    const elA = document.getElementById('a')!;
    const elB = document.getElementById('b')!;
    // Register both elements so the registry can resolve them.
    const idA = assignId(elA);
    assignId(elB);

    // Select A.
    useStore.getState().selectNode(idA);
    expect(useStore.getState().selectedNodeId).toBe(idA);

    // Detach A from the DOM -> selection becomes stale.
    elA.remove();

    await flushMutationAndDebounce();

    // buildElementSelector(A) => 'button#a'. With #a removed, the recovery
    // querySelector('button#a') finds nothing -> selection cleared to null.
    expect(useStore.getState().selectedNodeId).toBeNull();
  });

  it('finds a replacement when the selector still matches another element', async () => {
    // A's selector resolves via class (no id) so it can match B after removal.
    document.body.innerHTML =
      '<div id="root">' +
      '<button class="btn">A</button>' +
      '<button class="btn">B</button>' +
      '</div>';

    render(<Harness />);
    await Promise.resolve();

    const buttons = document.querySelectorAll('button.btn');
    const elA = buttons[0] as HTMLElement;
    const elB = buttons[1] as HTMLElement;
    const idA = assignId(elA);
    const idB = assignId(elB);

    useStore.getState().selectNode(idA);

    // Detach A. Its selector is 'button.btn' which still matches B.
    elA.remove();

    await flushMutationAndDebounce();

    // findReplacementElement('button.btn', idA) -> picks the connected B.
    expect(useStore.getState().selectedNodeId).toBe(idB);
  });
});
