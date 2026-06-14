import { describe, it, expect, beforeEach } from 'vitest';
import { DevToolsBridge } from './bridge';
import { createToolHandler, handleGetAction } from './serve';

type ToolResult = {
  isError?: true;
  content: { type: string; text: string }[];
};
type Handler = (args: any) => Promise<ToolResult>;

const variantPayload = () => ({
  targetNodeId: 42,
  targetHtml: '<div>hi</div>',
  selector: '#foo',
  prompt: 'make it pop',
});

/** Parse the JSON text out of a textResult tool response. */
function parseText(res: { content: { type: string; text: string }[] }) {
  return JSON.parse(res.content[0].text);
}

/** Default args object — handler destructures every field. */
const baseArgs = {
  action: 'get',
  timeout: 0,
  reason: undefined,
  element: undefined,
  question: undefined,
  options: undefined,
  text: undefined,
  active: undefined,
  taskId: undefined,
  html: undefined,
  variantName: undefined,
};

describe('serve tool handler — per-action validation', () => {
  let bridge: DevToolsBridge;
  let handler: Handler;

  beforeEach(() => {
    bridge = new DevToolsBridge();
    // Pretend the WS server is already listening so ensureBridge() short-circuits
    // and never starts a real socket. broadcast() is a no-op with no clients.
    Object.defineProperty(bridge, 'isListening', { get: () => true });
    handler = createToolHandler(bridge) as unknown as Handler;
  });

  it("'ask' without options returns an errorResult (not a throw)", async () => {
    const res = await handler({ ...baseArgs, action: 'ask', question: 'Pick one' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("'ask' action requires");
  });

  it("'ask' with empty options array returns an errorResult", async () => {
    const res = await handler({
      ...baseArgs,
      action: 'ask',
      question: 'Pick one',
      options: [],
    });
    expect(res.isError).toBe(true);
  });

  it("'variant-result' without taskId/html returns an errorResult", async () => {
    const res = await handler({ ...baseArgs, action: 'variant-result' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("'variant-result' requires");
  });

  it("'variant-result' with html but no taskId returns an errorResult", async () => {
    const res = await handler({ ...baseArgs, action: 'variant-result', html: '<x/>' });
    expect(res.isError).toBe(true);
  });

  it("'variant-result' with an unknown taskId returns 'No matching dispatched variant task'", async () => {
    // Start + dispatch a task, then try to complete a different id.
    bridge.startVariantTask(variantPayload());
    bridge.consumeVariantTask();
    const res = await handler({
      ...baseArgs,
      action: 'variant-result',
      taskId: 'not-the-id',
      html: '<x/>',
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toBe('No matching dispatched variant task.');
  });

  it("'variant-result' with the correct dispatched id completes the task", async () => {
    const task = bridge.startVariantTask(variantPayload());
    bridge.consumeVariantTask();
    const res = await handler({
      ...baseArgs,
      action: 'variant-result',
      taskId: task.id,
      html: '<live-studio-variants></live-studio-variants>',
    });
    expect(res.isError).toBeUndefined();
    expect(bridge.getActiveVariantTask()?.status).toBe('complete');
  });

  it("'variant-implemented' with a wrong taskId returns errorResult AND does not clear the active task", async () => {
    const task = bridge.startVariantTask(variantPayload());
    const res = await handler({
      ...baseArgs,
      action: 'variant-implemented',
      taskId: 'wrong-id',
      variantName: 'A',
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toBe('No matching active variant task.');
    // Active task must still be present.
    expect(bridge.getActiveVariantTask()?.id).toBe(task.id);
  });

  it("'variant-implemented' without variantName returns an errorResult", async () => {
    const task = bridge.startVariantTask(variantPayload());
    const res = await handler({
      ...baseArgs,
      action: 'variant-implemented',
      taskId: task.id,
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("'variant-implemented' requires");
    expect(bridge.getActiveVariantTask()?.id).toBe(task.id);
  });

  it("'variant-implemented' with the matching id acknowledges and clears the task", async () => {
    const task = bridge.startVariantTask(variantPayload());
    const res = await handler({
      ...baseArgs,
      action: 'variant-implemented',
      taskId: task.id,
      variantName: 'A',
    });
    expect(res.isError).toBeUndefined();
    expect(bridge.getActiveVariantTask()).toBeNull();
  });

  it("'message' without text returns an errorResult (does not require bridge)", async () => {
    const res = await handler({ ...baseArgs, action: 'message' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("'message' action requires");
  });
});

describe('handleGetAction — variant-task priority and re-check', () => {
  let bridge: DevToolsBridge;

  beforeEach(() => {
    bridge = new DevToolsBridge();
  });

  it('returns immediately with a queued variant task (priority over long-poll)', async () => {
    bridge.startVariantTask(variantPayload());
    const res = await handleGetAction(bridge, 30_000);
    const body = parseText(res);
    expect(body.variantTask).toBeDefined();
    expect(body.variantTask.target.selector).toBe('#foo');
    expect(body.changes).toEqual([]);
    // Task was consumed (queued -> dispatched).
    expect(bridge.getActiveVariantTask()?.status).toBe('dispatched');
  });

  it('picks up a variant task queued DURING the long-poll wait (re-check after wait)', async () => {
    // No task and no changes initially: handleGetAction will long-poll.
    // Queue a variant task shortly after, which flushes the waiting resolver.
    const p = handleGetAction(bridge, 30_000);

    // Let the microtask/await settle so the resolver is registered, then start
    // a task — start-variant flushing wakes the long-poll in the real flow; here
    // we drive the bridge directly: startVariantTask + flush waiting resolvers.
    await Promise.resolve();
    bridge.startVariantTask(variantPayload());
    // Mimic the start-variant message path that wakes waiters.
    (bridge as any).flushWaitingResolvers();

    const res = await p;
    const body = parseText(res);
    expect(body.variantTask).toBeDefined();
    expect(body.variantTask.target.nodeId).toBe(42);
    expect(bridge.getActiveVariantTask()?.status).toBe('dispatched');
  });

  it('returns "No pending updates" when nothing is queued and the poll times out', async () => {
    const res = await handleGetAction(bridge, 0);
    expect(res.content[0].text).toContain('No pending updates');
  });
});
