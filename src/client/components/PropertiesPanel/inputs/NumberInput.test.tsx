// ---------------------------------------------------------------------------
// NumberInput.test.tsx — commit logic (plan §3 number-commit / P0.7)
//
// Red-then-fix. The NumberInput used to silently corrupt the user's CSS on
// commit: `autopx` / `2rempx` (unit blindly appended), `NaNpx` (stepping a
// non-numeric base), and `12.5px → 13px` (display rounding committed on an
// untouched blur). These tests pin the DESIRED behavior of the extracted pure
// `commitText` and of the component's commit flow.
// ---------------------------------------------------------------------------

import { h } from 'preact';
import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NumberInput, commitText, type NumberInputProps } from './NumberInput';

// -- pure function ----------------------------------------------------------

describe('commitText', () => {
  it('keeps a bare number and appends the field unit', () => {
    expect(commitText('100', 'px')).toBe('100px');
    expect(commitText('-5', 'px')).toBe('-5px');
    expect(commitText('12.5', 'px')).toBe('12.5px');
  });

  it('keeps the unit the user typed, never doubling it (2rem → 2rem)', () => {
    expect(commitText('2rem', 'px')).toBe('2rem');
    expect(commitText('50%', 'px')).toBe('50%');
    expect(commitText('12.5px', 'px')).toBe('12.5px');
  });

  it('commits CSS keywords verbatim, never "autopx"', () => {
    expect(commitText('auto', 'px')).toBe('auto');
    expect(commitText('AUTO', 'px')).toBe('auto');
    expect(commitText('inherit', 'px')).toBe('inherit');
    expect(commitText('fit-content', 'px')).toBe('fit-content');
  });

  it('treats empty or unrecognised input as a no-op (null)', () => {
    expect(commitText('', 'px')).toBeNull();
    expect(commitText('   ', 'px')).toBeNull();
    expect(commitText('abc', 'px')).toBeNull();
    expect(commitText('rgb(1,2,3)', 'px')).toBeNull();
  });

  it('omits the unit when there is no fallback unit', () => {
    expect(commitText('0', '')).toBe('0');
    expect(commitText('1.5', '')).toBe('1.5');
  });
});

// -- component commit flow --------------------------------------------------

function mount(props: Partial<NumberInputProps> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const onChange = vi.fn();
  const merged: NumberInputProps = {
    label: 'width', // → LARGE_SPATIAL_UNITS, unit px, step 1
    value: '100px',
    onChange,
    ...props,
  };
  render(h(NumberInput, merged), container);
  const input = container.querySelector('input[type="text"]') as HTMLInputElement;
  return { container, input, onChange };
}

const focus = (el: HTMLInputElement) =>
  el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
const blur = (el: HTMLInputElement) =>
  el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
const type = (el: HTMLInputElement, value: string) => {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
const press = (el: HTMLInputElement, key: string, shiftKey = false) =>
  el.dispatchEvent(
    new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }),
  );
// Preact batches state updates and flushes them on a microtask; let the
// re-render settle so the next handler closes over the updated localValue
// (in a real browser, time passes between a keystroke and the blur).
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('NumberInput commit flow', () => {
  it('commits a typed keyword as-is, not "autopx"', async () => {
    const { input, onChange } = mount({ value: '100px' });
    focus(input);
    type(input, 'auto');
    await flush();
    blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('auto');
  });

  it('keeps a typed unit, not "2rempx"', async () => {
    const { input, onChange } = mount({ value: '100px' });
    focus(input);
    type(input, '2rem');
    await flush();
    blur(input);
    expect(onChange).toHaveBeenCalledWith('2rem');
  });

  it('appends the field unit to a bare number', async () => {
    const { input, onChange } = mount({ value: '100px' });
    focus(input);
    type(input, '50');
    await flush();
    blur(input);
    expect(onChange).toHaveBeenCalledWith('50px');
  });

  it('does not commit unrecognised garbage', async () => {
    const { input, onChange } = mount({ value: '100px' });
    focus(input);
    type(input, 'abc');
    await flush();
    blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('stepping from a non-numeric value never commits NaN', () => {
    const { input, onChange } = mount({ value: 'auto' });
    focus(input);
    press(input, 'ArrowUp');
    expect(onChange).toHaveBeenCalledTimes(1);
    const committed = onChange.mock.calls[0][0] as string;
    expect(committed).not.toContain('NaN');
    expect(committed).toBe('1px'); // 0 (auto → 0) + step 1
  });

  it('focus + blur without editing is a no-op (12.5px stays 12.5px)', () => {
    const { input, onChange } = mount({ value: '12.5px' });
    focus(input);
    blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('commits on Enter through the same path', async () => {
    const { input, onChange } = mount({ value: '100px' });
    focus(input);
    type(input, '2rem');
    await flush();
    press(input, 'Enter');
    expect(onChange).toHaveBeenCalledWith('2rem');
  });
});
