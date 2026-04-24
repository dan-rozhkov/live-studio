import { getElementById } from '../bridge/dom-bridge';
import { useUndoStore, type UndoOp } from '../hooks/use-undo';
import { useStore } from '../state/store';
import type { Change } from '../state/slices/edit-slice';

export type EditCommandKind = 'style' | 'prop';

export interface EditCommand {
  kind: EditCommandKind;
  nodeId?: number | null;
  property: string;
  oldValue: unknown;
  newValue: unknown;
  selector?: string;
  source?: string;
  component?: string;
}

export function createStyleCommand(input: {
  nodeId?: number | null;
  property: string;
  oldValue: string;
  newValue: string;
  selector?: string;
}): EditCommand {
  return { kind: 'style', ...input };
}

export function createPropCommand(input: {
  nodeId?: number | null;
  property: string;
  oldValue: unknown;
  newValue: unknown;
  selector?: string;
  source?: string;
  component?: string;
}): EditCommand {
  return { kind: 'prop', ...input };
}

export function editCommandToChange(command: EditCommand): Change {
  const oldValue = String(command.oldValue ?? '');
  const newValue = String(command.newValue ?? '');

  if (command.kind === 'style') {
    return {
      type: 'style',
      element: command.selector,
      name: command.property,
      value: `${oldValue} \u2192 ${newValue}`,
    };
  }

  return {
    type: 'prop',
    element: command.selector,
    component: command.component,
    source: command.source,
    name: command.property,
    value: `${oldValue} \u2192 ${newValue}`,
  };
}

export function undoOpFromCommand(command: EditCommand): UndoOp {
  return {
    type: command.kind,
    nodeId: command.nodeId,
    property: command.property,
    oldValue: String(command.oldValue ?? ''),
    newValue: String(command.newValue ?? ''),
  };
}

export function applyEditCommandPreview(command: EditCommand): void {
  if (command.nodeId == null) return;

  if (command.kind === 'style') {
    const el = getElementById(command.nodeId);
    if (el instanceof HTMLElement) {
      el.style.setProperty(command.property, String(command.newValue ?? ''));
      useStore.getState().updateProperty(command.property, String(command.newValue ?? ''));
    }
    return;
  }

  useStore.getState().updateSelectedProp(command.property, command.newValue);
  if (command.property !== 'children' || typeof command.newValue !== 'string') return;

  const el = getElementById(command.nodeId);
  if (el && el.childNodes.length === 1 && el.firstChild?.nodeType === Node.TEXT_NODE) {
    el.firstChild.nodeValue = command.newValue;
  }
}

export function commitEditCommand(command: EditCommand): boolean {
  if (command.oldValue === command.newValue) return false;

  useStore.getState().queueEdit(editCommandToChange(command));
  useUndoStore.getState().push(undoOpFromCommand(command));
  return true;
}

export function commitEditCommands(commands: EditCommand[]): number {
  const changed = commands.filter((command) => command.oldValue !== command.newValue);
  if (changed.length === 0) return 0;

  const store = useStore.getState();
  for (const command of changed) {
    store.queueEdit(editCommandToChange(command));
  }

  const undoOps = changed.map(undoOpFromCommand);
  if (undoOps.length === 1) useUndoStore.getState().push(undoOps[0]);
  else useUndoStore.getState().pushBatch(undoOps);

  return changed.length;
}
