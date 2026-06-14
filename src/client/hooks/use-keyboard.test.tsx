// ---------------------------------------------------------------------------
// use-keyboard.test.tsx — characterization tests
//
// Covers the global keyboard bindings registered by useKeyboard():
//   Cmd/Ctrl+Z (undo) / Shift+Cmd+Z (redo), Escape (deselect),
//   Delete/Backspace (delete element), Cmd+D (duplicate), Cmd+C (copy info),
//   Cmd+Enter (send edit), Cmd+Shift+S (screenshot), arrow-key tree nav,
//   Shift+Enter (select parent), and the isInputFocused() typing-guard.
//
// All assertions pin the REAL CURRENT behavior of
// src/client/hooks/use-keyboard.ts so the suite is green today. Where the
// current behavior is a documented bug (docs/code-review-2026-06-10.md) it is
// asserted as-is and flagged with a `// BUG (Pn.m): ...` comment.
//
// The hook attaches every listener via window.addEventListener('keydown', ...)
// in the bubble phase (no capture), so tests dispatch real KeyboardEvents on
// `window`. This gives full control over `code`/`key`/modifier flags, which
// matters because some bindings key off `e.code` (KeyC / KeyD / KeyS) rather
// than `e.key`.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/preact';

import { useKeyboard, type UseKeyboardOptions } from './use-keyboard';
import { useStore } from '../state/store';
import { useUndoStore, type UndoOp } from './use-undo';
import type { DomNode } from '../state/slices/dom-slice';
import * as domBridge from '../bridge/dom-bridge';
import * as componentBridge from '../bridge/component-bridge';

// ── Harness ──────────────────────────────────────────────────────────

function Harness(props: { opts: UseKeyboardOptions }): null {
  useKeyboard(props.opts);
  return null;
}

function mountHook(opts: UseKeyboardOptions = {}) {
  return render(<Harness opts={opts} />);
}

// ── Event helpers ────────────────────────────────────────────────────

interface KeyOpts {
  key: string;
  code?: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
}

/** Dispatch a keydown KeyboardEvent on window and return it (for spying on preventDefault). */
function fireKey(o: KeyOpts): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', {
    key: o.key,
    code: o.code ?? '',
    metaKey: !!o.meta,
    ctrlKey: !!o.ctrl,
    shiftKey: !!o.shift,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(ev);
  return ev;
}

// ── Store helpers ────────────────────────────────────────────────────

/** Reset the relevant slices of the store to a known baseline. */
function resetStore(): void {
  useStore.setState({
    domTree: null,
    selectedNodeId: null,
    selectedNodeIds: [],
    hoveredNodeId: null,
    expandedNodes: {},
    isPickingElement: false,
  });
}

/** Set selection bypassing the derived-field wrapper (setState is raw). */
function setSelection(ids: number[]): void {
  useStore.setState({ selectedNodeIds: ids, selectedNodeId: ids.at(-1) ?? null });
}

function node(id: number, tag: string, children: DomNode[] = []): DomNode {
  return { id, tag, children };
}

/**
 * A small visible tree:
 *   html > body > div#1 [ h1#2, ul#3 [ li#4, li#5 ], script#6 (hidden) ]
 * Visible flat order (when div#1 and ul#3 expanded): 1, 2, 3, 4, 5
 */
function buildTree(): DomNode {
  return node(100, 'html', [
    node(101, 'body', [
      node(1, 'div', [
        node(2, 'h1'),
        node(3, 'ul', [node(4, 'li'), node(5, 'li')]),
        node(6, 'script'), // TREE_HIDDEN_TAGS => skipped
      ]),
    ]),
  ]);
}

// ── Lifecycle ────────────────────────────────────────────────────────

beforeEach(() => {
  document.body.innerHTML = '';
  resetStore();
  useUndoStore.getState().clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
});

// ── Undo / Redo ──────────────────────────────────────────────────────

describe('useKeyboard — undo / redo (Cmd/Ctrl+Z)', () => {
  const op: UndoOp = { type: 'style', nodeId: 1, property: 'color', newValue: 'red' };

  it('Cmd+Z applies the popped undo entry via applyEntry', () => {
    const applyEntry = vi.fn();
    useUndoStore.getState().push(op);
    mountHook({ applyEntry });

    fireKey({ key: 'z', code: 'KeyZ', meta: true });

    expect(applyEntry).toHaveBeenCalledTimes(1);
    expect(applyEntry).toHaveBeenCalledWith(op, 'undo');
  });

  it('Ctrl+Z works too (cross-platform mod key)', () => {
    const applyEntry = vi.fn();
    useUndoStore.getState().push(op);
    mountHook({ applyEntry });

    fireKey({ key: 'z', code: 'KeyZ', ctrl: true });

    expect(applyEntry).toHaveBeenCalledWith(op, 'undo');
  });

  it('Shift+Cmd+Z redoes the entry via applyEntry', () => {
    const applyEntry = vi.fn();
    useUndoStore.getState().push(op);
    // Move op into `future` so redo() can return it.
    useUndoStore.getState().undo();
    mountHook({ applyEntry });

    fireKey({ key: 'z', code: 'KeyZ', meta: true, shift: true });

    expect(applyEntry).toHaveBeenCalledTimes(1);
    expect(applyEntry).toHaveBeenCalledWith(op, 'redo');
  });

  it('does not call applyEntry when the undo stack is empty', () => {
    const applyEntry = vi.fn();
    mountHook({ applyEntry });

    fireKey({ key: 'z', code: 'KeyZ', meta: true });

    expect(applyEntry).not.toHaveBeenCalled();
  });

  it('ignores plain "z" without a modifier', () => {
    const applyEntry = vi.fn();
    useUndoStore.getState().push(op);
    mountHook({ applyEntry });

    fireKey({ key: 'z', code: 'KeyZ' });

    expect(applyEntry).not.toHaveBeenCalled();
  });

  it('does not register the listener at all when applyEntry is undefined', () => {
    useUndoStore.getState().push(op);
    mountHook({}); // no applyEntry
    // Nothing to assert beyond "no throw"; the effect early-returns.
    expect(() => fireKey({ key: 'z', code: 'KeyZ', meta: true })).not.toThrow();
  });
});

// ── Escape ───────────────────────────────────────────────────────────

describe('useKeyboard — Escape', () => {
  it('clears the selection', () => {
    setSelection([1, 2]);
    mountHook();

    fireKey({ key: 'Escape' });

    expect(useStore.getState().selectedNodeIds).toEqual([]);
    expect(useStore.getState().selectedNodeId).toBeNull();
  });

  it('also wipes the entire undo history', () => {
    // BUG (P1.9): Escape calls undoClear() after clearSelection(), so a routine
    // deselect destroys all undo history and Cmd+Z stops working afterwards.
    setSelection([1]);
    useUndoStore.getState().push({ type: 'style', nodeId: 1, property: 'color' });
    expect(useUndoStore.getState().past).toHaveLength(1);

    mountHook();
    fireKey({ key: 'Escape' });

    expect(useUndoStore.getState().past).toHaveLength(0);
    expect(useUndoStore.getState().future).toHaveLength(0);
  });

  it('while picking an element, cancels picking instead of clearing selection', () => {
    setSelection([1]);
    useStore.setState({ isPickingElement: true });
    useUndoStore.getState().push({ type: 'style', nodeId: 1 });
    mountHook();

    fireKey({ key: 'Escape' });

    // Early-return path: picking turned off, selection + undo untouched.
    expect(useStore.getState().isPickingElement).toBe(false);
    expect(useStore.getState().selectedNodeIds).toEqual([1]);
    expect(useUndoStore.getState().past).toHaveLength(1);
  });
});

// ── Delete / Backspace ───────────────────────────────────────────────

describe('useKeyboard — Delete / Backspace', () => {
  it('Delete deletes every selected element (in reverse order)', () => {
    const deleteElement = vi.fn();
    setSelection([1, 2, 3]);
    mountHook({ deleteElement });

    fireKey({ key: 'Delete' });

    expect(deleteElement).toHaveBeenCalledTimes(3);
    // toDelete = [...ids].reverse() => 3, 2, 1
    expect(deleteElement.mock.calls.map((c) => c[0])).toEqual([3, 2, 1]);
  });

  it('Backspace also triggers deletion', () => {
    const deleteElement = vi.fn();
    setSelection([7]);
    mountHook({ deleteElement });

    fireKey({ key: 'Backspace' });

    expect(deleteElement).toHaveBeenCalledTimes(1);
    expect(deleteElement).toHaveBeenCalledWith(7);
  });

  it('does nothing when no node is selected', () => {
    const deleteElement = vi.fn();
    mountHook({ deleteElement });

    fireKey({ key: 'Delete' });

    expect(deleteElement).not.toHaveBeenCalled();
  });

  it('does NOT delete the page element while typing in an <input> (typing guard)', () => {
    // P0.3: useKeyboard itself DOES guard against typing via isInputFocused().
    // (The separate, unguarded handler in DomOperations is the actual bug; in
    //  isolation, this hook correctly suppresses the delete.)
    const deleteElement = vi.fn();
    setSelection([1]);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);

    mountHook({ deleteElement });
    fireKey({ key: 'Backspace' });

    expect(deleteElement).not.toHaveBeenCalled();
  });

  it('does NOT delete while a contentEditable element is focused', () => {
    const deleteElement = vi.fn();
    setSelection([1]);

    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    // jsdom does not auto-derive isContentEditable from the attribute reliably;
    // define it so the guard sees a contentEditable target.
    Object.defineProperty(editable, 'isContentEditable', { value: true, configurable: true });
    document.body.appendChild(editable);
    editable.focus();

    mountHook({ deleteElement });
    fireKey({ key: 'Delete' });

    expect(deleteElement).not.toHaveBeenCalled();
  });
});

// ── Cmd+D duplicate ──────────────────────────────────────────────────

describe('useKeyboard — Cmd/Ctrl+D (duplicate)', () => {
  it('duplicates each selected element exactly once (per use-keyboard handler)', () => {
    // P0.3 note: a SECOND, separate handler in DomOperations fires duplicate
    // again, producing the "duplicates twice" bug. In isolation, useKeyboard's
    // own handler fires duplicateElement exactly once per selected id.
    const duplicateElement = vi.fn();
    setSelection([1, 2]);
    mountHook({ duplicateElement });

    fireKey({ key: 'd', code: 'KeyD', meta: true });

    expect(duplicateElement).toHaveBeenCalledTimes(2);
    expect(duplicateElement.mock.calls.map((c) => c[0])).toEqual([1, 2]);
  });

  it('uses e.code (KeyD), so duplicate fires regardless of e.key casing', () => {
    const duplicateElement = vi.fn();
    setSelection([5]);
    mountHook({ duplicateElement });

    // Some platforms report key 'D' while holding meta; handler keys off code.
    fireKey({ key: 'D', code: 'KeyD', meta: true });

    expect(duplicateElement).toHaveBeenCalledTimes(1);
    expect(duplicateElement).toHaveBeenCalledWith(5);
  });

  it('does nothing when nothing is selected', () => {
    const duplicateElement = vi.fn();
    mountHook({ duplicateElement });

    fireKey({ key: 'd', code: 'KeyD', meta: true });

    expect(duplicateElement).not.toHaveBeenCalled();
  });
});

// ── Cmd+C copy ───────────────────────────────────────────────────────

describe('useKeyboard — Cmd/Ctrl+C (copy element info)', () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('copies a fallback component tree + file when no tracer info is available', () => {
    useStore.setState({ domTree: buildTree() });
    setSelection([2]); // the h1 node
    // No real DOM element registered => getElementById returns undefined =>
    // getTracerInfo is never consulted; the chain fallback path runs.
    vi.spyOn(domBridge, 'getElementById').mockReturnValue(undefined);

    mountHook();
    fireKey({ key: 'c', code: 'KeyC', meta: true });

    expect(writeText).toHaveBeenCalledTimes(1);
    const text = writeText.mock.calls[0][0] as string;
    expect(text).toContain('Page URL:');
    expect(text).toContain('Viewport:');
    // chain = html > body > div > h1, filtered of html/body => "div > h1"
    expect(text).toContain('Component Tree: div > h1');
  });

  it('prefers tracer info (component tree + file) when available', () => {
    useStore.setState({ domTree: buildTree() });
    setSelection([2]);

    const fakeEl = document.createElement('h1');
    vi.spyOn(domBridge, 'getElementById').mockReturnValue(fakeEl);
    vi.spyOn(componentBridge, 'getTracerInfo').mockReturnValue({
      tree: 'App > Header',
      file: 'src/Header.tsx',
    });

    mountHook();
    fireKey({ key: 'c', code: 'KeyC', meta: true });

    const text = writeText.mock.calls[0][0] as string;
    expect(text).toContain('Component Tree: App > Header');
    expect(text).toContain('File: src/Header.tsx');
  });

  it('dispatches the livestudio:copied event after writing', () => {
    useStore.setState({ domTree: buildTree() });
    setSelection([2]);
    vi.spyOn(domBridge, 'getElementById').mockReturnValue(undefined);

    const onCopied = vi.fn();
    window.addEventListener('livestudio:copied', onCopied);
    mountHook();

    fireKey({ key: 'c', code: 'KeyC', meta: true });

    expect(onCopied).toHaveBeenCalledTimes(1);
    window.removeEventListener('livestudio:copied', onCopied);
  });

  it('swallows Cmd+C whenever an element is selected — overriding any page text selection', () => {
    // BUG (P1.14): Cmd+C is intercepted (preventDefault) for ANY selected
    // element, so the user cannot copy a normal page text selection while an
    // element is selected. We pin that preventDefault IS called here.
    useStore.setState({ domTree: buildTree() });
    setSelection([2]);
    vi.spyOn(domBridge, 'getElementById').mockReturnValue(undefined);
    mountHook();

    const ev = fireKey({ key: 'c', code: 'KeyC', meta: true });

    expect(ev.defaultPrevented).toBe(true);
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it('does NOT copy (or preventDefault) when no node is selected', () => {
    useStore.setState({ domTree: buildTree() });
    // no selection
    mountHook();

    const ev = fireKey({ key: 'c', code: 'KeyC', meta: true });

    expect(writeText).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });
});

// ── Cmd+Enter send edit ──────────────────────────────────────────────

describe('useKeyboard — Cmd/Ctrl+Enter (send edit)', () => {
  it('fires sendEdit on Cmd+Enter', () => {
    const sendEdit = vi.fn();
    mountHook({ sendEdit });

    fireKey({ key: 'Enter', meta: true });

    expect(sendEdit).toHaveBeenCalledTimes(1);
  });

  it('fires sendEdit on Ctrl+Enter', () => {
    const sendEdit = vi.fn();
    mountHook({ sendEdit });

    fireKey({ key: 'Enter', ctrl: true });

    expect(sendEdit).toHaveBeenCalledTimes(1);
  });

  it('ignores Enter without a modifier', () => {
    const sendEdit = vi.fn();
    mountHook({ sendEdit });

    fireKey({ key: 'Enter' });

    expect(sendEdit).not.toHaveBeenCalled();
  });

  it('Cmd+Enter is NOT suppressed by the typing guard (no isInputFocused check)', () => {
    // The Cmd+Enter handler intentionally has no isInputFocused() guard, so it
    // fires even while typing in an input (e.g. submitting from the chat box).
    const sendEdit = vi.fn();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    mountHook({ sendEdit });

    fireKey({ key: 'Enter', meta: true });

    expect(sendEdit).toHaveBeenCalledTimes(1);
  });
});

// ── Cmd+Shift+S screenshot ───────────────────────────────────────────

describe('useKeyboard — Cmd/Ctrl+Shift+S (screenshot)', () => {
  it('fires takeScreenshot on Cmd+Shift+S', () => {
    const takeScreenshot = vi.fn();
    mountHook({ takeScreenshot });

    fireKey({ key: 's', code: 'KeyS', meta: true, shift: true });

    expect(takeScreenshot).toHaveBeenCalledTimes(1);
  });

  it('does not fire without Shift', () => {
    const takeScreenshot = vi.fn();
    mountHook({ takeScreenshot });

    fireKey({ key: 's', code: 'KeyS', meta: true });

    expect(takeScreenshot).not.toHaveBeenCalled();
  });
});

// ── Arrow navigation ─────────────────────────────────────────────────

describe('useKeyboard — arrow tree navigation', () => {
  beforeEach(() => {
    useStore.setState({
      domTree: buildTree(),
      // getVisibleNodeIds() walks from the html root and only descends into
      // EXPANDED nodes, so the full ancestor chain (html, body, div, ul) must
      // be expanded for the inner nodes to appear in the visible list.
      // Visible flat order then = 100, 101, 1, 2, 3, 4, 5 (script#6 hidden).
      expandedNodes: { 100: true, 101: true, 1: true, 3: true },
    });
  });

  it('ArrowDown moves selection to the next visible node', () => {
    const handleSelectNode = vi.fn();
    setSelection([2]); // h1
    mountHook({ handleSelectNode });

    fireKey({ key: 'ArrowDown' });

    // visible order: 1, 2, 3, 4, 5 -> after 2 comes 3 (ul)
    expect(handleSelectNode).toHaveBeenCalledWith(3);
  });

  it('ArrowUp moves selection to the previous visible node', () => {
    const handleSelectNode = vi.fn();
    setSelection([3]); // ul
    mountHook({ handleSelectNode });

    fireKey({ key: 'ArrowUp' });

    expect(handleSelectNode).toHaveBeenCalledWith(2); // h1
  });

  it('skips TREE_HIDDEN_TAGS (script) when navigating', () => {
    const handleSelectNode = vi.fn();
    setSelection([5]); // last li, after which only the hidden <script> remains
    mountHook({ handleSelectNode });

    fireKey({ key: 'ArrowDown' });

    // script#6 is filtered out of the visible list, so there is no next node.
    expect(handleSelectNode).not.toHaveBeenCalled();
  });

  it('ArrowDown at the last visible node is a no-op', () => {
    const handleSelectNode = vi.fn();
    setSelection([5]);
    mountHook({ handleSelectNode });

    fireKey({ key: 'ArrowDown' });
    expect(handleSelectNode).not.toHaveBeenCalled();
  });

  it('ArrowRight on a collapsed node with visible children expands it', () => {
    const handleSelectNode = vi.fn();
    useStore.setState({ expandedNodes: {} }); // collapse all
    setSelection([1]); // div has children h1, ul
    mountHook({ handleSelectNode });

    fireKey({ key: 'ArrowRight' });

    expect(useStore.getState().expandedNodes[1]).toBe(true);
    expect(handleSelectNode).not.toHaveBeenCalled(); // first press expands only
  });

  it('ArrowRight on an already-expanded node selects its first visible child', () => {
    const handleSelectNode = vi.fn();
    useStore.setState({ expandedNodes: { 1: true } });
    setSelection([1]);
    mountHook({ handleSelectNode });

    fireKey({ key: 'ArrowRight' });

    expect(handleSelectNode).toHaveBeenCalledWith(2); // h1 = first child
  });

  it('ArrowLeft on an expanded node collapses it', () => {
    const handleSelectNode = vi.fn();
    useStore.setState({ expandedNodes: { 1: true } });
    setSelection([1]);
    mountHook({ handleSelectNode });

    fireKey({ key: 'ArrowLeft' });

    expect(useStore.getState().expandedNodes[1]).toBeFalsy();
    expect(handleSelectNode).not.toHaveBeenCalled();
  });

  it('ArrowLeft on a collapsed node selects the parent', () => {
    const handleSelectNode = vi.fn();
    useStore.setState({ expandedNodes: { 1: true, 3: true } });
    setSelection([4]); // a li; parent is ul#3
    mountHook({ handleSelectNode });

    fireKey({ key: 'ArrowLeft' });

    expect(handleSelectNode).toHaveBeenCalledWith(3);
  });

  it('ignores arrows when nothing is selected', () => {
    const handleSelectNode = vi.fn();
    // selection cleared by resetStore baseline above
    useStore.setState({ selectedNodeIds: [], selectedNodeId: null });
    mountHook({ handleSelectNode });

    fireKey({ key: 'ArrowDown' });

    expect(handleSelectNode).not.toHaveBeenCalled();
  });

  it('ignores arrows while typing in an input (typing guard)', () => {
    const handleSelectNode = vi.fn();
    setSelection([2]);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    mountHook({ handleSelectNode });

    fireKey({ key: 'ArrowDown' });

    expect(handleSelectNode).not.toHaveBeenCalled();
  });
});

// ── Shift+Enter select parent ────────────────────────────────────────

describe('useKeyboard — Shift+Enter (select parent)', () => {
  beforeEach(() => {
    useStore.setState({ domTree: buildTree() });
  });

  it('selects the parent of the current node', () => {
    const handleSelectNode = vi.fn();
    setSelection([4]); // li, parent ul#3
    mountHook({ handleSelectNode });

    fireKey({ key: 'Enter', shift: true });

    expect(handleSelectNode).toHaveBeenCalledWith(3);
  });

  it('is ignored when a modifier (Cmd/Ctrl) is also held', () => {
    const handleSelectNode = vi.fn();
    setSelection([4]);
    mountHook({ handleSelectNode });

    fireKey({ key: 'Enter', shift: true, meta: true });

    expect(handleSelectNode).not.toHaveBeenCalled();
  });

  it('does nothing at the tree root (no parent to select)', () => {
    const handleSelectNode = vi.fn();
    setSelection([100]); // html root, path length 1
    mountHook({ handleSelectNode });

    fireKey({ key: 'Enter', shift: true });

    expect(handleSelectNode).not.toHaveBeenCalled();
  });
});

// ── Listener cleanup ─────────────────────────────────────────────────

describe('useKeyboard — cleanup', () => {
  it('removes its window listeners on unmount', () => {
    const deleteElement = vi.fn();
    setSelection([1]);
    const { unmount } = mountHook({ deleteElement });

    unmount();
    fireKey({ key: 'Delete' });

    expect(deleteElement).not.toHaveBeenCalled();
  });
});
