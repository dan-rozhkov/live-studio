import { h, render } from 'preact';
import { InPagePanel } from './components/InPagePanel';

// ---------------------------------------------------------------------------
// Theme CSS variables injected into the shadow root
// ---------------------------------------------------------------------------

const THEME_CSS = /* css */ `
  :host {
    /* Colors */
    --ls-bg: #1e1e2e;
    --ls-bg-surface: #262637;
    --ls-bg-hover: #2e2e42;
    --ls-bg-active: #383850;
    --ls-border: #3a3a52;
    --ls-text: #e0e0ec;
    --ls-text-secondary: #9494b0;
    --ls-text-muted: #6c6c88;
    --ls-accent: #6c8cff;
    --ls-accent-hover: #8aa4ff;
    --ls-accent-active: #5470e0;
    --ls-danger: #f05050;
    --ls-success: #4cbb7c;
    --ls-warning: #e8a040;

    /* Typography */
    --ls-font: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
      Oxygen, Ubuntu, Cantarell, 'Helvetica Neue', sans-serif;
    --ls-font-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, Consolas,
      'Liberation Mono', monospace;
    --ls-font-size-xs: 11px;
    --ls-font-size-sm: 12px;
    --ls-font-size-md: 13px;
    --ls-font-size-lg: 14px;

    /* Spacing */
    --ls-space-xs: 4px;
    --ls-space-sm: 6px;
    --ls-space-md: 8px;
    --ls-space-lg: 12px;
    --ls-space-xl: 16px;

    /* Radii */
    --ls-radius-sm: 4px;
    --ls-radius-md: 6px;
    --ls-radius-lg: 8px;

    /* Shadows */
    --ls-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    --ls-shadow-lg: 0 4px 24px rgba(0, 0, 0, 0.4);

    /* Layout */
    --ls-panel-width: 320px;
    --ls-toolbar-height: 36px;

    /* Legacy --cs-* aliases (ported components still reference these) */
    --cs-layer: var(--ls-bg-surface);
    --cs-border: var(--ls-border);
    --cs-foreground: var(--ls-text);
    --cs-white: var(--ls-text);
    --cs-black: #000;
    --cs-accent: var(--ls-accent);
    --cs-on-accent: #000;
    --cs-feint: var(--ls-bg-hover);
    --cs-feint-solid: var(--ls-bg-active);
    --cs-feint-text: var(--ls-text-muted);
    --cs-secondary-text: var(--ls-text-secondary);
    --cs-secondary-text-hover: var(--ls-text);
    --cs-label-text: var(--ls-text-secondary);
    --cs-input-bg: var(--ls-bg);
    --cs-input-bg-hover: var(--ls-bg-hover);
    --cs-input-border: var(--ls-border);
    --cs-input-border-strong: var(--ls-text-muted);
    --cs-fill-bg: var(--ls-bg);
    --cs-font: var(--ls-font);
    --cs-font-mono: var(--ls-font-mono);
    --cs-select-chevron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236c6c88' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    --cs-checker: repeating-conic-gradient(#3a3a52 0% 25%, transparent 0% 50%) 0 0 / 8px 8px;

    /* Reset — prevent host page styles from leaking in */
    all: initial;
    display: block;
    font-family: var(--ls-font);
    font-size: var(--ls-font-size-md);
    color: var(--ls-text);
    line-height: 1.5;
    box-sizing: border-box;
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 2147483646;
    pointer-events: none;
  }

  :host([data-theme="light"]) {
    --ls-bg: #f5f5f7;
    --ls-bg-surface: #ffffff;
    --ls-bg-hover: #ededf0;
    --ls-bg-active: #e0e0e5;
    --ls-border: #d8d8e0;
    --ls-text: #1a1a2e;
    --ls-text-secondary: #5a5a72;
    --ls-text-muted: #8888a0;
    --ls-accent: #4a6cf7;
    --ls-accent-hover: #3a5ce0;
    --ls-accent-active: #2a4cd0;
    --ls-danger: #dc3545;
    --ls-success: #28a745;
    --ls-warning: #d4912a;

    --ls-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    --ls-shadow-lg: 0 4px 24px rgba(0, 0, 0, 0.08);

    --cs-black: #ffffff;
    --cs-on-accent: #ffffff;
    --cs-checker: repeating-conic-gradient(#d8d8e0 0% 25%, transparent 0% 50%) 0 0 / 8px 8px;
    --cs-select-chevron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%235a5a72' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");

    color-scheme: light;
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  [data-live-studio-root] {
    pointer-events: auto;
  }
`;

// ---------------------------------------------------------------------------
// Font injection — load Inter from Google Fonts if not already present
// ---------------------------------------------------------------------------

const INTER_FONT_URL =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';

function injectFont(): HTMLLinkElement | null {
  // Skip if Inter is already loaded in the host page
  const existing = document.querySelector(
    `link[href*="fonts.googleapis.com"][href*="Inter"]`,
  );
  if (existing) return null;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = INTER_FONT_URL;
  document.head.appendChild(link);
  return link;
}

// ---------------------------------------------------------------------------
// Custom element tag name
// ---------------------------------------------------------------------------

const TAG_NAME = 'live-studio-panel';

// ---------------------------------------------------------------------------
// startStudio — mounts the visual editor into the page
// ---------------------------------------------------------------------------

export interface StartStudioOptions {
  /** Override the WebSocket port (default: 9877) */
  port?: number;
}

/**
 * Mount the live-studio visual CSS editor onto the current page.
 *
 * Creates a `<live-studio-panel>` custom element with an isolated Shadow DOM,
 * injects theme variables, loads the Inter font, and renders the Preact UI.
 *
 * @returns A cleanup function that unmounts the editor and removes all injected
 *          elements from the DOM.
 */
export function startStudio(options: StartStudioOptions = {}): () => void {
  // Prevent double-mounting
  if (document.querySelector(TAG_NAME)) {
    console.warn('[live-studio] Already mounted — skipping.');
    return () => {};
  }

  // --- 1. Create host element + shadow root ---
  const host = document.createElement(TAG_NAME);
  const shadow = host.attachShadow({ mode: 'open' });

  // --- 2. Inject theme styles + CSS modules into shadow DOM ---
  const style = document.createElement('style');
  // @ts-ignore — __LIVE_STUDIO_CSS__ is appended by esbuild post-build plugin
  const moduleCss = typeof __LIVE_STUDIO_CSS__ === 'string' ? __LIVE_STUDIO_CSS__ : '';
  style.textContent = THEME_CSS + '\n' + moduleCss;
  shadow.appendChild(style);

  // --- 3. Mount container for Preact ---
  const mountPoint = document.createElement('div');
  mountPoint.setAttribute('data-live-studio-root', '');
  shadow.appendChild(mountPoint);

  // --- 4. Inject font into the host document ---
  const fontLink = injectFont();

  // --- 5. Set initial theme from localStorage ---
  try {
    if (localStorage.getItem('livestudio-theme') === 'light') {
      host.setAttribute('data-theme', 'light');
    }
  } catch { /* noop */ }

  // --- 6. Append host element to body ---
  document.body.appendChild(host);

  // --- 7. Render Preact tree ---
  render(h(InPagePanel, null), mountPoint);

  // --- 8. Return cleanup function ---
  return () => {
    render(null, mountPoint);
    host.remove();
    if (fontLink) fontLink.remove();
  };
}

export default startStudio;
