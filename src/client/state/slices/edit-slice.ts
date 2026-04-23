import { getElementById } from '../../bridge/dom-bridge';
import { detectComponent, getTracerInfo } from '../../bridge/component-bridge';

export interface Change {
  type: 'style' | 'attribute' | 'text' | 'dom' | 'prop';
  element?: string;
  path?: string;
  name?: string;
  value?: string;
  component?: string;
  source?: string;
}

/** Enrich a change with component/source from vue-tracer or framework detection. */
function enrichChange(change: Change, selectedNodeId: number | null): Change {
  if (change.component && change.source) return change;
  if (selectedNodeId === null) return change;
  const el = getElementById(selectedNodeId);
  if (!el) return change;

  // Try tracer first (vue-tracer or react data-source, exact file:line:column)
  const tracerInfo = getTracerInfo(el);
  if (tracerInfo) {
    return { ...change, source: change.source || tracerInfo.file };
  }

  // Fallback to framework detection
  const info = detectComponent(el);
  if (info) {
    return {
      ...change,
      component: change.component || info.name,
      source: change.source || info.sourceFile,
    };
  }

  return change;
}

export interface EditSlice {
  autoApply: boolean;
  editVersion: number;
  pendingChanges: Change[];
  pendingChangesCopied: boolean;
  stagedChanges: Change[];
  applying: boolean;
  hasEverHadChanges: boolean;

  setAutoApply: (autoApply: boolean) => void;
  queueEdit: (change: Change) => void;
  clearPendingChanges: () => void;
  clearStagedChanges: () => void;
  setApplying: (applying: boolean) => void;
}

/**
 * Merge consecutive changes to the same property.
 * If a change targets the same type/element/path/name as the last entry,
 * update the "from -> to" value instead of pushing a duplicate.
 * If the original and new values are identical, remove the entry entirely.
 */
export function coalesceOrPush(changes: Change[], change: Change): void {
  const last = changes[changes.length - 1];
  if (
    last &&
    last.type === change.type &&
    last.element === change.element &&
    last.path === change.path &&
    last.name === change.name
  ) {
    const fromValue = last.value?.split(' \u2192 ')[0];
    const toValue = change.value?.split(' \u2192 ')[1];
    if (fromValue !== undefined && toValue !== undefined) {
      if (fromValue === toValue) {
        changes.pop();
        return;
      }
      last.value = `${fromValue} \u2192 ${toValue}`;
    } else {
      last.value = change.value;
    }
  } else {
    changes.push(change);
  }
}

type ImmerSet = (fn: (state: EditSlice) => void) => void;

export const createEditSlice = (set: ImmerSet, _get: () => EditSlice): EditSlice => ({
  autoApply: false,
  editVersion: 0,
  pendingChanges: [],
  pendingChangesCopied: false,
  stagedChanges: [],
  applying: false,
  hasEverHadChanges: false,

  setAutoApply: (autoApply) =>
    set((state) => {
      state.autoApply = autoApply;
    }),

  queueEdit: (change) => {
    const fullState = _get() as EditSlice & { selectedNodeId?: number | null };
    const enriched = enrichChange(change, fullState.selectedNodeId ?? null);
    set((state) => {
      state.editVersion++;
      state.hasEverHadChanges = true;
      if (state.pendingChangesCopied) {
        state.pendingChanges = [];
        state.pendingChangesCopied = false;
      }
      coalesceOrPush(state.pendingChanges, enriched);
      coalesceOrPush(state.stagedChanges, enriched);
    });
  },

  clearPendingChanges: () =>
    set((state) => {
      state.pendingChangesCopied = true;
    }),

  clearStagedChanges: () =>
    set((state) => {
      state.stagedChanges = [];
    }),

  setApplying: (applying) =>
    set((state) => {
      state.applying = applying;
    }),
});
