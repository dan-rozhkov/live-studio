// MCP server + tool registration for live-studio

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { DevToolsBridge } from "./bridge.js";
import { findProjectRoot } from "./project-root.js";

// ---------------------------------------------------------------------------
// Tool description & argument schema
// ---------------------------------------------------------------------------

const description =
  "Live Studio DevTools bridge. Use the /studio skill for usage instructions.";

const args = {
  action: z
    .enum([
      "get",
      "panic",
      "calm",
      "ask",
      "message",
      "responding",
      "chat",
      "get-variant-task",
      "variant-result",
      "variant-implemented",
    ])
    .default("get")
    .describe("Action to perform"),
  timeout: z
    .number()
    .min(0)
    .max(60_000)
    .default(30_000)
    .describe("How long to wait for an update in milliseconds (get and ask)"),
  reason: z
    .string()
    .optional()
    .describe("Reason for panic (e.g. 'element_not_found')"),
  element: z
    .string()
    .optional()
    .describe("Element selector that caused the panic"),
  question: z
    .string()
    .optional()
    .describe("Question to display to the user (ask only)"),
  options: z
    .array(z.string())
    .optional()
    .describe("Options for the user to choose from (ask only)"),
  text: z
    .string()
    .min(1)
    .optional()
    .describe("Message text to send to the user (message action)"),
  active: z
    .boolean()
    .optional()
    .describe(
      "Whether the agent is responding (responding action, defaults to true)"
    ),
  taskId: z
    .string()
    .optional()
    .describe("Variant task id (variant-result / variant-implemented)"),
  html: z
    .string()
    .optional()
    .describe("Wrapper HTML <live-studio-variants>…</live-studio-variants> (variant-result)"),
  variantName: z
    .string()
    .optional()
    .describe("Variant data-name that was applied (variant-implemented)"),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function textResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
  };
}

function errorResult(text: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text }],
  };
}

function sendNotification(
  server: McpServer,
  payload: Record<string, unknown>
): void {
  try {
    server.server.notification({
      method: "notifications/claude/channel",
      params: { content: JSON.stringify(payload) },
    });
  } catch {
    // Swallow — the transport may not support notifications.
  }
}

// ---------------------------------------------------------------------------
// Tool handler wiring
// ---------------------------------------------------------------------------

/**
 * Build the `live-studio` tool handler bound to a bridge. Extracted from
 * `initTool` (1:1, no behavior change) so the per-action validation/routing can
 * be unit-tested without constructing an `McpServer`.
 */
export function createToolHandler(bridge: DevToolsBridge) {
  async function ensureBridge() {
    if (bridge.isListening) return null;
    bridge.ensureStarted();
    await bridge.waitUntilReady();
    if (!bridge.isListening) {
      const status = bridge.getStatus();
      return errorResult(
        `Bridge failed to start. ${status.error ?? "WebSocket server is not running."}`
      );
    }
    return null;
  }

  return async ({ action, timeout, reason, element, question, options, text, active, taskId, html, variantName }: {
    action: string;
    timeout: number;
    reason?: string;
    element?: string;
    question?: string;
    options?: string[];
    text?: string;
    active?: boolean;
    taskId?: string;
    html?: string;
    variantName?: string;
  }) => {
      // --- actions that don't need the bridge ---
      if (action === "panic") {
        bridge.sendPanic(reason ?? "unknown", element);
        return textResult("Panic reported to extension.");
      }
      if (action === "calm") {
        bridge.sendCalm();
        return textResult("Panic cleared.");
      }
      if (action === "message") {
        if (!text) {
          return errorResult(
            "The 'message' action requires a non-empty 'text' field."
          );
        }
        bridge.sendAgentMessage(text);
        return textResult("Message sent.");
      }
      if (action === "responding") {
        bridge.sendAgentResponding(active ?? true);
        return textResult("Responding state updated.");
      }

      // --- actions that need the bridge ---
      const bridgeError = await ensureBridge();
      if (bridgeError) return bridgeError;

      if (action === "ask") {
        if (!question || !options || options.length === 0) {
          return errorResult(
            "The 'ask' action requires 'question' and non-empty 'options'."
          );
        }
        bridge.sendQuestion(question, options);
        const answer = await bridge.waitForAnswer(timeout);
        if (!answer) return errorResult("No answer received within timeout.");
        return textResult(JSON.stringify({ answer }));
      }

      if (action === "chat") {
        const msg = await bridge.waitForUserMessage(timeout);
        if (!msg) return errorResult("No message received within timeout.");
        return textResult(JSON.stringify(msg));
      }

      if (action === "get-variant-task") {
        const task = bridge.consumeVariantTask();
        if (!task) return textResult("No pending variant task.");
        return textResult(JSON.stringify({
          taskId: task.id,
          target: { selector: task.selector, html: task.targetHtml, nodeId: task.targetNodeId },
          prompt: task.prompt,
        }));
      }

      if (action === "variant-result") {
        if (!taskId || !html) {
          return errorResult("'variant-result' requires 'taskId' and 'html'.");
        }
        const ok = bridge.completeVariantTask(taskId, html);
        if (!ok) return errorResult("No matching dispatched variant task.");
        bridge.broadcastVariantResult(taskId, html);
        return textResult("Variant result delivered.");
      }

      if (action === "variant-implemented") {
        if (!taskId || !variantName) {
          return errorResult("'variant-implemented' requires 'taskId' and 'variantName'.");
        }
        const task = bridge.getActiveVariantTask();
        if (!task || task.id !== taskId) {
          return errorResult("No matching active variant task.");
        }
        bridge.broadcastVariantImplemented(taskId, variantName);
        bridge.clearVariantTask();
        return textResult("Variant implementation acknowledged.");
      }

      // --- get (default) ---
      return handleGetAction(bridge, timeout);
  };
}

function initTool(server: McpServer, bridge: DevToolsBridge): void {
  server.tool("live-studio", description, args, createToolHandler(bridge) as any);
}

/** Handle the default 'get' action — poll for changes, messages, url, viewport. */
export async function handleGetAction(
  bridge: DevToolsBridge,
  timeout: number
): Promise<{
  content: { type: "text"; text: string }[];
  isError?: true;
}> {
  // A queued variant task takes priority — return immediately without waiting.
  let queuedVariant = bridge.consumeVariantTask();

  const changes = queuedVariant
    ? bridge.pendingChanges.slice()
    : await bridge.waitForUpdate(timeout, () => {
        bridge.sendReady();
      });

  // Re-check after the long-poll: a task may have been started during the wait.
  if (!queuedVariant) queuedVariant = bridge.consumeVariantTask();

  const messages = bridge.consumeUserMessages();

  if (!queuedVariant && !changes && messages.length === 0) {
    return textResult(
      "No pending updates. Call this tool again to continue waiting."
    );
  }

  const url = bridge.consumeUrl();
  const viewport = bridge.consumeViewport();

  const response: Record<string, unknown> = {
    changes: changes ?? [],
  };
  if (changes && changes.length > 0) bridge.consumeChanges(changes.length);
  if (url) response.url = url;
  if (viewport) response.viewport = viewport;
  if (messages.length > 0) response.messages = messages;
  if (queuedVariant) {
    response.variantTask = {
      taskId: queuedVariant.id,
      target: {
        selector: queuedVariant.selector,
        html: queuedVariant.targetHtml,
        nodeId: queuedVariant.targetNodeId,
      },
      prompt: queuedVariant.prompt,
    };
  }

  return textResult(JSON.stringify(response));
}

// ---------------------------------------------------------------------------
// Server entry point
// ---------------------------------------------------------------------------

const instructions =
  "Live Studio bridges a visual editor panel to this agent. Use the /studio skill to start a session.";

export async function startServer(port?: number): Promise<void> {
  const server = new McpServer(
    {
      name: "live-studio",
      version: __VERSION__,
    },
    {
      capabilities: {
        tools: {},
        experimental: { "claude/channel": {} },
      },
      instructions,
    }
  );

  const bridge = new DevToolsBridge(port);
  bridge.watchDesignMd(findProjectRoot());

  initTool(server, bridge);

  bridge.onUpdate = (changes) => {
    sendNotification(server, { changes });
  };

  bridge.onUserMessage = (msg) => {
    sendNotification(server, { messages: [msg] });
  };

  bridge.onVariantTask = (task) => {
    sendNotification(server, {
      variantTask: {
        taskId: task.id,
        target: { selector: task.selector, html: task.targetHtml, nodeId: task.targetNodeId },
        prompt: task.prompt,
      },
    });
  };

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = () => {
    bridge.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
