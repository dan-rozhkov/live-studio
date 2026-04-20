import { create } from 'zustand';

/**
 * A single undoable operation.
 * - style/text/attribute/attribute-delete/token: property-level change
 * - dom: structural DOM mutation (add/delete/duplicate/move/tag-change)
 * - batch: groups multiple operations into one undo step
 */
export interface UndoOp {
  type: 'style' | 'text' | 'attribute' | 'attribute-delete' | 'token' | 'dom' | 'batch';
  nodeId?: number | null;
  property?: string;
  oldValue?: string;
  newValue?: string;
  /** DOM operation specifics */
  action?: 'add' | 'delete' | 'duplicate' | 'move' | 'tag-change';
  parentId?: number;
  siblingId?: number | null;
  html?: string;
  newNodeId?: number;
  oldTag?: string;
  newTag?: string;
  /** Move operation specifics: parent + next-sibling anchor before and after the move. */
  oldParentId?: number;
  oldSiblingId?: number | null;
  newParentId?: number;
  newSiblingId?: number | null;
  /** Batch of operations grouped as a single undo entry */
  operations?: UndoOp[];
}

export type UndoDirection = 'undo' | 'redo';

interface UndoState {
  past: UndoOp[];
  future: UndoOp[];
  /**
   * Push a single property-level operation.
   * Consecutive changes to the same property are merged (last-wins).
   */
  push: (op: UndoOp) => void;
  /** Push a DOM-level operation (never merged with prior entries). */
  pushDom: (op: UndoOp) => void;
  /** Push several operations as a single batch undo entry. */
  pushBatch: (ops: UndoOp[]) => void;
  /** Pop the most recent entry and move it to `future`. Returns the entry or undefined. */
  undo: () => UndoOp | undefined;
  /** Pop the next entry from `future` and move it back to `past`. Returns the entry or undefined. */
  redo: () => UndoOp | undefined;
  /** Wipe entire history. */
  clear: () => void;
}

const MAX_HISTORY = 200;

function trimPast(past: UndoOp[]): UndoOp[] {
  return past.length > MAX_HISTORY ? past.slice(past.length - MAX_HISTORY) : past;
}

export const useUndoStore = create<UndoState>()((set, get) => ({
  past: [],
  future: [],

  push: (op) => {
    const { past } = get();
    const last = past[past.length - 1];
    // Merge consecutive changes to the same property on the same node
    if (
      last &&
      last.type !== 'batch' &&
      last.type === op.type &&
      last.nodeId === op.nodeId &&
      last.property === op.property
    ) {
      const merged: UndoOp = { ...last, newValue: op.newValue };
      set({
        past: [...past.slice(0, -1), merged],
        future: [],
      });
    } else {
      set({
        past: trimPast([...past, op]),
        future: [],
      });
    }
  },

  pushDom: (op) => {
    const { past } = get();
    set({
      past: trimPast([...past, op]),
      future: [],
    });
  },

  pushBatch: (ops) => {
    if (ops.length === 0) return;
    if (ops.length === 1) {
      get().push(ops[0]);
      return;
    }
    const { past } = get();
    set({
      past: trimPast([...past, { type: 'batch', operations: ops }]),
      future: [],
    });
  },

  undo: () => {
    const { past, future } = get();
    if (past.length === 0) return undefined;
    const entry = past[past.length - 1];
    set({
      past: past.slice(0, -1),
      future: [entry, ...future],
    });
    return entry;
  },

  redo: () => {
    const { past, future } = get();
    if (future.length === 0) return undefined;
    const entry = future[0];
    set({
      past: [...past, entry],
      future: future.slice(1),
    });
    return entry;
  },

  clear: () => set({ past: [], future: [] }),
}));
