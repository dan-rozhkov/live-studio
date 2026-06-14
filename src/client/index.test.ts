import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the heavy Preact root component so render() does not pull in the entire
// WS / observer / store subsystem. We only care about the mount lifecycle in
// index.ts, not InPagePanel's internals.
vi.mock('./components/InPagePanel', () => ({
  InPagePanel: () => null,
}));

import { startStudio } from './index';

const TAG_NAME = 'live-studio-panel';
const THEME_KEY = 'livestudio-theme';
const FONT_HREF_FRAGMENT = 'fonts.googleapis.com';

/** Remove any panel hosts and injected font links left in the DOM. */
function cleanDom() {
  document.querySelectorAll(TAG_NAME).forEach((el) => el.remove());
  document
    .querySelectorAll(`link[href*="${FONT_HREF_FRAGMENT}"]`)
    .forEach((el) => el.remove());
}

describe('startStudio lifecycle (index.ts)', () => {
  let cleanups: Array<() => void>;

  beforeEach(() => {
    cleanups = [];
    cleanDom();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    // Run any cleanups returned by startStudio, then hard-clean the DOM.
    cleanups.forEach((fn) => {
      try {
        fn();
      } catch {
        /* noop */
      }
    });
    cleanDom();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  function mount(...args: Parameters<typeof startStudio>) {
    const cleanup = startStudio(...args);
    cleanups.push(cleanup);
    return cleanup;
  }

  // --- 1. Mount creates the host + shadow root + injected style ---------------

  it('mounts a custom-element host with an open shadow root', () => {
    mount();

    const host = document.querySelector(TAG_NAME);
    expect(host).not.toBeNull();
    expect(host!.parentElement).toBe(document.body);
    expect(host!.shadowRoot).not.toBeNull();
  });

  it('injects the theme CSS into a <style> inside the shadow root', () => {
    mount();

    const shadow = document.querySelector(TAG_NAME)!.shadowRoot!;
    const style = shadow.querySelector('style');
    expect(style).not.toBeNull();
    // Assert a real token from THEME_CSS in index.ts.
    expect(style!.textContent).toContain('--ls-accent: #0D99FF');
    expect(style!.textContent).toContain(':host');
  });

  it('creates the Preact mount point with the data-live-studio-root attribute', () => {
    mount();

    const shadow = document.querySelector(TAG_NAME)!.shadowRoot!;
    const mountPoint = shadow.querySelector('[data-live-studio-root]');
    expect(mountPoint).not.toBeNull();
    expect(mountPoint!.tagName.toLowerCase()).toBe('div');
  });

  // --- 2. Idempotent mount ---------------------------------------------------

  it('does not create a second host and warns when called twice', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mount();
    expect(document.querySelectorAll(TAG_NAME)).toHaveLength(1);
    expect(warnSpy).not.toHaveBeenCalled();

    mount(); // second call should early-return
    expect(document.querySelectorAll(TAG_NAME)).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith('[live-studio] Already mounted — skipping.');
  });

  it('returns a no-op cleanup on the duplicate (already-mounted) call', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    mount();
    const secondCleanup = mount();

    // Calling the no-op cleanup must not remove the still-active host.
    secondCleanup();
    expect(document.querySelectorAll(TAG_NAME)).toHaveLength(1);
  });

  // --- 3. Theme via localStorage ---------------------------------------------

  it('reads theme="light" from localStorage and sets data-theme on the host', () => {
    localStorage.setItem(THEME_KEY, 'light');

    mount();

    const host = document.querySelector(TAG_NAME)!;
    expect(host.getAttribute('data-theme')).toBe('light');
  });

  it('does not set data-theme when no light theme is stored', () => {
    // default: nothing in localStorage
    mount();
    expect(document.querySelector(TAG_NAME)!.getAttribute('data-theme')).toBeNull();

    // also: a non-"light" value is ignored
    cleanups.pop()!(); // unmount first instance
    cleanDom();
    localStorage.setItem(THEME_KEY, 'dark');
    mount();
    expect(document.querySelector(TAG_NAME)!.getAttribute('data-theme')).toBeNull();
  });

  // --- 4. Font injection + dedup ---------------------------------------------

  it('injects the Inter font <link> into document.head on first mount', () => {
    mount();

    const links = document.head.querySelectorAll(
      `link[href*="${FONT_HREF_FRAGMENT}"][href*="Inter"]`,
    );
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('rel')).toBe('stylesheet');
  });

  it('does not inject a second font <link> when one already exists (dedup)', () => {
    // Pre-existing Inter link in the host page.
    const existing = document.createElement('link');
    existing.rel = 'stylesheet';
    existing.href =
      'https://fonts.googleapis.com/css2?family=Inter:wght@400&display=swap';
    document.head.appendChild(existing);

    mount();

    const links = document.head.querySelectorAll(
      `link[href*="${FONT_HREF_FRAGMENT}"][href*="Inter"]`,
    );
    expect(links).toHaveLength(1); // still just the pre-existing one
    expect(links[0]).toBe(existing);
  });

  it('does not duplicate the font <link> across mount/cleanup/remount', () => {
    // First mount injects the link.
    const firstCleanup = startStudio();
    let links = document.head.querySelectorAll(
      `link[href*="${FONT_HREF_FRAGMENT}"][href*="Inter"]`,
    );
    expect(links).toHaveLength(1);

    // Cleanup removes the font link it created.
    firstCleanup();
    links = document.head.querySelectorAll(
      `link[href*="${FONT_HREF_FRAGMENT}"][href*="Inter"]`,
    );
    expect(links).toHaveLength(0);

    // Remount injects exactly one again (not two).
    mount();
    links = document.head.querySelectorAll(
      `link[href*="${FONT_HREF_FRAGMENT}"][href*="Inter"]`,
    );
    expect(links).toHaveLength(1);
  });

  // --- 5. Cleanup ------------------------------------------------------------

  it('cleanup removes the host (and its shadow root) from the DOM', () => {
    const cleanup = startStudio();
    expect(document.querySelector(TAG_NAME)).not.toBeNull();

    cleanup();
    expect(document.querySelector(TAG_NAME)).toBeNull();
  });

  it('cleanup removes the font <link> it injected', () => {
    const cleanup = startStudio();
    expect(
      document.head.querySelector(`link[href*="${FONT_HREF_FRAGMENT}"][href*="Inter"]`),
    ).not.toBeNull();

    cleanup();
    expect(
      document.head.querySelector(`link[href*="${FONT_HREF_FRAGMENT}"][href*="Inter"]`),
    ).toBeNull();
  });

  it('cleanup does NOT remove a pre-existing font link it did not inject', () => {
    const existing = document.createElement('link');
    existing.rel = 'stylesheet';
    existing.href =
      'https://fonts.googleapis.com/css2?family=Inter:wght@400&display=swap';
    document.head.appendChild(existing);

    const cleanup = startStudio();
    cleanup();

    // The pre-existing link must survive (cleanup only removes its own injected link,
    // and injectFont returned null because one already existed).
    expect(
      document.head.querySelector(`link[href*="${FONT_HREF_FRAGMENT}"][href*="Inter"]`),
    ).toBe(existing);
  });

  it('allows a fresh mount after cleanup (no lingering already-mounted guard)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const cleanup = startStudio();
    cleanup();

    // Remounting after cleanup should succeed without the "already mounted" warning.
    mount();
    expect(document.querySelectorAll(TAG_NAME)).toHaveLength(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
