/**
 * Vite plugin that injects `data-source` attributes into JSX elements
 * so live-studio can track React component source file/line in any React version.
 *
 * Usage in vite.config.ts:
 *   import { reactTracer } from 'live-studio/vite'
 *   plugins: [react(), reactTracer()]
 */

interface VitePlugin {
  name: string;
  enforce: 'pre' | 'post';
  apply: 'serve' | 'build';
  configResolved(config: { root: string }): void;
  transform(code: string, id: string): { code: string; map: null } | null;
}

export function reactTracer(): VitePlugin {
  let root = '';

  return {
    name: 'live-studio:react-tracer',
    enforce: 'pre',
    apply: 'serve',

    configResolved(config) {
      root = config.root;
    },

    transform(code, id) {
      if (!/\.[jt]sx$/.test(id)) return null;
      if (id.includes('node_modules')) return null;
      return injectSourceAttrs(code, id, root);
    },
  };
}

// ---------------------------------------------------------------------------
// Transform
// ---------------------------------------------------------------------------

/**
 * Match a JSX opening tag name: `<TagName` or `<motion.div`.
 *
 * Negative lookbehind excludes TypeScript generics (`Record<string>`,
 * `Array<number>`) where `<` follows a word character or dot.
 *
 * We only capture the `<TagName` part and inject the attribute right after
 * the tag name. This avoids issues with self-closing tags (`<App />`) and
 * complex attribute expressions.
 */
const JSX_TAG_NAME = /(?<![a-zA-Z0-9_.])(<(?:[A-Za-z_][A-Za-z0-9_.]*))/g;

function injectSourceAttrs(
  code: string,
  id: string,
  root: string,
): { code: string; map: null } | null {
  const relPath = id.startsWith(root + '/') ? id.slice(root.length + 1) : id;

  const lineStarts = buildLineStarts(code);
  let changed = false;
  let out = '';
  let last = 0;

  JSX_TAG_NAME.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = JSX_TAG_NAME.exec(code)) !== null) {
    const tag = m[1];

    // Skip closing tags: `</div>`
    if (tag.startsWith('</')) continue;

    // The character right after the tag name must be whitespace, `>`, or `/`
    // to confirm this is JSX and not a partial match
    const afterIdx = m.index + m[0].length;
    if (afterIdx < code.length) {
      const after = code[afterIdx];
      if (after !== ' ' && after !== '\t' && after !== '\n' && after !== '\r'
        && after !== '>' && after !== '/') continue;
    }

    // Find the tag's closing `>` or `/>`, skipping over `{...}` expressions
    // that may contain `>` (arrow functions, comparisons).
    const closeIdx = findTagClose(code, afterIdx);
    if (closeIdx !== -1) {
      // Skip TypeScript generic function signatures: `<T>(...`, `<T, U>(...`
      const afterClose = code[closeIdx + 1];
      if (afterClose === '(') continue;

      // Skip if this tag already has data-source
      const tagBody = code.slice(afterIdx, closeIdx);
      if (tagBody.includes('data-source')) continue;
    }

    const line = lineAt(lineStarts, m.index);
    const col = m.index - lineStarts[line - 1] + 1;
    const attr = ` data-source="${relPath}:${line}:${col}"`;

    out += code.slice(last, afterIdx) + attr;
    last = afterIdx;
    changed = true;
  }

  if (!changed) return null;
  out += code.slice(last);
  return { code: out, map: null };
}

// ---------------------------------------------------------------------------
// Tag close finder — skips `{...}` expressions that may contain `>`
// ---------------------------------------------------------------------------

/** Find the `>` that closes a JSX opening tag, skipping `{...}` blocks. */
function findTagClose(code: string, from: number): number {
  let depth = 0;
  for (let i = from; i < code.length; i++) {
    const ch = code[i];
    if (ch === '{') { depth++; continue; }
    if (ch === '}') { depth--; continue; }
    if (depth === 0 && ch === '>') return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Line number helpers
// ---------------------------------------------------------------------------

function buildLineStarts(code: string): number[] {
  const starts = [0];
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function lineAt(starts: number[], offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1; // 1-based
}
