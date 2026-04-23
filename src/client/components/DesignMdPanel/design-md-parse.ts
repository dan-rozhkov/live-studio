import yaml from 'js-yaml';

export interface TypographyToken {
  fontFamily?: string;
  fontSize?: string | number;
  fontWeight?: string | number;
  lineHeight?: string | number;
  letterSpacing?: string | number;
  fontFeature?: string;
  fontVariation?: string;
}

export interface DesignMdDoc {
  name?: string;
  description?: string;
  version?: string;
  colors?: Record<string, string>;
  typography?: Record<string, TypographyToken>;
  rounded?: Record<string, string | number>;
  spacing?: Record<string, string | number>;
  components?: Record<string, Record<string, string>>;
  [key: string]: unknown;
}

export interface ParsedDesignMd {
  doc: DesignMdDoc;
  body: string;
  error?: string;
}

const FRONTMATTER_RE = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/;

export function parseDesignMd(content: string): ParsedDesignMd {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    return { doc: {}, body: content, error: 'No YAML front matter found.' };
  }
  const body = content.slice(match[0].length);
  try {
    const doc = (yaml.load(match[1]) as DesignMdDoc) ?? {};
    return { doc, body };
  } catch (err: any) {
    return { doc: {}, body, error: `YAML parse error: ${err?.message ?? err}` };
  }
}

const REF_RE = /^\{([^}]+)\}$/;

/**
 * Resolve a value that may be a `{path.to.token}` reference.
 * Returns the resolved string value, or `{ unresolved: ref }` if broken.
 */
export function resolveRef(
  doc: DesignMdDoc,
  raw: unknown,
  seen: Set<string> = new Set(),
): { value: string; unresolved?: string } {
  if (raw == null) return { value: '' };
  const s = String(raw);
  const m = s.match(REF_RE);
  if (!m) return { value: s };
  const ref = m[1].trim();
  if (seen.has(ref)) return { value: s, unresolved: ref };
  seen.add(ref);
  const parts = ref.split('.');
  let cur: any = doc;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in cur) cur = cur[p];
    else return { value: s, unresolved: ref };
  }
  if (typeof cur === 'object') return { value: s, unresolved: ref };
  return resolveRef(doc, cur, seen);
}

/**
 * Look up the terminal value of a `{path.to.token}` reference.
 * Unlike resolveRef, this returns the raw value (object or scalar) so callers
 * can dig into structured tokens like typography.
 */
export function lookupRef(doc: DesignMdDoc, raw: unknown): unknown {
  const s = String(raw ?? '');
  const m = s.match(REF_RE);
  if (!m) return raw;
  const parts = m[1].trim().split('.');
  let cur: any = doc;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in cur) cur = cur[p];
    else return null;
  }
  return cur;
}

/** Simple WCAG relative luminance contrast ratio. */
export function contrastRatio(fgHex: string, bgHex: string): number | null {
  const fg = hexToRgb(fgHex);
  const bg = hexToRgb(bgHex);
  if (!fg || !bg) return null;
  const l1 = relLuminance(fg);
  const l2 = relLuminance(bg);
  const [lo, hi] = l1 < l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function relLuminance([r, g, b]: [number, number, number]): number {
  const [R, G, B] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** Convert a spacing/radius value to CSS length. Numbers become px. */
export function toCssLength(value: string | number): string {
  if (typeof value === 'number') return `${value}px`;
  return String(value);
}
