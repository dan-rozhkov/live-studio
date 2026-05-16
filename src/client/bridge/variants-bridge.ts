import DOMPurify from 'dompurify';

const STYLE_ID = 'live-studio-variants-styles';

const GLOBAL_CSS = `
live-studio-variants    { display: contents }
live-studio-variant     { display: contents }
live-studio-variant:not([data-active]) { display: none }
`;

export function injectVariantsGlobalCss(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = GLOBAL_CSS;
  document.head.appendChild(style);
}

export function injectVariantsMarkup(targetEl: Element, html: string): HTMLElement | null {
  const clean = DOMPurify.sanitize(html, {
    ADD_TAGS: ['style', 'live-studio-variants', 'live-studio-variant'],
    ADD_ATTR: ['data-name', 'data-active'],
    FORCE_BODY: true,
  });

  const doc = new DOMParser().parseFromString(clean, 'text/html');
  const wrapper = doc.querySelector('live-studio-variants') as HTMLElement | null;
  if (!wrapper) return null;

  const parent = targetEl.parentNode;
  if (!parent) return null;

  injectVariantsGlobalCss();

  const imported = document.importNode(wrapper, true) as HTMLElement;
  parent.replaceChild(imported, targetEl);
  return imported;
}

export function acceptVariantInDom(wrapper: HTMLElement): void {
  const active = wrapper.querySelector('live-studio-variant[data-active]') as HTMLElement | null;
  if (!active) {
    wrapper.remove();
    return;
  }

  // Strip <style> tags — they were scoped and lose meaning outside the variant.
  active.querySelectorAll('style').forEach((s) => s.remove());

  const parent = wrapper.parentNode;
  if (!parent) return;

  while (active.firstChild) {
    parent.insertBefore(active.firstChild, wrapper);
  }
  parent.removeChild(wrapper);
}

export function setActiveVariant(wrapper: HTMLElement, name: string): void {
  const variants = Array.from(
    wrapper.querySelectorAll('live-studio-variant'),
  ) as HTMLElement[];
  if (variants.length === 0) return;

  variants.forEach((v) => v.removeAttribute('data-active'));
  const match = variants.find((v) => v.getAttribute('data-name') === name) ?? variants[0];
  match.setAttribute('data-active', '');
}

// Preview controller — holds the single active wrapper and a suppress depth
// counter so the page-bridge MutationObserver can skip our intentional swaps.

let currentWrapper: HTMLElement | null = null;
let currentTaskId: string | null = null;
let suppressDepth = 0;

export function isVariantSwapInProgress(): boolean {
  return suppressDepth > 0;
}

function suppressed<T>(cb: () => T): T {
  suppressDepth++;
  try {
    return cb();
  } finally {
    suppressDepth--;
  }
}

export interface PreviewState {
  taskId: string;
  variantNames: string[];
  activeName: string;
}

function collectState(taskId: string, wrapper: HTMLElement): PreviewState {
  const variants = Array.from(
    wrapper.querySelectorAll('live-studio-variant'),
  ) as HTMLElement[];
  const names = variants.map((v) => v.getAttribute('data-name') || '');
  const activeEl = wrapper.querySelector(
    'live-studio-variant[data-active]',
  ) as HTMLElement | null;
  const activeName =
    activeEl?.getAttribute('data-name') || names[0] || 'Original';
  return { taskId, variantNames: names, activeName };
}

export function startVariantPreview(
  taskId: string,
  targetEl: Element,
  html: string,
): PreviewState | null {
  if (currentWrapper) cancelVariantPreview();

  const wrapper = suppressed(() => injectVariantsMarkup(targetEl, html));
  if (!wrapper) return null;

  currentWrapper = wrapper;
  currentTaskId = taskId;
  return collectState(taskId, wrapper);
}

export function setActiveVariantPreview(name: string): PreviewState | null {
  if (!currentWrapper || !currentTaskId) return null;
  suppressed(() => setActiveVariant(currentWrapper!, name));
  return collectState(currentTaskId, currentWrapper);
}

export function acceptVariantPreview(): boolean {
  if (!currentWrapper) return false;
  acceptVariantInDom(currentWrapper);
  currentWrapper = null;
  currentTaskId = null;
  return true;
}

export function cancelVariantPreview(): boolean {
  if (!currentWrapper) return false;
  suppressed(() => setActiveVariant(currentWrapper!, 'Original'));
  acceptVariantInDom(currentWrapper);
  currentWrapper = null;
  currentTaskId = null;
  return true;
}

