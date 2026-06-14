import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  detectReactComponent,
  detectVueComponent,
  detectComponent,
  getTracerInfo,
  getVueTracerInfo,
  getReactTracerInfo,
  extractReactProps,
  extractVueProps,
  extractComponentProps,
} from './component-bridge';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/**
 * Attach a fabricated React fiber to a DOM element under the
 * `__reactFiber$<rand>` key the source looks for. Returns the element.
 */
function attachReactFiber(el: Element, fiber: any): Element {
  (el as any)['__reactFiber$abc123'] = fiber;
  return el;
}

/** Build a minimal fiber node. `type` may be a string (host) or a component fn/obj. */
function fiber(opts: {
  type?: any;
  return?: any;
  memoizedProps?: any;
  _debugSource?: any;
  _debugOwner?: any;
}): any {
  return {
    type: opts.type,
    return: opts.return ?? null,
    memoizedProps: opts.memoizedProps,
    _debugSource: opts._debugSource,
    _debugOwner: opts._debugOwner,
  };
}

/** A named React component "type" (function with .name / .displayName). */
function componentType(name: string, displayName?: string): any {
  const fn = function () {};
  Object.defineProperty(fn, 'name', { value: name });
  if (displayName) (fn as any).displayName = displayName;
  return fn;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  delete (globalThis as any).__vue_tracer__;
});

afterEach(() => {
  delete (globalThis as any).__vue_tracer__;
});

// ===========================================================================
// findUserComponentFiber (exercised via extractReactProps)
// ===========================================================================

describe('findUserComponentFiber (via extractReactProps)', () => {
  it('skips generic wrappers (Memo, ForwardRef) and returns the user component', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    // chain (walking via `return`): host div -> Memo -> ForwardRef -> Button
    const buttonFiber = fiber({
      type: componentType('Button'),
      memoizedProps: { label: 'Click' },
    });
    const forwardRefFiber = fiber({
      type: componentType('ForwardRef'),
      return: buttonFiber,
    });
    const memoFiber = fiber({
      type: componentType('Memo'),
      return: forwardRefFiber,
    });
    const hostFiber = fiber({ type: 'div', return: memoFiber });

    attachReactFiber(el, hostFiber);

    const result = extractReactProps(el);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Button');
    expect(result!.framework).toBe('react');
    expect(result!.props).toEqual({ label: 'Click' });
  });

  it('returns null when chain contains only generic wrappers (no user component)', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    const memoFiber = fiber({ type: componentType('Memo') });
    const forwardRefFiber = fiber({ type: componentType('ForwardRef'), return: memoFiber });
    const hostFiber = fiber({ type: 'span', return: forwardRefFiber });
    attachReactFiber(el, hostFiber);

    expect(extractReactProps(el)).toBeNull();
  });

  it('returns null when chain has no component fibers at all (only host strings)', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const parentHost = fiber({ type: 'section' });
    const hostFiber = fiber({ type: 'div', return: parentHost });
    attachReactFiber(el, hostFiber);

    expect(extractReactProps(el)).toBeNull();
  });

  it('prefers displayName over name when both present', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const compFiber = fiber({
      type: componentType('InternalName', 'PublicButton'),
      memoizedProps: {},
    });
    const hostFiber = fiber({ type: 'div', return: compFiber });
    attachReactFiber(el, hostFiber);

    const result = extractReactProps(el);
    expect(result!.name).toBe('PublicButton');
  });
});

// ===========================================================================
// extractReactProps — isRoot, source resolution, prop filtering
// ===========================================================================

describe('extractReactProps', () => {
  it('returns null when element has no react fiber key', () => {
    const el = document.createElement('div');
    expect(extractReactProps(el)).toBeNull();
  });

  it('returns null when fiber key exists but fiber is falsy', () => {
    const el = document.createElement('div');
    (el as any)['__reactFiber$abc123'] = null;
    expect(extractReactProps(el)).toBeNull();
  });

  it('isRoot=true when host fiber parent is a component fiber', () => {
    const el = document.createElement('div');
    const compFiber = fiber({ type: componentType('Card'), memoizedProps: {} });
    const hostFiber = fiber({ type: 'div', return: compFiber });
    attachReactFiber(el, hostFiber);

    const result = extractReactProps(el);
    expect(result!.isRoot).toBe(true);
  });

  it('isRoot=false when host fiber parent is another host (string) fiber', () => {
    const el = document.createElement('div');
    const compFiber = fiber({ type: componentType('Card'), memoizedProps: {} });
    const parentHost = fiber({ type: 'section', return: compFiber });
    const hostFiber = fiber({ type: 'div', return: parentHost });
    attachReactFiber(el, hostFiber);

    const result = extractReactProps(el);
    expect(result!.isRoot).toBe(false);
  });

  it('prefers data-source attribute for source over _debugSource', () => {
    const el = document.createElement('div');
    el.setAttribute('data-source', 'src/Button.tsx:5:2');
    const compFiber = fiber({
      type: componentType('Button'),
      memoizedProps: {},
      _debugSource: { fileName: '/Users/x/proj/src/Other.tsx', lineNumber: 99 },
    });
    const hostFiber = fiber({ type: 'div', return: compFiber });
    attachReactFiber(el, hostFiber);

    const result = extractReactProps(el);
    expect(result!.source).toBe('src/Button.tsx:5:2');
  });

  it('falls back to fiber._debugSource (normalised) when no data-source', () => {
    const el = document.createElement('div');
    const compFiber = fiber({
      type: componentType('Button'),
      memoizedProps: {},
      _debugSource: { fileName: '/Users/x/proj/src/Button.tsx', lineNumber: 42, columnNumber: 7 },
    });
    const hostFiber = fiber({ type: 'div', return: compFiber });
    attachReactFiber(el, hostFiber);

    const result = extractReactProps(el);
    // normaliseFilePath only appends line (columnNumber not passed by this call site)
    expect(result!.source).toBe('src/Button.tsx:42');
  });

  it('falls back to _debugOwner._debugSource when fiber has no _debugSource', () => {
    const el = document.createElement('div');
    const compFiber = fiber({
      type: componentType('Button'),
      memoizedProps: {},
      _debugOwner: { _debugSource: { fileName: '/repo/src/App.tsx', lineNumber: 10 } },
    });
    const hostFiber = fiber({ type: 'div', return: compFiber });
    attachReactFiber(el, hostFiber);

    const result = extractReactProps(el);
    expect(result!.source).toBe('src/App.tsx:10');
  });
});

// ===========================================================================
// filterProps (via extractReactProps)
// ===========================================================================

describe('filterProps (via extractReactProps)', () => {
  function propsFor(memoizedProps: any): Record<string, unknown> {
    const el = document.createElement('div');
    const compFiber = fiber({ type: componentType('Widget'), memoizedProps });
    const hostFiber = fiber({ type: 'div', return: compFiber });
    attachReactFiber(el, hostFiber);
    return extractReactProps(el)!.props;
  }

  it('drops function props', () => {
    const out = propsFor({ onClick: () => {}, label: 'Hi' });
    expect(out).toEqual({ label: 'Hi' });
  });

  it('drops key, ref and __-prefixed internal props', () => {
    const out = propsFor({ key: 'k', ref: {}, __internal: 1, title: 'T' });
    expect(out).toEqual({ title: 'T' });
  });

  it('keeps plain serialisable props (string/number/boolean/object)', () => {
    const out = propsFor({ s: 'x', n: 5, b: true, obj: { a: 1 } });
    expect(out).toEqual({ s: 'x', n: 5, b: true, obj: { a: 1 } });
  });

  it('keeps children when string/number/boolean', () => {
    expect(propsFor({ children: 'text' })).toEqual({ children: 'text' });
    expect(propsFor({ children: 42 })).toEqual({ children: 42 });
  });

  it('drops children when it is an object (e.g. JSX element / array)', () => {
    expect(propsFor({ children: { type: 'div' }, x: 1 })).toEqual({ x: 1 });
    expect(propsFor({ children: ['a', 'b'], x: 1 })).toEqual({ x: 1 });
  });

  it('returns {} when memoizedProps is null/undefined/non-object', () => {
    expect(propsFor(null)).toEqual({});
    expect(propsFor(undefined)).toEqual({});
  });
});

// ===========================================================================
// detectReactComponent — data-source path + fiber _debugSource path
// ===========================================================================

describe('detectReactComponent', () => {
  it('uses data-source attribute and walks fiber for name', () => {
    const el = document.createElement('div');
    el.setAttribute('data-source', 'src/App.tsx:8:5');
    const compFiber = fiber({ type: componentType('AppHeader') });
    const hostFiber = fiber({ type: 'div', return: compFiber });
    attachReactFiber(el, hostFiber);

    const result = detectReactComponent(el);
    expect(result).toEqual({ name: 'AppHeader', sourceFile: 'src/App.tsx:8:5' });
  });

  it('uses closest [data-source] ancestor and "Unknown" name when no fiber', () => {
    const parent = document.createElement('div');
    parent.setAttribute('data-source', 'src/Page.tsx:1:1');
    const el = document.createElement('span');
    parent.appendChild(el);
    document.body.appendChild(parent);

    const result = detectReactComponent(el);
    expect(result).toEqual({ name: 'Unknown', sourceFile: 'src/Page.tsx:1:1' });
  });

  it('returns null when no data-source and no fiber key', () => {
    const el = document.createElement('div');
    expect(detectReactComponent(el)).toBeNull();
  });

  it('walks fiber for first named component with _debugSource', () => {
    const el = document.createElement('div');
    const compFiber = fiber({
      type: componentType('Hero'),
      _debugSource: { fileName: '/x/src/Hero.tsx', lineNumber: 3 },
    });
    const hostFiber = fiber({ type: 'div', return: compFiber });
    attachReactFiber(el, hostFiber);

    expect(detectReactComponent(el)).toEqual({
      name: 'Hero',
      sourceFile: 'src/Hero.tsx:3',
    });
  });

  it('uses _debugOwner._debugSource fallback when fiber lacks its own', () => {
    const el = document.createElement('div');
    const compFiber = fiber({
      type: componentType('Hero'),
      _debugOwner: { _debugSource: { fileName: '/x/src/Owner.tsx', lineNumber: 7 } },
    });
    const hostFiber = fiber({ type: 'div', return: compFiber });
    attachReactFiber(el, hostFiber);

    expect(detectReactComponent(el)).toEqual({
      name: 'Hero',
      sourceFile: 'src/Owner.tsx:7',
    });
  });

  it('returns name without sourceFile when no debug info present', () => {
    const el = document.createElement('div');
    const compFiber = fiber({ type: componentType('Plain') });
    const hostFiber = fiber({ type: 'div', return: compFiber });
    attachReactFiber(el, hostFiber);

    expect(detectReactComponent(el)).toEqual({ name: 'Plain' });
  });
});

// ===========================================================================
// normaliseFilePath (exercised via detectReactComponent _debugSource path)
// ===========================================================================

describe('normaliseFilePath (via detectReactComponent)', () => {
  function normalisedSourceFor(fileName: string, lineNumber?: number): string | undefined {
    const el = document.createElement('div');
    const compFiber = fiber({
      type: componentType('C'),
      _debugSource: { fileName, lineNumber },
    });
    const hostFiber = fiber({ type: 'div', return: compFiber });
    attachReactFiber(el, hostFiber);
    return detectReactComponent(el)!.sourceFile;
  }

  it('strips everything before /src/ → "src/..."', () => {
    expect(normalisedSourceFor('/Users/x/proj/src/App.tsx', 10)).toBe('src/App.tsx:10');
  });

  it('strips everything before /app/ marker', () => {
    expect(normalisedSourceFor('/Users/x/proj/app/page.tsx', 1)).toBe('app/page.tsx:1');
  });

  it('handles /node_modules/ paths', () => {
    expect(normalisedSourceFor('/proj/node_modules/lib/index.js', 5)).toBe(
      'node_modules/lib/index.js:5',
    );
  });

  it('leaves path unchanged when no known marker present', () => {
    expect(normalisedSourceFor('/random/path/File.tsx', 2)).toBe('/random/path/File.tsx:2');
  });

  it('omits line suffix when lineNumber is absent/zero', () => {
    expect(normalisedSourceFor('/x/src/App.tsx')).toBe('src/App.tsx');
  });

  it('uses the first matching marker (src before app)', () => {
    // /src/ appears first in the markers array AND earlier in the string
    expect(normalisedSourceFor('/x/src/app/App.tsx', 1)).toBe('src/app/App.tsx:1');
  });
});

// ===========================================================================
// detectVueComponent — Vue 3 / Vue 2
// ===========================================================================

describe('detectVueComponent', () => {
  it('detects Vue 3 component via __vueParentComponent', () => {
    const el = document.createElement('div');
    (el as any).__vueParentComponent = {
      type: { name: 'MyVueButton', __file: '/proj/src/Button.vue' },
    };
    expect(detectVueComponent(el)).toEqual({
      name: 'MyVueButton',
      sourceFile: 'src/Button.vue',
    });
  });

  it('Vue 3: uses __name when name absent, no sourceFile without __file', () => {
    const el = document.createElement('div');
    (el as any).__vueParentComponent = { type: { __name: 'Inferred' } };
    expect(detectVueComponent(el)).toEqual({ name: 'Inferred' });
  });

  it('Vue 3: returns null when type missing', () => {
    const el = document.createElement('div');
    (el as any).__vueParentComponent = {};
    expect(detectVueComponent(el)).toBeNull();
  });

  it('Vue 3: walks up DOM to find owner on ancestor', () => {
    const parent = document.createElement('div');
    (parent as any).__vueParentComponent = { type: { name: 'Parent' } };
    const el = document.createElement('span');
    parent.appendChild(el);
    document.body.appendChild(parent);

    expect(detectVueComponent(el)).toEqual({ name: 'Parent' });
  });

  it('detects Vue 2 component via __vue__ $options', () => {
    const el = document.createElement('div');
    (el as any).__vue__ = {
      $options: { name: 'LegacyComp', __file: '/proj/src/Legacy.vue' },
    };
    expect(detectVueComponent(el)).toEqual({
      name: 'LegacyComp',
      sourceFile: 'src/Legacy.vue',
    });
  });

  it('Vue 2: uses _componentTag when name absent', () => {
    const el = document.createElement('div');
    (el as any).__vue__ = { $options: { _componentTag: 'my-tag' } };
    expect(detectVueComponent(el)).toEqual({ name: 'my-tag' });
  });

  it('returns null when no Vue instance anywhere in chain', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    expect(detectVueComponent(el)).toBeNull();
  });
});

// ===========================================================================
// detectComponent (unified) — React preferred over Vue
// ===========================================================================

describe('detectComponent', () => {
  it('returns React result when both frameworks present', () => {
    const el = document.createElement('div');
    el.setAttribute('data-source', 'src/R.tsx:1:1');
    const compFiber = fiber({ type: componentType('ReactComp') });
    const hostFiber = fiber({ type: 'div', return: compFiber });
    attachReactFiber(el, hostFiber);
    (el as any).__vueParentComponent = { type: { name: 'VueComp' } };

    expect(detectComponent(el)!.name).toBe('ReactComp');
  });

  it('falls through to Vue when no React', () => {
    const el = document.createElement('div');
    (el as any).__vueParentComponent = { type: { name: 'VueComp' } };
    expect(detectComponent(el)!.name).toBe('VueComp');
  });

  it('returns null for a plain element', () => {
    const el = document.createElement('div');
    expect(detectComponent(el)).toBeNull();
  });
});

// ===========================================================================
// getReactTracerInfo / getTracerInfo
// ===========================================================================

describe('getReactTracerInfo', () => {
  it('builds element tree from nearest [data-source] down to el', () => {
    document.body.innerHTML = `
      <section data-source="src/App.tsx:1:1">
        <div><span id="leaf"></span></div>
      </section>`;
    const leaf = document.getElementById('leaf')!;

    const result = getReactTracerInfo(leaf);
    expect(result).not.toBeNull();
    expect(result!.file).toBe('src/App.tsx:1:1');
    // tree from sourceEl(section) down to leaf(span)
    expect(result!.tree).toBe('section > div > span');
  });

  it('returns null when no [data-source] ancestor', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    expect(getReactTracerInfo(el)).toBeNull();
  });

  it('getTracerInfo falls back to react tracer when no vue tracer', () => {
    document.body.innerHTML = `<div data-source="src/X.tsx:2:3"><b id="b"></b></div>`;
    const b = document.getElementById('b')!;
    const result = getTracerInfo(b);
    expect(result).toEqual({ tree: 'div > b', file: 'src/X.tsx:2:3' });
  });

  it('getTracerInfo returns null when neither tracer applies', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    expect(getTracerInfo(el)).toBeNull();
  });
});

// ===========================================================================
// getVueTracerInfo — using a fabricated __vue_tracer__ store
// ===========================================================================

describe('getVueTracerInfo', () => {
  it('returns null when no tracer store present', () => {
    const el = document.createElement('div');
    expect(getVueTracerInfo(el)).toBeNull();
  });

  it('returns single-node tree + normalised file from vnode tracer position', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    const props = { id: 1 };
    const vnode = { props, type: 'div', parent: null };
    (el as any).__vnode = vnode;

    const map = new Map<object, [string, number, number]>();
    map.set(props, ['/proj/src/App.vue', 12, 4]);
    (globalThis as any).__vue_tracer__ = { vnodeToPos: map };

    const result = getVueTracerInfo(el);
    expect(result).toEqual({ tree: 'div', file: 'src/App.vue:12:4' });
  });

  it('collects parent chain within the same file', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    const parentProps = { p: 1 };
    const leafProps = { l: 1 };
    const parentVNode: any = { props: parentProps, type: 'section', parent: null };
    const leafVNode: any = { props: leafProps, type: 'span', parent: parentVNode };
    (el as any).__vnode = leafVNode;

    const map = new Map<object, [string, number, number]>();
    map.set(leafProps, ['/proj/src/App.vue', 5, 2]);
    map.set(parentProps, ['/proj/src/App.vue', 1, 1]);
    (globalThis as any).__vue_tracer__ = { vnodeToPos: map };

    const result = getVueTracerInfo(el);
    // chain: parent(section) > leaf(span); file is from leaf
    expect(result).toEqual({ tree: 'section > span', file: 'src/App.vue:5:2' });
  });

  it('stops chain when parent is in a different file', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    const parentProps = { p: 1 };
    const leafProps = { l: 1 };
    const parentVNode: any = { props: parentProps, type: 'section', parent: null };
    const leafVNode: any = { props: leafProps, type: 'span', parent: parentVNode };
    (el as any).__vnode = leafVNode;

    const map = new Map<object, [string, number, number]>();
    map.set(leafProps, ['/proj/src/Child.vue', 5, 2]);
    map.set(parentProps, ['/proj/src/Parent.vue', 1, 1]); // different file → excluded
    (globalThis as any).__vue_tracer__ = { vnodeToPos: map };

    const result = getVueTracerInfo(el);
    expect(result).toEqual({ tree: 'span', file: 'src/Child.vue:5:2' });
  });
});

// ===========================================================================
// detectVueComponent — tracer takes priority
// ===========================================================================

describe('detectVueComponent with tracer', () => {
  it('uses tracer source when available (component name from object vnode.type)', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    const props = { id: 1 };
    const vnode = { props, type: { name: 'TracedComp' }, parent: null };
    (el as any).__vnode = vnode;

    const map = new Map<object, [string, number, number]>();
    map.set(props, ['/proj/src/Traced.vue', 9, 3]);
    (globalThis as any).__vue_tracer__ = { vnodeToPos: map };

    expect(detectVueComponent(el)).toEqual({
      name: 'TracedComp',
      sourceFile: 'src/Traced.vue:9:3',
    });
  });

  it('walks vnode.parent for name when leaf type is a lowercase host tag', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    const props = { id: 1 };
    const compParent = { type: { name: 'OwnerComp' }, parent: null };
    const vnode = { props, type: 'div', parent: compParent };
    (el as any).__vnode = vnode;

    const map = new Map<object, [string, number, number]>();
    map.set(props, ['/proj/src/Owner.vue', 2, 1]);
    (globalThis as any).__vue_tracer__ = { vnodeToPos: map };

    expect(detectVueComponent(el)).toEqual({
      name: 'OwnerComp',
      sourceFile: 'src/Owner.vue:2:1',
    });
  });
});

// ===========================================================================
// extractVueProps
// ===========================================================================

describe('extractVueProps', () => {
  it('returns null when no __vueParentComponent in chain', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    expect(extractVueProps(el)).toBeNull();
  });

  it('returns null when instance has no resolvable name', () => {
    const el = document.createElement('div');
    (el as any).__vueParentComponent = { type: {} };
    expect(extractVueProps(el)).toBeNull();
  });

  it('extracts filtered props, name and __file source', () => {
    const el = document.createElement('div');
    (el as any).__vueParentComponent = {
      type: { name: 'Card', __file: '/proj/src/Card.vue' },
      props: { title: 'Hi', onClose: () => {}, __v: 1 },
      subTree: { el },
    };

    const result = extractVueProps(el);
    expect(result).toEqual({
      name: 'Card',
      source: 'src/Card.vue',
      framework: 'vue',
      props: { title: 'Hi' },
      isRoot: true,
    });
  });

  it('isRoot=false when subTree.el is a different element', () => {
    const el = document.createElement('div');
    const other = document.createElement('div');
    (el as any).__vueParentComponent = {
      type: { name: 'Card' },
      props: {},
      subTree: { el: other },
    };
    expect(extractVueProps(el)!.isRoot).toBe(false);
  });

  it('prefers tracer position over __file for source', () => {
    const el = document.createElement('div');
    const vnodeProps = { id: 1 };
    (el as any).__vueParentComponent = {
      type: { name: 'Card', __file: '/proj/src/Card.vue' },
      props: {},
      vnode: { props: vnodeProps },
      subTree: { el },
    };
    const map = new Map<object, [string, number, number]>();
    map.set(vnodeProps, ['/proj/src/Card.vue', 11, 6]);
    (globalThis as any).__vue_tracer__ = { vnodeToPos: map };

    expect(extractVueProps(el)!.source).toBe('src/Card.vue:11:6');
  });

  it('walks up DOM to find ancestor __vueParentComponent', () => {
    const parent = document.createElement('div');
    (parent as any).__vueParentComponent = {
      type: { name: 'Outer' },
      props: { a: 1 },
      subTree: { el: parent },
    };
    const el = document.createElement('span');
    parent.appendChild(el);
    document.body.appendChild(parent);

    const result = extractVueProps(el);
    expect(result!.name).toBe('Outer');
    expect(result!.props).toEqual({ a: 1 });
  });
});

// ===========================================================================
// extractComponentProps (unified)
// ===========================================================================

describe('extractComponentProps', () => {
  it('returns React props when react fiber present', () => {
    const el = document.createElement('div');
    const compFiber = fiber({ type: componentType('RC'), memoizedProps: { x: 1 } });
    const hostFiber = fiber({ type: 'div', return: compFiber });
    attachReactFiber(el, hostFiber);

    const result = extractComponentProps(el);
    expect(result!.framework).toBe('react');
    expect(result!.name).toBe('RC');
  });

  it('falls through to Vue when no react fiber', () => {
    const el = document.createElement('div');
    (el as any).__vueParentComponent = {
      type: { name: 'VC' },
      props: {},
      subTree: { el },
    };
    const result = extractComponentProps(el);
    expect(result!.framework).toBe('vue');
    expect(result!.name).toBe('VC');
  });

  it('returns null for a plain element', () => {
    const el = document.createElement('div');
    expect(extractComponentProps(el)).toBeNull();
  });
});
