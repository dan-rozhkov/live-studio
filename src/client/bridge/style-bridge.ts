/** Style bridge — reads computed, inline, and matched CSS rules for a given element. */

/** Key-value map of CSS property name to its value. */
export type CSSPropertyMap = Record<string, string>;

/** A CSS rule that matched the element via its selector. */
export interface MatchedRule {
  /** The selector text that matched the element. */
  selector: string;
  /** CSS properties declared in this rule. */
  properties: CSSPropertyMap;
  /** href of the stylesheet this rule belongs to, or null for inline <style> blocks. */
  sourceHref: string | null;
}

/** Full style information returned for an element. */
export interface ElementStyles {
  computed: CSSPropertyMap;
  inline: CSSPropertyMap;
  matched: MatchedRule[];
  /** Parent element's display value (useful for flex/grid context). */
  parentDisplay: string;
}

/**
 * Iterate `getComputedStyle` and return every resolved property as a key-value map.
 */
export function fetchComputedStyles(el: Element): CSSPropertyMap {
  const cs = window.getComputedStyle(el);
  const result: CSSPropertyMap = {};
  for (let i = 0; i < cs.length; i++) {
    result[cs[i]] = cs.getPropertyValue(cs[i]);
  }
  return result;
}

/**
 * Read the element's inline `style` properties.
 */
export function fetchInlineStyles(el: Element): CSSPropertyMap {
  const htmlEl = el as HTMLElement;
  const result: CSSPropertyMap = {};
  for (let i = 0; i < htmlEl.style.length; i++) {
    const prop = htmlEl.style[i];
    result[prop] = htmlEl.style.getPropertyValue(prop);
  }
  return result;
}

/**
 * Walk every stylesheet in the document and collect CSS rules whose selector
 * matches the given element.  Cross-origin sheets that throw on `.cssRules`
 * access are silently skipped.
 */
export function fetchMatchedRules(el: Element): MatchedRule[] {
  const matched: MatchedRule[] = [];
  try {
    const sheets = document.styleSheets;
    for (let s = 0; s < sheets.length; s++) {
      try {
        const rules = sheets[s].cssRules;
        for (let r = 0; r < rules.length; r++) {
          const rule = rules[r] as CSSStyleRule;
          if (rule.selectorText && el.matches(rule.selectorText)) {
            const props: CSSPropertyMap = {};
            for (let p = 0; p < rule.style.length; p++) {
              props[rule.style[p]] = rule.style.getPropertyValue(rule.style[p]);
            }
            matched.push({
              selector: rule.selectorText,
              properties: props,
              sourceHref: sheets[s].href,
            });
          }
        }
      } catch {
        // Cross-origin stylesheet — skip silently.
      }
    }
  } catch {
    // styleSheets access failed — return empty.
  }
  return matched;
}

/**
 * Convenience: fetch computed, inline, and matched styles plus parent display
 * in one call — mirrors the reference `fetchStyles` function.
 */
export function fetchStyles(el: Element): ElementStyles {
  const htmlEl = el as HTMLElement;
  const parent = htmlEl.parentElement;
  const parentDisplay = parent
    ? window.getComputedStyle(parent).display
    : '';

  return {
    computed: fetchComputedStyles(el),
    inline: fetchInlineStyles(el),
    matched: fetchMatchedRules(el),
    parentDisplay,
  };
}
