import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { applyUndoEntry } from './use-apply-undo';
import { assignId, getElementById } from '../bridge/dom-bridge';
import { useStore } from '../state/store';
import type { UndoOp } from './use-undo';

// ----------------------------------------------------------------------------
// Characterization tests for applyUndoEntry(entry, direction).
//
// `applyUndoEntry` is a plain function — no render needed. We build real jsdom
// elements, register them with the dom-bridge via `assignId` (mirroring
// edit-command.test.ts) so `getElementById` resolves, then assert the live-DOM
// + store mutations for one forward (redo) and one undo direction per op type.
// ----------------------------------------------------------------------------

// jsdom does not implement scrollIntoView; dom-bridge.scrollElementIntoView
// calls it via selectAndFetchStyles after structural ops. Stub it so the
// real code path runs without throwing.
beforeEach(() => {
  if (typeof Element.prototype.scrollIntoView !== 'function') {
    Element.prototype.scrollIntoView = function () {};
  }
  document.body.innerHTML = '';
  // Reset the store slices these ops touch.
  useStore.setState({
    selectedNodeIds: [],
    selectedNodeId: null,
    properties: [],
    computedStyles: {},
    selectedComponent: null,
    domTree: null,
  });
});

afterEach(() => {
  document.body.innerHTML = '';
});

function mount<T extends HTMLElement>(el: T): { el: T; id: number } {
  document.body.appendChild(el);
  return { el, id: assignId(el) };
}

describe('applyUndoEntry — style', () => {
  it('redo writes newValue, undo writes oldValue to inline style + store', () => {
    const { el, id } = mount(document.createElement('div'));
    el.style.setProperty('color', 'red');
    useStore.getState().setProperties([{ name: 'color', value: 'red' }]);

    const entry: UndoOp = {
      type: 'style', nodeId: id, property: 'color', oldValue: 'red', newValue: 'blue',
    };

    applyUndoEntry(entry, 'redo');
    expect(el.style.getPropertyValue('color')).toBe('blue');
    expect(useStore.getState().computedStyles.color).toBe('blue');

    applyUndoEntry(entry, 'undo');
    expect(el.style.getPropertyValue('color')).toBe('red');
    expect(useStore.getState().computedStyles.color).toBe('red');
  });

  it('is a no-op when the node id does not resolve', () => {
    expect(() =>
      applyUndoEntry(
        { type: 'style', nodeId: 999999, property: 'color', oldValue: 'a', newValue: 'b' },
        'redo',
      ),
    ).not.toThrow();
  });
});

describe('applyUndoEntry — attribute', () => {
  it('redo sets the new attribute value, undo sets the old value', () => {
    const { el, id } = mount(document.createElement('div'));
    el.setAttribute('data-role', 'old');

    const entry: UndoOp = {
      type: 'attribute', nodeId: id, property: 'data-role', oldValue: 'old', newValue: 'new',
    };

    applyUndoEntry(entry, 'redo');
    expect(el.getAttribute('data-role')).toBe('new');

    applyUndoEntry(entry, 'undo');
    expect(el.getAttribute('data-role')).toBe('old');
  });
});

describe('applyUndoEntry — attribute-delete', () => {
  it('redo removes the attribute, undo restores the old value', () => {
    const { el, id } = mount(document.createElement('div'));
    el.setAttribute('data-x', 'keep');

    const entry: UndoOp = {
      type: 'attribute-delete', nodeId: id, property: 'data-x', oldValue: 'keep',
    };

    applyUndoEntry(entry, 'redo');
    expect(el.hasAttribute('data-x')).toBe(false);

    applyUndoEntry(entry, 'undo');
    expect(el.getAttribute('data-x')).toBe('keep');
  });
});

describe('applyUndoEntry — text', () => {
  it('redo sets the first text node to newValue, undo to oldValue', () => {
    const el = document.createElement('p');
    el.appendChild(document.createTextNode('hello'));
    const { id } = mount(el);

    const entry: UndoOp = {
      type: 'text', nodeId: id, oldValue: 'hello', newValue: 'world',
    };

    applyUndoEntry(entry, 'redo');
    expect(el.textContent).toBe('world');

    applyUndoEntry(entry, 'undo');
    expect(el.textContent).toBe('hello');
  });

  it('clears trailing text nodes, keeping only the first', () => {
    const el = document.createElement('p');
    el.appendChild(document.createTextNode('a'));
    el.appendChild(document.createTextNode('b'));
    const { id } = mount(el);

    applyUndoEntry({ type: 'text', nodeId: id, oldValue: 'a', newValue: 'z' }, 'redo');

    const textNodes = Array.from(el.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE);
    expect(textNodes[0].textContent).toBe('z');
    expect(textNodes[1].textContent).toBe('');
  });
});

describe('applyUndoEntry — prop', () => {
  it('reverts the in-memory prop snapshot via updateSelectedProp', () => {
    const { id } = mount(document.createElement('button'));
    useStore.getState().setSelectedComponent({
      name: 'Button', source: 'src/Button.tsx', framework: 'react', isRoot: false,
      props: { label: 'New' },
    });

    const entry: UndoOp = {
      type: 'prop', nodeId: id, property: 'label', oldValue: 'Old', newValue: 'New',
    };

    applyUndoEntry(entry, 'undo');
    expect(useStore.getState().selectedComponent?.props.label).toBe('Old');

    applyUndoEntry(entry, 'redo');
    expect(useStore.getState().selectedComponent?.props.label).toBe('New');
  });

  it('patches a lone text-node child when the children prop is reverted', () => {
    const el = document.createElement('span');
    el.appendChild(document.createTextNode('New'));
    const { id } = mount(el);
    useStore.getState().setSelectedComponent({
      name: 'Label', source: 'src/Label.tsx', framework: 'react', isRoot: false,
      props: { children: 'New' },
    });

    applyUndoEntry(
      { type: 'prop', nodeId: id, property: 'children', oldValue: 'Old', newValue: 'New' },
      'undo',
    );

    expect(el.firstChild?.nodeValue).toBe('Old');
    expect(useStore.getState().selectedComponent?.props.children).toBe('Old');
  });

  it('does NOT patch the DOM for children when there are multiple child nodes', () => {
    const el = document.createElement('div');
    el.innerHTML = '<b>a</b><b>b</b>';
    const { id } = mount(el);
    useStore.getState().setSelectedComponent({
      name: 'Wrap', source: 'src/Wrap.tsx', framework: 'react', isRoot: false,
      props: { children: 'New' },
    });

    applyUndoEntry(
      { type: 'prop', nodeId: id, property: 'children', oldValue: 'Old', newValue: 'New' },
      'undo',
    );

    expect(el.innerHTML).toBe('<b>a</b><b>b</b>');
    expect(useStore.getState().selectedComponent?.props.children).toBe('Old');
  });
});

describe('applyUndoEntry — dom/delete', () => {
  it('redo removes the element; undo restores it from the html snapshot', () => {
    const parent = document.createElement('section');
    const child = document.createElement('span');
    child.textContent = 'gone';
    parent.appendChild(child);
    document.body.appendChild(parent);
    const parentId = assignId(parent);
    const childId = assignId(child);

    const entry: UndoOp = {
      type: 'dom', action: 'delete', nodeId: childId,
      parentId, siblingId: null, html: child.outerHTML,
    };

    applyUndoEntry(entry, 'redo');
    expect(parent.querySelector('span')).toBeNull();

    applyUndoEntry(entry, 'undo');
    const restored = parent.querySelector('span');
    expect(restored).not.toBeNull();
    expect(restored?.textContent).toBe('gone');
    // The restored element gets a fresh id written back onto the entry.
    expect(typeof entry.nodeId).toBe('number');
    expect(getElementById(entry.nodeId!)).toBe(restored);
  });

  it('restores before the recorded sibling', () => {
    const parent = document.createElement('section');
    const a = document.createElement('a');
    parent.appendChild(a);
    document.body.appendChild(parent);
    const parentId = assignId(parent);
    const siblingId = assignId(a);

    const entry: UndoOp = {
      type: 'dom', action: 'delete', nodeId: 0,
      parentId, siblingId, html: '<b>restored</b>',
    };

    applyUndoEntry(entry, 'undo');
    expect(parent.firstElementChild?.tagName.toLowerCase()).toBe('b');
    expect(parent.children[1]).toBe(a);
  });
});

describe('applyUndoEntry — dom/duplicate', () => {
  it('redo inserts a clone after the original; undo removes the clone', () => {
    const parent = document.createElement('section');
    const orig = document.createElement('p');
    orig.textContent = 'dup-me';
    parent.appendChild(orig);
    document.body.appendChild(parent);
    const origId = assignId(orig);

    const entry: UndoOp = { type: 'dom', action: 'duplicate', nodeId: origId };

    applyUndoEntry(entry, 'redo');
    expect(parent.querySelectorAll('p')).toHaveLength(2);
    expect(typeof entry.newNodeId).toBe('number');

    applyUndoEntry(entry, 'undo');
    expect(parent.querySelectorAll('p')).toHaveLength(1);
  });
});

describe('applyUndoEntry — dom/add', () => {
  it('redo appends a new div child; undo removes it', () => {
    const parent = document.createElement('section');
    document.body.appendChild(parent);
    const parentId = assignId(parent);

    const entry: UndoOp = { type: 'dom', action: 'add', parentId };

    applyUndoEntry(entry, 'redo');
    expect(parent.children).toHaveLength(1);
    expect(parent.firstElementChild?.tagName.toLowerCase()).toBe('div');
    expect(typeof entry.nodeId).toBe('number');

    applyUndoEntry(entry, 'undo');
    expect(parent.children).toHaveLength(0);
  });

  it('redo inserts after the sibling anchor when siblingId is set', () => {
    const parent = document.createElement('section');
    const a = document.createElement('a');
    parent.appendChild(a);
    document.body.appendChild(parent);
    const parentId = assignId(parent);
    const siblingId = assignId(a);

    applyUndoEntry({ type: 'dom', action: 'add', parentId, siblingId }, 'redo');

    // New div is inserted immediately AFTER the sibling anchor.
    expect(parent.children[0]).toBe(a);
    expect(parent.children[1]?.tagName.toLowerCase()).toBe('div');
  });
});

describe('applyUndoEntry — dom/move', () => {
  it('redo moves under the new parent/sibling; undo moves back to the old anchor', () => {
    const root = document.createElement('div');
    const oldParent = document.createElement('section');
    const newParent = document.createElement('aside');
    const mover = document.createElement('span');
    const oldSibling = document.createElement('i'); // mover's next sibling in oldParent
    oldParent.appendChild(mover);
    oldParent.appendChild(oldSibling);
    root.appendChild(oldParent);
    root.appendChild(newParent);
    document.body.appendChild(root);

    const moverId = assignId(mover);
    const oldParentId = assignId(oldParent);
    const oldSiblingId = assignId(oldSibling);
    const newParentId = assignId(newParent);

    const entry: UndoOp = {
      type: 'dom', action: 'move', nodeId: moverId,
      oldParentId, oldSiblingId, newParentId, newSiblingId: null,
    };

    applyUndoEntry(entry, 'redo');
    expect(mover.parentElement).toBe(newParent);

    applyUndoEntry(entry, 'undo');
    expect(mover.parentElement).toBe(oldParent);
    // Restored before its old next-sibling.
    expect(mover.nextElementSibling).toBe(oldSibling);
  });
});

describe('applyUndoEntry — dom/tag-change', () => {
  it('redo swaps to newTag; undo swaps back to oldTag, preserving attrs', () => {
    const el = document.createElement('div');
    el.setAttribute('data-keep', '1');
    el.style.color = 'red';
    el.textContent = 'content';
    document.body.appendChild(el);
    const id = assignId(el);

    const entry: UndoOp = {
      type: 'dom', action: 'tag-change', nodeId: id, oldTag: 'div', newTag: 'section',
    };

    applyUndoEntry(entry, 'redo');
    let current = getElementById(entry.nodeId!)!;
    expect(current.tagName.toLowerCase()).toBe('section');
    expect(current.getAttribute('data-keep')).toBe('1');
    expect(current.textContent).toBe('content');

    applyUndoEntry(entry, 'undo');
    current = getElementById(entry.nodeId!)!;
    expect(current.tagName.toLowerCase()).toBe('div');
    expect(current.getAttribute('data-keep')).toBe('1');
  });
});

describe('applyUndoEntry — batch', () => {
  it('applies child ops in order on redo and in REVERSE order on undo', () => {
    const { el: a, id: aId } = mount(document.createElement('div'));
    const { el: b } = mount(document.createElement('div'));
    a.style.setProperty('color', 'red');
    b.style.setProperty('color', 'red');

    // Two contradictory ops on the SAME node+property: the last one applied
    // wins, so the final value reveals the application order. Values must be
    // valid CSS or jsdom's setProperty rejects them.
    const entry: UndoOp = {
      type: 'batch',
      operations: [
        { type: 'style', nodeId: aId, property: 'color', oldValue: 'red', newValue: 'green' },
        { type: 'style', nodeId: aId, property: 'color', oldValue: 'green', newValue: 'blue' },
      ],
    };

    // Redo applies in array order: op0 (->green) then op1 (->blue) => 'blue'.
    applyUndoEntry(entry, 'redo');
    expect(a.style.getPropertyValue('color')).toBe('blue');

    // Undo applies REVERSED: op1 first (->green) then op0 (->red) => 'red'.
    applyUndoEntry(entry, 'undo');
    expect(a.style.getPropertyValue('color')).toBe('red');

    // b untouched by this batch.
    expect(b.style.getPropertyValue('color')).toBe('red');
  });

  it('applies each distinct op exactly once across nodes', () => {
    const { el: a, id: aId } = mount(document.createElement('div'));
    const { el: b, id: bId } = mount(document.createElement('div'));

    const entry: UndoOp = {
      type: 'batch',
      operations: [
        { type: 'style', nodeId: aId, property: 'width', oldValue: '', newValue: '10px' },
        { type: 'style', nodeId: bId, property: 'height', oldValue: '', newValue: '20px' },
      ],
    };

    applyUndoEntry(entry, 'redo');
    expect(a.style.getPropertyValue('width')).toBe('10px');
    expect(b.style.getPropertyValue('height')).toBe('20px');
  });
});
