import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/preact';
import { Server } from 'mock-socket';

import { useMcpDirect } from './use-mcp-direct';
import { useStore } from '../state/store';

/* ──────────────────────────────────────────────────────────────────
 * Characterization tests for the WebSocket client hook.
 *
 * These tests assert the ACTUAL current behavior of the hook so they
 * stay green today. Where current behavior matches a documented bug
 * in docs/code-review-2026-06-10.md, a `// BUG (Pn.m)` comment marks
 * it and the test pins (rather than fixes) the behavior.
 * ────────────────────────────────────────────────────────────────── */

// Each test gets a unique port so a stale mock-socket Server from a
// previous test (or a socket that outlives unmount, per P1.8) can never
// bleed into the next one.
let nextPort = 9900;
function freshPort(): number {
  return nextPort++;
}

const WS_URL = (port: number) => `ws://localhost:${port}`;

/** Render the hook inside a tiny harness and expose its API. */
type Api = ReturnType<typeof useMcpDirect>;
function renderHook(port: number): { api: Api } {
  const ref: { api: Api } = { api: null as unknown as Api };
  function H() {
    ref.api = useMcpDirect(port);
    return null;
  }
  render(<H />);
  return ref;
}

/** Reset the zustand store to a known-clean baseline. */
function resetStore(): void {
  const s = useStore.getState();
  s.setMcpStatus('disconnected');
  s.setAgentResponding(false);
  s.setAgentStatus('idle');
  s.setApplying(false);
  s.setPanic(null);
  s.setQuestion(null);
  s.setDesignMd(null);
  s.setVariant(null);
  s.clearChat();
  s.clearStagedChanges();
}

/** Wait for the next chunk of real microtasks/macrotasks (mock-socket is async). */
function flush(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait until `predicate` is true, flushing real timers in between.
 * Used while fake timers are NOT active.
 */
async function waitFor(predicate: () => boolean, tries = 50): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (predicate()) return;
    await flush(5);
  }
  if (!predicate()) throw new Error('waitFor: condition never became true');
}

let server: Server | null = null;
let serverPort = 0;

function startServer(port: number): Server {
  serverPort = port;
  server = new Server(WS_URL(port));
  return server;
}

afterEach(() => {
  cleanup();
  if (server) {
    server.stop();
    server.close();
    server = null;
  }
  vi.useRealTimers();
});

beforeEach(() => {
  resetStore();
});

/* ── Connect ─────────────────────────────────────────────────────── */

describe('connect', () => {
  it('marks the store connected and sends page-info on open', async () => {
    const port = freshPort();
    const srv = startServer(port);

    const received: string[] = [];
    let connections = 0;
    srv.on('connection', (socket) => {
      connections++;
      socket.on('message', (data) => received.push(data as string));
    });

    renderHook(port);

    await waitFor(() => useStore.getState().mcpStatus === 'connected');

    expect(connections).toBe(1);
    expect(useStore.getState().mcpStatus).toBe('connected');

    await waitFor(() => received.length > 0);
    const pageInfo = received.map((r) => JSON.parse(r)).find((m) => m.type === 'page-info');
    expect(pageInfo).toBeTruthy();
    expect(pageInfo.viewport).toBeDefined();
  });

  it('clears agentResponding on connect', async () => {
    const port = freshPort();
    startServer(port);
    useStore.getState().setAgentResponding(true);

    renderHook(port);
    await waitFor(() => useStore.getState().mcpStatus === 'connected');

    expect(useStore.getState().agentResponding).toBe(false);
  });
});

/* ── Incoming message routing ────────────────────────────────────── */

describe('incoming message routing', () => {
  async function connectedServer() {
    const port = freshPort();
    const srv = startServer(port);
    let sockets: ReturnType<Server['on']> extends never ? never : any = null;
    srv.on('connection', (socket) => {
      sockets = socket;
    });
    renderHook(port);
    await waitFor(() => useStore.getState().mcpStatus === 'connected' && sockets !== null);
    return { srv, send: (obj: unknown) => sockets.send(JSON.stringify(obj)) };
  }

  it('panic → sets panic + adds an agent chat message', async () => {
    const { send } = await connectedServer();
    send({ type: 'panic', reason: 'boom' });
    await waitFor(() => useStore.getState().panic !== null);

    expect(useStore.getState().panic?.message).toContain('boom');
    const msgs = useStore.getState().chatMessages;
    expect(msgs[msgs.length - 1].role).toBe('agent');
  });

  it('panic with element_not_found → friendly reason text', async () => {
    const { send } = await connectedServer();
    send({ type: 'panic', reason: 'element_not_found' });
    await waitFor(() => useStore.getState().panic !== null);
    expect(useStore.getState().panic?.message).toContain("couldn't find this element");
  });

  it('calm → clears panic', async () => {
    const { send } = await connectedServer();
    useStore.getState().setPanic({ message: 'x' });
    send({ type: 'calm' });
    await waitFor(() => useStore.getState().panic === null);
    expect(useStore.getState().panic).toBeNull();
  });

  it('agent-responding (active) → updates agentResponding', async () => {
    const { send } = await connectedServer();
    expect(useStore.getState().agentResponding).toBe(false);
    send({ type: 'agent-responding', active: true });
    await waitFor(() => useStore.getState().agentResponding === true);
    expect(useStore.getState().agentResponding).toBe(true);
  });

  it('design-md → sets designMd content', async () => {
    const { send } = await connectedServer();
    send({ type: 'design-md', content: '# Hello' });
    await waitFor(() => useStore.getState().designMd.content === '# Hello');
    expect(useStore.getState().designMd.content).toBe('# Hello');
  });

  it('variant-started → seeds variant state in requested phase', async () => {
    const { send } = await connectedServer();
    send({ type: 'variant-started', taskId: 't1', targetNodeId: 42 });
    await waitFor(() => useStore.getState().variant !== null);
    const v = useStore.getState().variant!;
    expect(v.taskId).toBe('t1');
    expect(v.targetNodeId).toBe(42);
    expect(v.phase).toBe('requested');
    expect(v.activeName).toBe('Original');
  });

  it('variant-cancelled → clears variant', async () => {
    const { send } = await connectedServer();
    useStore.getState().setVariant({
      taskId: 't1',
      targetNodeId: 1,
      phase: 'previewing',
      variantNames: [],
      activeName: 'Original',
    });
    send({ type: 'variant-cancelled', taskId: 't1' });
    await waitFor(() => useStore.getState().variant === null);
    expect(useStore.getState().variant).toBeNull();
  });

  it('ready → clears applying', async () => {
    const { send } = await connectedServer();
    useStore.getState().setApplying(true);
    send({ type: 'ready' });
    await waitFor(() => useStore.getState().applying === false);
    expect(useStore.getState().applying).toBe(false);
  });

  it('ask → sets a question', async () => {
    const { send } = await connectedServer();
    send({ type: 'ask', question: 'pick one', options: ['a', 'b'] });
    await waitFor(() => useStore.getState().question !== null);
    expect(useStore.getState().question?.text).toBe('pick one');
    expect(useStore.getState().question?.options).toEqual(['a', 'b']);
  });

  it('invalid JSON does not break processing of the next valid message', async () => {
    const { srv, send } = await connectedServer();
    // raw invalid JSON via the underlying server socket
    srv.clients().forEach((c) => c.send('{not json'));
    await flush(10);
    // store untouched
    expect(useStore.getState().panic).toBeNull();
    // next valid message still processed
    send({ type: 'calm' });
    send({ type: 'design-md', content: 'after-bad-json' });
    await waitFor(() => useStore.getState().designMd.content === 'after-bad-json');
    expect(useStore.getState().designMd.content).toBe('after-bad-json');
  });

  it('unknown-type message is ignored and does not block the next valid one', async () => {
    const { send } = await connectedServer();
    send({ type: 'totally-unknown-type', foo: 1 });
    send({ type: 'design-md', content: 'after-unknown' });
    await waitFor(() => useStore.getState().designMd.content === 'after-unknown');
    expect(useStore.getState().designMd.content).toBe('after-unknown');
  });

  it('variant-result for an unknown taskId is ignored (early return)', async () => {
    const { send } = await connectedServer();
    // No active variant → handler returns early, must not throw / change state.
    send({ type: 'variant-result', taskId: 'nope', html: '<div></div>' });
    send({ type: 'design-md', content: 'after-variant-result' });
    await waitFor(() => useStore.getState().designMd.content === 'after-variant-result');
    expect(useStore.getState().variant).toBeNull();
  });

  // BUG (P3.1): the entire message dispatcher is wrapped in a single
  // `catch { /* Ignore malformed messages */ }`, so a REAL exception
  // thrown by a handler (not just a JSON.parse failure) is swallowed
  // silently and indistinguishably from malformed input. We pin that
  // behavior here: a handler-internal throw must not surface and must
  // not stop the next valid message from being processed.
  it('BUG (P3.1): a handler exception is swallowed; next message still processed', async () => {
    const { send } = await connectedServer();
    // `variant-result` with a matching taskId drives into getElementById /
    // startVariantPreview. With targetNodeId pointing at an unregistered id,
    // getElementById returns undefined → handler takes the "Target element no
    // longer in DOM" branch (no throw). To force a real throw we make the
    // store's setVariant throw transiently is intrusive; instead we rely on
    // `user-message-ack` with non-array ids, which makes acknowledgeMessages
    // build `new Set(ids)` over a non-iterable → throws, swallowed by catch.
    send({ type: 'user-message-ack', ids: 123 });
    send({ type: 'design-md', content: 'after-handler-throw' });
    await waitFor(() => useStore.getState().designMd.content === 'after-handler-throw');
    expect(useStore.getState().designMd.content).toBe('after-handler-throw');
  });
});

/* ── Offline send queue ──────────────────────────────────────────── */

describe('offline send queue', () => {
  it('queues a message while disconnected and flushes it in order on connect', async () => {
    const port = freshPort();
    // Render with NO server up yet → WebSocket will fail to open; socketRef
    // stays null so sends are queued.
    const ref = renderHook(port);
    await flush(20); // let the failing connection settle

    expect(useStore.getState().mcpStatus).not.toBe('connected');

    // Queue two messages while offline.
    ref.api.sendUserMessage('first', []);
    ref.api.sendUserMessage('second', []);

    // Now bring the server up and trigger a reconnect.
    const srv = startServer(port);
    const received: any[] = [];
    srv.on('connection', (socket) => {
      socket.on('message', (data) => received.push(JSON.parse(data as string)));
    });

    ref.api.reconnect();
    await waitFor(() => useStore.getState().mcpStatus === 'connected');
    await waitFor(() => received.filter((m) => m.type === 'user-message').length >= 2);

    const userMsgs = received.filter((m) => m.type === 'user-message');
    expect(userMsgs.map((m) => m.text)).toEqual(['first', 'second']);
  });

  it('caps the offline queue at 50; oldest entries beyond the cap are dropped', async () => {
    const port = freshPort();
    const ref = renderHook(port);
    await flush(20);
    expect(useStore.getState().mcpStatus).not.toBe('connected');

    // Push 60 while offline; cap is `offlineQueueRef.length < 50`, so only
    // the first 50 are retained — entries 51..60 are dropped (NOT a ring
    // buffer: the cap drops the NEWEST beyond 50, keeping the oldest 50).
    for (let i = 0; i < 60; i++) {
      ref.api.sendUserMessage(`m${i}`, []);
    }

    const srv = startServer(port);
    const received: any[] = [];
    srv.on('connection', (socket) => {
      socket.on('message', (data) => received.push(JSON.parse(data as string)));
    });

    ref.api.reconnect();
    await waitFor(() => useStore.getState().mcpStatus === 'connected');
    await waitFor(() => received.filter((m) => m.type === 'user-message').length >= 50, 80);

    const texts = received.filter((m) => m.type === 'user-message').map((m) => m.text);
    expect(texts.length).toBe(50);
    // Oldest 50 kept, newest 10 dropped.
    expect(texts[0]).toBe('m0');
    expect(texts[49]).toBe('m49');
    expect(texts).not.toContain('m59');
  });
});

/* ── Reconnect / backoff ─────────────────────────────────────────── */

describe('reconnect', () => {
  it('after the server closes the socket, a scheduled warm-reconnect re-establishes the connection', async () => {
    const port = freshPort();
    const srv = startServer(port);
    let connections = 0;
    srv.on('connection', () => {
      connections++;
    });

    renderHook(port);
    // Real-timer connect first (mock-socket open is async via microtasks).
    await waitFor(() => useStore.getState().mcpStatus === 'connected');
    expect(connections).toBe(1);

    // Install fake timers BEFORE the close so the warm-reconnect setTimeout
    // (reconnectDelay = WARM_RECONNECT_INITIAL = 2000ms) is captured by them.
    vi.useFakeTimers();
    try {
      // Force a server-side close → hook's onclose schedules the reconnect.
      srv.clients().forEach((c) => c.close());
      // mock-socket delivers onclose via a (real) microtask, which fake timers
      // don't run; flush real microtasks while fake timers hold wall clock.
      await Promise.resolve();
      await Promise.resolve();

      // Fire the 2000ms reconnect timer, then let the new socket's async open
      // complete on real microtasks. Interleave a few times for robustness.
      for (let i = 0; i < 5 && connections < 2; i++) {
        await vi.advanceTimersByTimeAsync(2000);
        await Promise.resolve();
        await Promise.resolve();
      }
    } finally {
      vi.useRealTimers();
    }
    await waitFor(() => connections >= 2, 100);
    expect(connections).toBeGreaterThanOrEqual(2);
  });

  it('reconnect() while connected closes the old socket and opens exactly one new one', async () => {
    const port = freshPort();
    const srv = startServer(port);
    let connections = 0;
    srv.on('connection', () => {
      connections++;
    });

    const ref = renderHook(port);
    await waitFor(() => useStore.getState().mcpStatus === 'connected');
    expect(connections).toBe(1);

    // reconnect() nulls onclose, closes existing socket, then connects again.
    // Because socketRef is non-null, the connect() guard does NOT short-circuit
    // (reconnect cleared the ref), so a single new connection is made.
    ref.api.reconnect();
    await waitFor(() => connections >= 2);
    await flush(30);
    // No third/parallel socket from a stray reconnect.
    expect(connections).toBe(2);
  });
});

/* ── Lifecycle (P1.8) ────────────────────────────────────────────── */

describe('lifecycle (P1.8 — pinned current behavior)', () => {
  // BUG (P1.8): socketRef is assigned ONLY inside ws.onopen, and onopen
  // does NOT check activeRef. If the harness unmounts while the socket is
  // still CONNECTING, the teardown sees socketRef.current === null and so
  // cannot close the pending socket — it opens AFTER unmount and lives on.
  // We pin this: the server still observes a completed connection even
  // though the component is gone, and onopen still mutates the store.
  it('BUG (P1.8): unmount while CONNECTING leaves the socket to open after teardown', async () => {
    const port = freshPort();
    const srv = startServer(port);
    let connections = 0;
    srv.on('connection', () => {
      connections++;
    });

    renderHook(port);
    // Unmount immediately — before the async open completes. socketRef is
    // still null at this point, so teardown cannot close the pending socket.
    cleanup();

    // The connection still completes server-side (orphaned socket).
    await waitFor(() => connections >= 1, 60);
    expect(connections).toBe(1);

    // And onopen (which lacks an activeRef guard) still flips the store to
    // 'connected' after the component has unmounted — pinning the race.
    expect(useStore.getState().mcpStatus).toBe('connected');
  });

  it('reconnect() before any socket exists creates a connection (no existing-socket guard hit)', async () => {
    const port = freshPort();
    // No server yet → first connect() fails to open, socketRef stays null.
    const ref = renderHook(port);
    await flush(20);
    expect(useStore.getState().mcpStatus).not.toBe('connected');

    const srv = startServer(port);
    let connections = 0;
    srv.on('connection', () => {
      connections++;
    });

    // socketRef is null → reconnect() skips the close branch and just calls
    // connect(); the connect() guard `if (socketRef.current) return` does not
    // fire, so a connection is made.
    ref.api.reconnect();
    await waitFor(() => connections >= 1);
    expect(connections).toBe(1);
  });
});
