import { describe, it, expect, beforeEach } from 'vitest';
import {
  injectVariantsGlobalCss,
  injectVariantsMarkup,
  acceptVariantInDom,
  setActiveVariant,
} from './variants-bridge';

const SAMPLE_HTML = `
<live-studio-variants>
  <live-studio-variant data-name="Original" data-active>
    <style>@scope { p { color: red; } }</style>
    <p>Original content</p>
  </live-studio-variant>
  <live-studio-variant data-name="Bold">
    <p><strong>Bold content</strong></p>
  </live-studio-variant>
  <live-studio-variant data-name="Italic">
    <p><em>Italic content</em></p>
  </live-studio-variant>
</live-studio-variants>
`;

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('injectVariantsGlobalCss', () => {
  it('is idempotent — only one <style> tag in head after multiple calls', () => {
    injectVariantsGlobalCss();
    injectVariantsGlobalCss();
    injectVariantsGlobalCss();
    const styles = document.head.querySelectorAll('style#live-studio-variants-styles');
    expect(styles.length).toBe(1);
  });
});

describe('injectVariantsMarkup', () => {
  it('replaces target with variants wrapper containing 3 variants', () => {
    const target = document.createElement('div');
    target.id = 'target';
    document.body.appendChild(target);

    const wrapper = injectVariantsMarkup(target, SAMPLE_HTML);

    expect(wrapper).not.toBeNull();
    expect(wrapper!.tagName.toLowerCase()).toBe('live-studio-variants');
    expect(document.getElementById('target')).toBeNull();
    expect(document.body.contains(wrapper!)).toBe(true);
    const variants = wrapper!.querySelectorAll('live-studio-variant');
    expect(variants.length).toBe(3);
    // global css injected
    expect(document.getElementById('live-studio-variants-styles')).not.toBeNull();
  });

  it('returns null and leaves DOM untouched when html has no wrapper', () => {
    const target = document.createElement('div');
    target.id = 'target';
    document.body.appendChild(target);
    const before = document.body.innerHTML;

    const result = injectVariantsMarkup(target, '<div>just some junk</div>');

    expect(result).toBeNull();
    expect(document.body.innerHTML).toBe(before);
  });
});

describe('setActiveVariant', () => {
  it('moves data-active to the named variant', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const wrapper = injectVariantsMarkup(target, SAMPLE_HTML)!;

    setActiveVariant(wrapper, 'Bold');

    const variants = wrapper.querySelectorAll('live-studio-variant');
    const active = wrapper.querySelectorAll('live-studio-variant[data-active]');
    expect(active.length).toBe(1);
    expect((active[0] as HTMLElement).getAttribute('data-name')).toBe('Bold');
    expect(variants.length).toBe(3);
  });

  it('falls back to first variant when name not found', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const wrapper = injectVariantsMarkup(target, SAMPLE_HTML)!;

    setActiveVariant(wrapper, 'NoSuchName');

    const active = wrapper.querySelector('live-studio-variant[data-active]') as HTMLElement;
    expect(active.getAttribute('data-name')).toBe('Original');
  });
});

describe('acceptVariantInDom', () => {
  it('replaces wrapper with the active variant content and strips <style>', () => {
    const target = document.createElement('div');
    target.id = 'target';
    document.body.appendChild(target);
    const wrapper = injectVariantsMarkup(target, SAMPLE_HTML)!;
    setActiveVariant(wrapper, 'Bold');

    acceptVariantInDom(wrapper);

    expect(document.body.contains(wrapper)).toBe(false);
    expect(document.body.querySelector('style')).toBeNull();
    expect(document.body.querySelector('strong')?.textContent).toBe('Bold content');
  });
});
