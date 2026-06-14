import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyEditCommandPreview,
  commitEditCommand,
  commitEditCommands,
  createPropCommand,
  createStyleCommand,
  editCommandToChange,
  undoOpFromCommand,
} from './edit-command';
import { useStore } from '../state/store';
import { useUndoStore } from '../hooks/use-undo';
import { assignId } from '../bridge/dom-bridge';

beforeEach(() => {
  useStore.setState({
    editVersion: 0,
    pendingChanges: [],
    pendingChangesCopied: false,
    stagedChanges: [],
    hasEverHadChanges: false,
  });
  useUndoStore.setState({ past: [], future: [] });
  document.body.innerHTML = '';
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

describe('applyEditCommandPreview', () => {
  it('does nothing when nodeId is null', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const before = el.getAttribute('style');

    applyEditCommandPreview(createStyleCommand({
      nodeId: null,
      selector: 'div',
      property: 'color',
      oldValue: 'red',
      newValue: 'blue',
    }));

    expect(el.getAttribute('style')).toBe(before);
  });

  describe('style branch', () => {
    it('writes the new value to the element inline style and store', () => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      const id = assignId(el);

      // Seed a matching property so updateProperty mutates it.
      useStore.getState().setProperties([
        { name: 'color', value: 'red' },
      ]);

      applyEditCommandPreview(createStyleCommand({
        nodeId: id,
        selector: 'div',
        property: 'color',
        oldValue: 'red',
        newValue: 'blue',
      }));

      expect(el.style.getPropertyValue('color')).toBe('blue');
      expect(useStore.getState().properties).toEqual([{ name: 'color', value: 'blue' }]);
      expect(useStore.getState().computedStyles.color).toBe('blue');
    });

    it('coerces a nullish newValue to an empty string when setting inline style', () => {
      const el = document.createElement('div');
      el.style.setProperty('color', 'red');
      document.body.appendChild(el);
      const id = assignId(el);

      applyEditCommandPreview({
        kind: 'style',
        nodeId: id,
        property: 'color',
        oldValue: 'red',
        newValue: null,
      });

      // Setting a property to '' removes it from the inline style.
      expect(el.style.getPropertyValue('color')).toBe('');
    });

    it('is a no-op when the registered node is not an HTMLElement-backed id', () => {
      // An unregistered id resolves to undefined → branch skipped, no throw.
      expect(() => applyEditCommandPreview(createStyleCommand({
        nodeId: 999999,
        selector: 'div',
        property: 'color',
        oldValue: 'red',
        newValue: 'blue',
      }))).not.toThrow();
    });
  });

  describe('prop branch', () => {
    it('updates the selected component prop in the store', () => {
      const el = document.createElement('button');
      document.body.appendChild(el);
      const id = assignId(el);

      useStore.getState().setSelectedComponent({
        name: 'Button',
        source: 'src/Button.tsx',
        framework: 'react',
        isRoot: false,
        props: { label: 'Save' },
      });

      applyEditCommandPreview(createPropCommand({
        nodeId: id,
        selector: 'button',
        property: 'label',
        oldValue: 'Save',
        newValue: 'Publish',
      }));

      expect(useStore.getState().selectedComponent?.props.label).toBe('Publish');
    });

    it('updates the single text node when the children prop changes to a string', () => {
      const el = document.createElement('span');
      el.appendChild(document.createTextNode('Hello'));
      document.body.appendChild(el);
      const id = assignId(el);

      useStore.getState().setSelectedComponent({
        name: 'Label',
        source: 'src/Label.tsx',
        framework: 'react',
        isRoot: false,
        props: { children: 'Hello' },
      });

      applyEditCommandPreview(createPropCommand({
        nodeId: id,
        selector: 'span',
        property: 'children',
        oldValue: 'Hello',
        newValue: 'World',
      }));

      expect(el.textContent).toBe('World');
      expect(useStore.getState().selectedComponent?.props.children).toBe('World');
    });

    it('does NOT touch the DOM when children changes but element has multiple child nodes', () => {
      const el = document.createElement('div');
      el.innerHTML = '<b>a</b><b>b</b>';
      document.body.appendChild(el);
      const id = assignId(el);

      useStore.getState().setSelectedComponent({
        name: 'Wrap',
        source: 'src/Wrap.tsx',
        framework: 'react',
        isRoot: false,
        props: { children: 'x' },
      });

      applyEditCommandPreview(createPropCommand({
        nodeId: id,
        selector: 'div',
        property: 'children',
        oldValue: 'x',
        newValue: 'y',
      }));

      // DOM is untouched (guard: not a single text node).
      expect(el.innerHTML).toBe('<b>a</b><b>b</b>');
      // ...but the store prop is still updated.
      expect(useStore.getState().selectedComponent?.props.children).toBe('y');
    });

    it('does not touch the DOM for non-children props', () => {
      const el = document.createElement('span');
      el.appendChild(document.createTextNode('Hello'));
      document.body.appendChild(el);
      const id = assignId(el);

      useStore.getState().setSelectedComponent({
        name: 'Label',
        source: 'src/Label.tsx',
        framework: 'react',
        isRoot: false,
        props: { title: 'Hi', children: 'Hello' },
      });

      applyEditCommandPreview(createPropCommand({
        nodeId: id,
        selector: 'span',
        property: 'title',
        oldValue: 'Hi',
        newValue: 'Bye',
      }));

      expect(el.textContent).toBe('Hello');
    });
  });
});
