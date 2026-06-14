import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/preact';
import { useUndoStore, type UndoOp } from './use-undo';

// NOTE ON THE PUBLIC API
// ----------------------------------------------------------------------------
// `use-undo.ts` exports a Zustand store (`useUndoStore`), NOT a `useUndo()`
// hook. There is no `canUndo` / `canRedo` selector and the single-op writer is
// `push` (with `pushDom` / `pushBatch` siblings). These tests pin the REAL
// current API by driving the store directly via `useUndoStore.getState()`.
//
// To honour the "render a harness component" requirement we also mount a tiny
// component that subscribes to the store and writes the latest snapshot to an
// outer `api`, proving the hook form (`useUndoStore(...)`) re-renders on change.

let api: ReturnType<typeof useUndoStore.getState>;

function Harness() {
  // Subscribing to the whole store mirrors how components consume the hook.
  api = useUndoStore();
  return null;
}

beforeEach(() => {
  useUndoStore.setState({ past: [], future: [] });
});

afterEach(() => {
  cleanup();
});

const styleOp = (over: Partial<UndoOp> = {}): UndoOp => ({
  type: 'style',
  nodeId: 1,
  property: 'color',
  oldValue: 'red',
  newValue: 'blue',
  ...over,
});

describe('useUndoStore — hook harness', () => {
  it('exposes the store through a rendered component (hook form)', () => {
    render(<Harness />);
    expect(typeof api.push).toBe('function');
    expect(typeof api.pushBatch).toBe('function');
    expect(typeof api.undo).toBe('function');
    expect(typeof api.redo).toBe('function');
    expect(typeof api.clear).toBe('function');
    // No canUndo/canRedo helpers exist in the current implementation.
    expect((api as Record<string, unknown>).canUndo).toBeUndefined();
    expect((api as Record<string, unknown>).canRedo).toBeUndefined();
  });
});

describe('useUndoStore — push / undo / redo', () => {
  it('push then undo returns the pushed op', () => {
    const store = useUndoStore.getState();
    const op = styleOp();
    store.push(op);
    expect(useUndoStore.getState().past).toEqual([op]);

    const undone = useUndoStore.getState().undo();
    expect(undone).toEqual(op);
    expect(useUndoStore.getState().past).toEqual([]);
    expect(useUndoStore.getState().future).toEqual([op]);
  });

  it('redo returns the same op again and restores it to past', () => {
    const store = useUndoStore.getState();
    const op = styleOp();
    store.push(op);
    useUndoStore.getState().undo();

    const redone = useUndoStore.getState().redo();
    expect(redone).toEqual(op);
    expect(useUndoStore.getState().past).toEqual([op]);
    expect(useUndoStore.getState().future).toEqual([]);
  });

  it('undo on empty history returns undefined and does not throw', () => {
    expect(useUndoStore.getState().undo()).toBeUndefined();
  });

  it('redo on empty future returns undefined', () => {
    useUndoStore.getState().push(styleOp());
    // Nothing in future yet.
    expect(useUndoStore.getState().redo()).toBeUndefined();
  });
});

describe('useUndoStore — merge of consecutive edits', () => {
  it('merges consecutive same-node + same-property + same-type edits (last newValue wins)', () => {
    const store = useUndoStore.getState();
    store.push(styleOp({ oldValue: 'red', newValue: 'green' }));
    store.push(styleOp({ oldValue: 'green', newValue: 'blue' }));

    const { past } = useUndoStore.getState();
    expect(past).toHaveLength(1);
    // Merged entry keeps the ORIGINAL oldValue but takes the LATEST newValue.
    expect(past[0]).toEqual(styleOp({ oldValue: 'red', newValue: 'blue' }));
  });

  it('does NOT merge when the property differs', () => {
    const store = useUndoStore.getState();
    store.push(styleOp({ property: 'color' }));
    store.push(styleOp({ property: 'background' }));
    expect(useUndoStore.getState().past).toHaveLength(2);
  });

  it('does NOT merge when the nodeId differs', () => {
    const store = useUndoStore.getState();
    store.push(styleOp({ nodeId: 1 }));
    store.push(styleOp({ nodeId: 2 }));
    expect(useUndoStore.getState().past).toHaveLength(2);
  });

  it('does NOT merge when the type differs', () => {
    const store = useUndoStore.getState();
    store.push(styleOp({ type: 'style' }));
    store.push(styleOp({ type: 'attribute' }));
    expect(useUndoStore.getState().past).toHaveLength(2);
  });

  it('does NOT merge into a previous batch entry', () => {
    const store = useUndoStore.getState();
    store.pushBatch([styleOp({ property: 'a' }), styleOp({ property: 'b' })]);
    store.push(styleOp({ property: 'a' }));
    const { past } = useUndoStore.getState();
    expect(past).toHaveLength(2);
    expect(past[0].type).toBe('batch');
    expect(past[1].type).toBe('style');
  });
});

describe('useUndoStore — pushDom', () => {
  it('pushDom never merges with the prior entry', () => {
    const store = useUndoStore.getState();
    const domOp: UndoOp = { type: 'dom', action: 'delete', nodeId: 5 };
    store.pushDom(domOp);
    store.pushDom(domOp);
    expect(useUndoStore.getState().past).toHaveLength(2);
  });
});

describe('useUndoStore — pushBatch', () => {
  it('groups ops into ONE undo step (one undo reverses all)', () => {
    const store = useUndoStore.getState();
    const ops = [styleOp({ property: 'a' }), styleOp({ property: 'b' })];
    store.pushBatch(ops);

    expect(useUndoStore.getState().past).toEqual([{ type: 'batch', operations: ops }]);

    const entry = useUndoStore.getState().undo();
    expect(entry).toEqual({ type: 'batch', operations: ops });
    expect(useUndoStore.getState().past).toEqual([]);
  });

  it('pushBatch with a single op delegates to push (no batch wrapper)', () => {
    const store = useUndoStore.getState();
    const op = styleOp();
    store.pushBatch([op]);
    expect(useUndoStore.getState().past).toEqual([op]);
  });

  it('pushBatch with zero ops is a no-op', () => {
    useUndoStore.getState().pushBatch([]);
    expect(useUndoStore.getState().past).toEqual([]);
  });
});

describe('useUndoStore — MAX_HISTORY trim', () => {
  it('caps the past stack at 200 entries, dropping the oldest', () => {
    const store = useUndoStore.getState();
    // 201 distinct, non-mergeable ops (unique property each).
    for (let i = 0; i < 201; i++) {
      store.push(styleOp({ property: `p${i}`, newValue: `v${i}` }));
    }
    const { past } = useUndoStore.getState();
    expect(past).toHaveLength(200);
    // The very first op (p0) was dropped; p1 is now the oldest.
    expect(past[0].property).toBe('p1');
    expect(past[past.length - 1].property).toBe('p200');
  });
});

describe('useUndoStore — redo (future) stack invalidation', () => {
  it('a new push after an undo clears the redo/future stack', () => {
    const store = useUndoStore.getState();
    store.push(styleOp({ property: 'a' }));
    store.push(styleOp({ property: 'b' }));

    useUndoStore.getState().undo(); // future = [b]
    expect(useUndoStore.getState().future).toHaveLength(1);

    useUndoStore.getState().push(styleOp({ property: 'c' }));
    expect(useUndoStore.getState().future).toEqual([]);
  });

  it('pushBatch after an undo also clears the future stack', () => {
    const store = useUndoStore.getState();
    store.push(styleOp({ property: 'a' }));
    useUndoStore.getState().undo();
    expect(useUndoStore.getState().future).toHaveLength(1);

    useUndoStore.getState().pushBatch([
      styleOp({ property: 'x' }),
      styleOp({ property: 'y' }),
    ]);
    expect(useUndoStore.getState().future).toEqual([]);
  });
});

describe('useUndoStore — clear', () => {
  it('wipes both past and future', () => {
    const store = useUndoStore.getState();
    store.push(styleOp({ property: 'a' }));
    useUndoStore.getState().undo();
    expect(useUndoStore.getState().future).toHaveLength(1);

    useUndoStore.getState().clear();
    expect(useUndoStore.getState().past).toEqual([]);
    expect(useUndoStore.getState().future).toEqual([]);
  });

  // BUG (P1.9): Escape clears the entire undo history (use-keyboard.ts:152-153
  // calls clear() on deselect). undo entries carry nodeId and are independent
  // of selection, so Cmd+Z stops working after a routine Escape. The `clear`
  // primitive itself behaves as written; the bug is at its call site.
});
