import { beforeEach, describe, expect, it } from 'vitest';
import {
  commitEditCommand,
  commitEditCommands,
  createPropCommand,
  createStyleCommand,
  editCommandToChange,
  undoOpFromCommand,
} from './edit-command';
import { useStore } from '../state/store';
import { useUndoStore } from '../hooks/use-undo';

beforeEach(() => {
  useStore.setState({
    editVersion: 0,
    pendingChanges: [],
    pendingChangesCopied: false,
    stagedChanges: [],
    hasEverHadChanges: false,
  });
  useUndoStore.setState({ past: [], future: [] });
});

describe('EditCommand serialization', () => {
  it('serializes style commands to the current queueEdit wire shape', () => {
    const command = createStyleCommand({
      nodeId: 7,
      selector: 'button#save',
      property: 'padding-top',
      oldValue: '4px',
      newValue: '8px',
    });

    expect(editCommandToChange(command)).toEqual({
      type: 'style',
      element: 'button#save',
      name: 'padding-top',
      value: '4px \u2192 8px',
    });
    expect(undoOpFromCommand(command)).toEqual({
      type: 'style',
      nodeId: 7,
      property: 'padding-top',
      oldValue: '4px',
      newValue: '8px',
    });
  });

  it('serializes prop commands with component source metadata', () => {
    const command = createPropCommand({
      nodeId: 3,
      selector: 'button',
      component: 'Button',
      source: 'src/Button.tsx:10',
      property: 'label',
      oldValue: 'Save',
      newValue: 'Publish',
    });

    expect(editCommandToChange(command)).toEqual({
      type: 'prop',
      element: 'button',
      component: 'Button',
      source: 'src/Button.tsx:10',
      name: 'label',
      value: 'Save \u2192 Publish',
    });
    expect(undoOpFromCommand(command)).toEqual({
      type: 'prop',
      nodeId: 3,
      property: 'label',
      oldValue: 'Save',
      newValue: 'Publish',
    });
  });
});

describe('EditCommand commit', () => {
  it('queues one edit and one undo entry when a drag style value changed', () => {
    const committed = commitEditCommand(createStyleCommand({
      nodeId: 1,
      selector: 'div',
      property: 'gap',
      oldValue: '8px',
      newValue: '12px',
    }));

    expect(committed).toBe(true);
    expect(useStore.getState().stagedChanges).toEqual([
      { type: 'style', element: 'div', name: 'gap', value: '8px \u2192 12px' },
    ]);
    expect(useUndoStore.getState().past).toEqual([
      { type: 'style', nodeId: 1, property: 'gap', oldValue: '8px', newValue: '12px' },
    ]);
  });

  it('does not queue or push undo when a drag style value is unchanged', () => {
    const committed = commitEditCommand(createStyleCommand({
      nodeId: 1,
      selector: 'div',
      property: 'gap',
      oldValue: '8px',
      newValue: '8px',
    }));

    expect(committed).toBe(false);
    expect(useStore.getState().stagedChanges).toEqual([]);
    expect(useUndoStore.getState().past).toEqual([]);
  });

  it('batches multiple drag style changes into one undo entry', () => {
    const count = commitEditCommands([
      createStyleCommand({
        nodeId: 1,
        selector: 'div',
        property: 'margin-left',
        oldValue: '4px',
        newValue: '8px',
      }),
      createStyleCommand({
        nodeId: 1,
        selector: 'div',
        property: 'margin-right',
        oldValue: '4px',
        newValue: '8px',
      }),
    ]);

    expect(count).toBe(2);
    expect(useStore.getState().stagedChanges).toHaveLength(2);
    expect(useUndoStore.getState().past).toEqual([
      {
        type: 'batch',
        operations: [
          { type: 'style', nodeId: 1, property: 'margin-left', oldValue: '4px', newValue: '8px' },
          { type: 'style', nodeId: 1, property: 'margin-right', oldValue: '4px', newValue: '8px' },
        ],
      },
    ]);
  });
});
