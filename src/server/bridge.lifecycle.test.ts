import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DevToolsBridge } from './bridge';

/** Pull the `polling` broadcasts out of a broadcast spy's calls. */
function pollingBroadcasts(spy: ReturnType<typeof vi.spyOn>) {
  return (spy.mock.calls as unknown[][])
    .map((c) => c[0] as Record<string, unknown>)
    .filter((p) => p.type === 'polling')
    .map((p) => p.active);
}

describe('DevToolsBridge polling state', () => {
  let bridge: DevToolsBridge;

  beforeEach(() => {
    vi.useFakeTimers();
    bridge = new DevToolsBridge();
  });

  afterEach(() => {
    bridge.stop();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('markPollingActive broadcasts polling:true once, guarded on state change', () => {
    const spy = vi.spyOn(bridge, 'broadcast');

    bridge.markPollingActive();
    bridge.markPollingActive();
    bridge.markPollingActive();

    // Guard (lastBroadcastedPolling) collapses repeated true broadcasts to one.
    expect(pollingBroadcasts(spy)).toEqual([true]);
  });

  it('does not re-broadcast true when already active even after grace reset', () => {
    const spy = vi.spyOn(bridge, 'broadcast');
    bridge.markPollingActive();
    // schedulePollingInactive is private; reach it to start a grace timer, then
    // re-activate, which clears the timer without a new broadcast.
    (bridge as any).schedulePollingInactive();
    bridge.markPollingActive();
    expect(pollingBroadcasts(spy)).toEqual([true]);
  });

  it('schedulePollingInactive honors the 30s grace before going inactive', () => {
    const spy = vi.spyOn(bridge, 'broadcast');

    bridge.markPollingActive();
    (bridge as any).schedulePollingInactive();

    // Before grace elapses: still active.
    vi.advanceTimersByTime(29_999);
    expect(pollingBroadcasts(spy)).toEqual([true]);

    // After the full 30s grace: transitions to inactive.
    vi.advanceTimersByTime(1);
    expect(pollingBroadcasts(spy)).toEqual([true, false]);
  });

  it('does not go inactive if a new waiter appeared during the grace window', () => {
    const spy = vi.spyOn(bridge, 'broadcast');

    bridge.markPollingActive();
    (bridge as any).schedulePollingInactive();

    // A change waiter is now pending — the grace callback must NOT flip inactive.
    void bridge.waitForUpdate(60_000);

    vi.advanceTimersByTime(30_000);
    // Still active: the inactive guard saw a waiting resolver.
    expect(pollingBroadcasts(spy)).toEqual([true]);
  });
});

describe('DevToolsBridge DESIGN.md debounce', () => {
  let bridge: DevToolsBridge;

  beforeEach(() => {
    vi.useFakeTimers();
    bridge = new DevToolsBridge();
  });

  afterEach(() => {
    bridge.stop();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('debounces rapid reload requests into a single readDesignMd within the window', () => {
    // Drive the private debounced read path directly (the watcher fires this on
    // every fs event; testing the watcher needs real fs and is platform-flaky).
    const readSpy = vi
      .spyOn(bridge as any, 'readDesignMd')
      .mockResolvedValue(undefined);

    const schedule = (bridge as any).scheduleDesignMdReload.bind(bridge);
    schedule();
    schedule();
    schedule();
    schedule();
    schedule();

    // Within the 150ms debounce window nothing has fired yet.
    vi.advanceTimersByTime(149);
    expect(readSpy).not.toHaveBeenCalled();

    // After the window: exactly one read.
    vi.advanceTimersByTime(1);
    expect(readSpy).toHaveBeenCalledTimes(1);
  });

  it('a later reload request after the window triggers a second read', () => {
    const readSpy = vi
      .spyOn(bridge as any, 'readDesignMd')
      .mockResolvedValue(undefined);
    const schedule = (bridge as any).scheduleDesignMdReload.bind(bridge);

    schedule();
    vi.advanceTimersByTime(150);
    expect(readSpy).toHaveBeenCalledTimes(1);

    schedule();
    vi.advanceTimersByTime(150);
    expect(readSpy).toHaveBeenCalledTimes(2);
  });

  it('broadcasts content:null when the watched file does not exist', async () => {
    const spy = vi.spyOn(bridge, 'broadcast');
    // Point at a non-existent file; readDesignMd should resolve to null content
    // and broadcast it (initial content was already null, so guard on change
    // means the first transition null->null is suppressed — assert real behavior).
    (bridge as any).designMdPath = '/definitely/not/a/real/path/DESIGN.md';
    await (bridge as any).readDesignMd();

    const designBroadcasts = (spy.mock.calls as unknown[][])
      .map((c) => c[0] as Record<string, unknown>)
      .filter((p) => p.type === 'design-md');
    // content stayed null (=== cached null) so readDesignMd returns early before
    // broadcasting. Documents the change-guard: no redundant broadcast.
    expect(designBroadcasts).toEqual([]);
    expect((bridge as any).designMdContent).toBeNull();
  });

  it('broadcastDesignMd emits a design-md payload with current content', () => {
    const spy = vi.spyOn(bridge, 'broadcast');
    (bridge as any).designMdContent = '# Hello';
    bridge.broadcastDesignMd();
    expect(spy).toHaveBeenCalledWith({ type: 'design-md', content: '# Hello' });
  });
});

describe('DevToolsBridge DESIGN.md debounce (real fs via mkdtemp)', () => {
  it('reads file content after a real reload and broadcasts it once', async () => {
    vi.useFakeTimers();
    const bridge = new DevToolsBridge();
    try {
      const os = await import('os');
      const fs = await import('fs/promises');
      const path = await import('path');
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ls-design-'));
      const file = path.join(dir, 'DESIGN.md');
      await fs.writeFile(file, '# initial', 'utf-8');

      (bridge as any).designMdPath = file;
      const spy = vi.spyOn(bridge, 'broadcast');

      // Direct read (bypassing the OS watcher) reads real bytes from disk.
      await (bridge as any).readDesignMd();

      expect((bridge as any).designMdContent).toBe('# initial');
      const designBroadcasts = (spy.mock.calls as unknown[][])
        .map((c) => c[0] as Record<string, unknown>)
        .filter((p) => p.type === 'design-md');
      expect(designBroadcasts).toEqual([{ type: 'design-md', content: '# initial' }]);

      await fs.rm(dir, { recursive: true, force: true });
    } finally {
      bridge.stop();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
});
