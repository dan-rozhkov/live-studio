// ---------------------------------------------------------------------------
// bridge.ws.test.ts — server WebSocket protocol over the wire (plan §2)
//
// Boots a real DevToolsBridge on an OS-assigned port (0) and drives it with a
// real `ws` client, exercising the protocol end-to-end. The agent side is the
// bridge's public API (waitForUpdate/waitForAnswer/consumeChanges) — there is
// no separate agent transport, so calling those directly is the natural seam.
//
// Covers: P0.2 (malformed frame must not crash the process), P1.2 (lost-update
// race + concurrent gets), P1.14 (empty answer ≠ timeout).
//
// Real timers throughout — these are real localhost sockets.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocket as WsClient } from 'ws';
import { DevToolsBridge } from './bridge';

let bridge: DevToolsBridge;
let sockets: WsClient[] = [];

async function startBridge(): Promise<number> {
  bridge = new DevToolsBridge(0); // port 0 → OS assigns a free port
  bridge.ensureStarted();
  await bridge.waitUntilReady();
  expect(bridge.isListening).toBe(true);
  return bridge.boundPort;
}

/** Open a real ws client and wait for the connection to be established. */
async function connect(port: number): Promise<WsClient> {
  const ws = new WsClient(`ws://127.0.0.1:${port}`);
  sockets.push(ws);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  return ws;
}

function send(ws: WsClient, payload: unknown): void {
  ws.send(JSON.stringify(payload));
}

/** Poll until `cond` is true or the timeout elapses. */
async function waitFor(cond: () => boolean, ms = 1000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('waitFor: condition not met in time');
    await new Promise((r) => setTimeout(r, 5));
  }
}

beforeEach(() => {
  sockets = [];
});

afterEach(async () => {
  for (const ws of sockets) {
    try {
      ws.removeAllListeners();
      ws.terminate();
    } catch {
      /* ignore */
    }
  }
  sockets = [];
  bridge?.stop();
});

describe('DevToolsBridge — WebSocket protocol over the wire', () => {
  it('assigns a real port with port 0 and accepts a connection', async () => {
    const port = await startBridge();
    expect(port).toBeGreaterThan(0);

    const ws = await connect(port);
    await waitFor(() => bridge.getStatus().connected === 1);
    expect(ws.readyState).toBe(WsClient.OPEN);
  });

  // -- P0.2 -----------------------------------------------------------------

  it('survives malformed frames and keeps serving (P0.2)', async () => {
    const port = await startBridge();
    const ws = await connect(port);

    let closedUnexpectedly = false;
    ws.on('close', () => {
      closedUnexpectedly = true;
    });

    // Garbage that previously crashed the process:
    ws.send('not json'); // unparseable
    send(ws, { type: 'page-info' }); // no viewport
    send(ws, { type: 'style-update', changes: 1 }); // changes not an array → push(...1) threw
    send(ws, { type: 42 }); // non-string type
    ws.send(JSON.stringify(null)); // valid JSON, not an object

    // Give the server a moment to process the garbage.
    await new Promise((r) => setTimeout(r, 30));

    // The server is still alive and processes valid traffic afterwards.
    expect(bridge.isListening).toBe(true);
    expect(closedUnexpectedly).toBe(false);

    send(ws, {
      type: 'page-info',
      url: 'https://example.test/page',
      viewport: { width: 1024, height: 768 },
    });
    await waitFor(() => bridge.getStatus().url === 'https://example.test/page');

    send(ws, { type: 'style-update', changes: [{ type: 'style', value: 'red' }] });
    const changes = await bridge.waitForUpdate(500);
    expect(changes).toEqual([{ type: 'style', value: 'red' }]);
  });

  // -- P1.2 -----------------------------------------------------------------

  it('does not lose updates that arrive between snapshot and consume (P1.2)', async () => {
    const port = await startBridge();
    const ws = await connect(port);

    // Change #1 arrives and the agent takes a snapshot of it.
    send(ws, { type: 'style-update', changes: [{ type: 'style', value: 'one' }] });
    await waitFor(() => bridge.pendingChanges.length === 1);
    const snapshot = await bridge.waitForUpdate(500);
    expect(snapshot).toEqual([{ type: 'style', value: 'one' }]);

    // Change #2 arrives BEFORE the agent consumes the snapshot.
    send(ws, { type: 'style-update', changes: [{ type: 'style', value: 'two' }] });
    await waitFor(() => bridge.pendingChanges.length === 2);

    // Consume only what the agent saw (the snapshot prefix).
    bridge.consumeChanges(snapshot!.length);

    // Change #2 must still be deliverable, not silently dropped.
    expect(bridge.pendingChanges).toEqual([{ type: 'style', value: 'two' }]);
    const next = await bridge.waitForUpdate(500);
    expect(next).toEqual([{ type: 'style', value: 'two' }]);
  });

  it('does not duplicate a change across concurrent gets (P1.2)', async () => {
    const port = await startBridge();
    const ws = await connect(port);

    // Two agent long-polls are in flight with nothing pending yet.
    const p1 = bridge.waitForUpdate(500);
    const p2 = bridge.waitForUpdate(500);

    send(ws, { type: 'style-update', changes: [{ type: 'style', value: 'x' }] });

    const [a, b] = await Promise.all([p1, p2]);
    // Both see the same single change — it is not duplicated into the queue.
    expect(a).toEqual([{ type: 'style', value: 'x' }]);
    expect(b).toEqual([{ type: 'style', value: 'x' }]);
    expect(bridge.pendingChanges).toEqual([{ type: 'style', value: 'x' }]);

    // A single consume of that one change drains the queue exactly once.
    bridge.consumeChanges(a!.length);
    expect(bridge.pendingChanges).toEqual([]);
  });

  // -- P1.14 ----------------------------------------------------------------

  it('treats an empty answer as a real answer, not a timeout (P1.14)', async () => {
    const port = await startBridge();
    const ws = await connect(port);

    const answerPromise = bridge.waitForAnswer(500);
    send(ws, { type: 'answer', answer: '' });

    const answer = await answerPromise;
    expect(answer).toBe('');
  });
});
