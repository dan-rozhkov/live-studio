import { describe, it, expect, beforeEach } from 'vitest';
import { DevToolsBridge } from './bridge';

const payload = () => ({
  targetNodeId: 42,
  targetHtml: '<div>hi</div>',
  selector: '#foo',
  prompt: 'make it pop',
});

describe('DevToolsBridge variant tasks', () => {
  let bridge: DevToolsBridge;

  beforeEach(() => {
    bridge = new DevToolsBridge();
  });

  it('transitions queued -> dispatched -> complete', () => {
    const task = bridge.startVariantTask(payload());
    expect(task.status).toBe('queued');
    expect(task.result).toBeNull();
    expect(bridge.getActiveVariantTask()?.status).toBe('queued');

    const dispatched = bridge.consumeVariantTask();
    expect(dispatched?.id).toBe(task.id);
    expect(dispatched?.status).toBe('dispatched');
    expect(bridge.getActiveVariantTask()?.status).toBe('dispatched');

    const ok = bridge.completeVariantTask(task.id, '<live-studio-variants></live-studio-variants>');
    expect(ok).toBe(true);
    const active = bridge.getActiveVariantTask();
    expect(active?.status).toBe('complete');
    expect(active?.result).toBe('<live-studio-variants></live-studio-variants>');
  });

  it('throws when starting while an active (non-complete) task exists', () => {
    bridge.startVariantTask(payload());
    expect(() => bridge.startVariantTask(payload())).toThrow();
  });

  it('throws when starting after complete without clearing first', () => {
    const t = bridge.startVariantTask(payload());
    bridge.consumeVariantTask();
    bridge.completeVariantTask(t.id, '<x/>');
    expect(() => bridge.startVariantTask(payload())).toThrow();
  });

  it('allows starting again after clearVariantTask', () => {
    const t = bridge.startVariantTask(payload());
    bridge.consumeVariantTask();
    bridge.completeVariantTask(t.id, '<x/>');
    bridge.clearVariantTask();
    const t2 = bridge.startVariantTask(payload());
    expect(t2.status).toBe('queued');
    expect(t2.id).not.toBe(t.id);
  });

  it('completeVariantTask with wrong id returns false and does not change state', () => {
    const t = bridge.startVariantTask(payload());
    bridge.consumeVariantTask();
    const ok = bridge.completeVariantTask('not-the-id', '<x/>');
    expect(ok).toBe(false);
    const active = bridge.getActiveVariantTask();
    expect(active?.id).toBe(t.id);
    expect(active?.status).toBe('dispatched');
    expect(active?.result).toBeNull();
  });

  it('consumeVariantTask returns null when no queued task', () => {
    expect(bridge.consumeVariantTask()).toBeNull();

    const t = bridge.startVariantTask(payload());
    bridge.consumeVariantTask();
    // already dispatched, no longer queued
    expect(bridge.consumeVariantTask()).toBeNull();

    bridge.completeVariantTask(t.id, '<x/>');
    expect(bridge.consumeVariantTask()).toBeNull();
  });
});
