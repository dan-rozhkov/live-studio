import { h } from 'preact';
import { render } from 'preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateVariableForm } from './CreateVariableForm';

function mount(props: Partial<Parameters<typeof CreateVariableForm>[0]> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const defaults = {
    onCancel: vi.fn(),
    onCreated: vi.fn(),
    onCommit: vi.fn(),
    existingTokens: [] as { name: string }[],
  };
  const merged = { ...defaults, ...props };
  render(h(CreateVariableForm, merged), container);
  return { container, props: merged };
}

function inputs(container: HTMLElement) {
  const all = container.querySelectorAll('input');
  return { name: all[0] as HTMLInputElement, value: all[1] as HTMLInputElement };
}

function setValue(el: HTMLInputElement, val: string) {
  el.value = val;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function pressEnter(el: HTMLInputElement) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
}

function pressEscape(el: HTMLInputElement) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('CreateVariableForm', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('commits valid input on Enter', async () => {
    const { container, props } = mount();
    const { name, value } = inputs(container);
    setValue(name, 'bg');
    setValue(value, '#0af');
    await flush();
    pressEnter(value);
    expect(props.onCommit).toHaveBeenCalledWith('bg', '#0af');
    expect(props.onCreated).toHaveBeenCalledWith('bg');
  });

  it('does not commit and shows an inline error for a duplicate name', async () => {
    const { container, props } = mount({ existingTokens: [{ name: 'bg' }] });
    const { name, value } = inputs(container);
    setValue(name, 'bg');
    setValue(value, '#0af');
    await flush();
    pressEnter(value);
    await flush();
    expect(props.onCommit).not.toHaveBeenCalled();
    expect(container.textContent ?? '').toMatch(/exists|duplicate/i);
  });

  it('cancels on Escape', () => {
    const { container, props } = mount();
    const { name } = inputs(container);
    pressEscape(name);
    expect(props.onCancel).toHaveBeenCalled();
  });
});
