/** Design token (CSS custom property) discovered from stylesheets. */
export interface DesignToken {
  name: string;
  value: string;
}

/**
 * Scan all CSS custom properties (--*) resolved on :root and return them
 * as design tokens.  Uses getComputedStyle on the document element so that
 * inherited / cascaded values are already resolved.
 *
 * Cross-origin stylesheet access errors are silently ignored.
 */
export function fetchDesignTokens(): DesignToken[] {
  try {
    const cs = getComputedStyle(document.documentElement);
    const tokens: DesignToken[] = [];
    for (let i = 0; i < cs.length; i++) {
      const prop = cs[i];
      if (prop.startsWith('--')) {
        tokens.push({
          name: prop.slice(2),
          value: cs.getPropertyValue(prop).trim(),
        });
      }
    }
    return tokens;
  } catch {
    // Cross-origin or other access errors
    return [];
  }
}
