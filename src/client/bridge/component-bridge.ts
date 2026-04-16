// ---------------------------------------------------------------------------
// Component Bridge — React / Vue component detection from DOM elements
// ---------------------------------------------------------------------------

/** Result of a successful component detection */
export interface ComponentInfo {
  /** Component display name (e.g. "MyButton", "AppHeader") */
  name: string;
  /** Source file location when available (e.g. "src/App.tsx:42") */
  sourceFile?: string;
}

/** Result of a tracer lookup (vue-tracer or react data-source) */
export interface TracerResult {
  /** Element tree within the nearest component (e.g. "div > span") */
  tree: string;
  /** Source file with line:column (e.g. "src/App.tsx:8:5") */
  file: string;
}

// ---------------------------------------------------------------------------
// Shared React helpers
// ---------------------------------------------------------------------------

/** Find the React fiber key on a DOM element (if any). */
function getReactFiberKey(el: Element): string | undefined {
  return Object.keys(el).find(
    (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"),
  );
}

/** Walk the React fiber tree upward to find the nearest component name. */
function walkFiberForName(el: Element): string | undefined {
  const key = getReactFiberKey(el);
  if (!key) return undefined;

  let fiber: any = (el as any)[key];
  while (fiber) {
    const type = fiber.type;
    if (type && typeof type !== "string") {
      const n = type.displayName || type.name;
      if (n) return n;
    }
    fiber = fiber.return;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// React detection
// ---------------------------------------------------------------------------

/**
 * Attempt to detect a React component that owns the given DOM element.
 *
 * Detection order:
 * 1. `data-source` attributes injected by live-studio/vite reactTracer plugin
 *    (works with any React version including 19+)
 * 2. `fiber._debugSource` from React dev-mode JSX transform (React 16-18)
 * 3. `fiber._debugOwner._debugSource` (React 18 fallback)
 */
export function detectReactComponent(el: Element): ComponentInfo | null {
  // 1. Try data-source tracer (version-agnostic, compile-time injection)
  const source = el.getAttribute("data-source")
    ?? el.closest("[data-source]")?.getAttribute("data-source");
  if (source) {
    return { name: walkFiberForName(el) || "Unknown", sourceFile: source };
  }

  // 2. Fallback: walk React fiber tree for _debugSource
  const key = getReactFiberKey(el);
  if (!key) return null;

  let fiber: any = (el as any)[key];
  if (!fiber) return null;

  while (fiber) {
    const type = fiber.type;
    // Skip host (string) fibers — we want the first *component* fiber
    if (type && typeof type !== "string") {
      const name: string | undefined = type.displayName || type.name;
      if (name) {
        const info: ComponentInfo = { name };

        // Dev-mode _debugSource (React 16-18)
        const debug = fiber._debugSource;
        if (debug?.fileName) {
          info.sourceFile = normaliseFilePath(debug.fileName, debug.lineNumber);
        }

        // React 18 fallback: owner's _debugSource
        if (!info.sourceFile && fiber._debugOwner) {
          const ownerDebug = fiber._debugOwner._debugSource;
          if (ownerDebug?.fileName) {
            info.sourceFile = normaliseFilePath(ownerDebug.fileName, ownerDebug.lineNumber);
          }
        }

        return info;
      }
    }
    fiber = fiber.return;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Vue detection
// ---------------------------------------------------------------------------

/**
 * Attempt to detect a Vue component that owns the given DOM element.
 *
 * Vue 2 attaches `__vue__` on the component root element.
 * Vue 3 attaches `__vueParentComponent` (composition API) or
 * `__vue_app__` on the app root.
 */
export function detectVueComponent(el: Element): ComponentInfo | null {
  // Try vite-plugin-vue-tracer first (provides exact file:line:column)
  const tracerInfo = detectVueTracer(el);
  if (tracerInfo) return tracerInfo;

  // Walk up the DOM to find the nearest Vue component owner
  let current: Element | null = el;
  while (current) {
    // --- Vue 3 (Composition API) ---
    const vnode: any = (current as any).__vueParentComponent;
    if (vnode) {
      return extractVue3Info(vnode);
    }

    // --- Vue 2 ---
    const vm: any = (current as any).__vue__;
    if (vm) {
      return extractVue2Info(vm);
    }

    current = current.parentElement;
  }

  return null;
}

function extractVue3Info(instance: any): ComponentInfo | null {
  const type = instance.type;
  if (!type) return null;

  const name: string | undefined =
    type.name || type.__name || type.displayName;
  if (!name) return null;

  const info: ComponentInfo = { name };

  // Vue 3 dev mode exposes __file on the component options
  if (type.__file) {
    info.sourceFile = normaliseFilePath(type.__file);
  }

  return info;
}

function extractVue2Info(vm: any): ComponentInfo | null {
  const options = vm.$options;
  if (!options) return null;

  const name: string | undefined =
    options.name || options._componentTag;
  if (!name) return null;

  const info: ComponentInfo = { name };

  // Vue 2 dev mode: __file on options
  if (options.__file) {
    info.sourceFile = normaliseFilePath(options.__file);
  }

  return info;
}

// ---------------------------------------------------------------------------
// Vue Tracer detection (vite-plugin-vue-tracer)
// ---------------------------------------------------------------------------

/**
 * Use vite-plugin-vue-tracer's global store to get exact source position.
 * The tracer injects `recordPosition(source, line, column, vnode)` calls
 * at compile time, storing [source, line, column] in a WeakMap keyed by
 * vnode props. Each DOM element exposes its vnode via `__vnode`.
 */
function detectVueTracer(el: Element): ComponentInfo | null {
  const store: any = (globalThis as any).__vue_tracer__;
  if (!store?.vnodeToPos) return null;

  // Walk up the DOM to find the nearest element with tracer data
  let current: Element | null = el;
  while (current) {
    const vnode: any = (current as any).__vnode;
    if (vnode?.props) {
      const pos: [string, number, number] | undefined = store.vnodeToPos.get(vnode.props);
      if (pos) {
        const [source, line, column] = pos;
        // Derive component name from vnode type
        let name: string | undefined;
        if (typeof vnode.type === "string") {
          name = vnode.type;
        } else if (typeof vnode.type === "object") {
          name = vnode.type.name || vnode.type.__name;
        }

        // Walk up vnode.parent to find the owning component name
        if (!name || /^[a-z]/.test(name)) {
          let parent = vnode.parent;
          while (parent) {
            const t = parent.type;
            if (t && typeof t !== "string") {
              const n = t.name || t.__name || t.displayName;
              if (n) { name = n; break; }
            }
            parent = parent.parent;
          }
        }

        return {
          name: name || "Unknown",
          sourceFile: normaliseFilePath(source, line, column),
        };
      }
    }
    current = current.parentElement;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Unified detection
// ---------------------------------------------------------------------------

/**
 * Try to detect the owning framework component for a DOM element.
 * Tries React first, then Vue. Returns `null` when no framework is detected
 * or when the element is a plain HTML host element without a component owner.
 */
export function detectComponent(el: Element): ComponentInfo | null {
  return detectReactComponent(el) ?? detectVueComponent(el) ?? null;
}

// ---------------------------------------------------------------------------
// Tracer info (unified Vue + React)
// ---------------------------------------------------------------------------

/**
 * Get tracer-powered element tree and source location.
 * Tries vue-tracer first, then react data-source attributes.
 */
export function getTracerInfo(el: Element): TracerResult | null {
  return getVueTracerInfo(el) ?? getReactTracerInfo(el) ?? null;
}

/**
 * Use vue-tracer to get the component tree and exact source location.
 * Returns the path from the component root to the selected element,
 * scoped to the nearest component (stops when the source file changes).
 */
export function getVueTracerInfo(el: Element): TracerResult | null {
  const store: any = (globalThis as any).__vue_tracer__;
  if (!store?.vnodeToPos) return null;

  interface TraceEntry { vnode: any; el?: Element; pos: [string, number, number] }

  function findTrace(e: Element): TraceEntry | null {
    const v: any = (e as any).__vnode;
    if (v?.props) {
      const p = store.vnodeToPos.get(v.props);
      if (p) return { vnode: v, el: e, pos: p };
    }
    return null;
  }

  function findTraceUp(e: Element | null): TraceEntry | null {
    let cur = e;
    while (cur) {
      const t = findTrace(cur);
      if (t) return t;
      cur = cur.parentElement;
    }
    return null;
  }

  function getParent(entry: TraceEntry): TraceEntry | null {
    let parentVNode = entry.vnode?.parent;
    while (parentVNode) {
      if (parentVNode.props && store.vnodeToPos.has(parentVNode.props)) {
        return { vnode: parentVNode, el: parentVNode.el, pos: store.vnodeToPos.get(parentVNode.props) };
      }
      parentVNode = parentVNode.parent;
    }
    if (entry.el?.parentElement) return findTraceUp(entry.el.parentElement);
    return null;
  }

  const leaf = findTraceUp(el);
  if (!leaf) return null;

  // Collect chain within the same file (same component)
  const leafFile = leaf.pos[0];
  const chain: TraceEntry[] = [leaf];
  let current: TraceEntry | null = leaf;
  for (let i = 0; i < 30; i++) {
    const parent = getParent(current);
    if (!parent || parent.pos[0] !== leafFile) break;
    chain.unshift(parent);
    current = parent;
  }

  const tree = chain
    .map((c) => typeof c.vnode.type === "string" ? c.vnode.type : (c.vnode.type?.__name || c.vnode.type?.name || "?"))
    .join(" > ");

  const file = normaliseFilePath(leaf.pos[0], leaf.pos[1], leaf.pos[2]);

  return { tree, file };
}

/**
 * Use data-source attributes to get the element tree and exact source location.
 * Returns the path from the nearest annotated ancestor down to the selected element.
 */
export function getReactTracerInfo(el: Element): TracerResult | null {
  const sourceEl = el.closest("[data-source]");
  if (!sourceEl) return null;

  const source = sourceEl.getAttribute("data-source")!;

  // Build a tree path from the source element down to el
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== sourceEl.parentElement) {
    parts.unshift(cur.localName);
    cur = cur.parentElement;
  }

  return {
    tree: parts.join(" > "),
    file: source,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Shorten an absolute file path to a project-relative one when possible.
 * Looks for common project root markers (/src/, /app/, /pages/, /components/,
 * /node_modules/) and strips the prefix.
 */
function normaliseFilePath(
  filePath: string,
  lineNumber?: number,
  columnNumber?: number,
): string {
  let file = filePath;
  const markers = ["/src/", "/app/", "/node_modules/"];
  for (const marker of markers) {
    const idx = file.indexOf(marker);
    if (idx !== -1) {
      file = file.slice(idx + 1);
      break;
    }
  }

  if (lineNumber) {
    file += `:${lineNumber}`;
    if (columnNumber) file += `:${columnNumber}`;
  }
  return file;
}
