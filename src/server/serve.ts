// MCP server + tool registration for live-studio

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { DevToolsBridge } from "./bridge.js";

// ---------------------------------------------------------------------------
// Tool description & argument schema
// ---------------------------------------------------------------------------

const description =
  "Live Studio DevTools bridge. Use the /studio skill for usage instructions.";

const args = {
  action: z
    .enum(["get", "panic", "calm", "ask", "message", "responding", "chat"])
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
    .optional()
    .describe("Message text to send to the user (message action)"),
  active: z
    .boolean()
    .optional()
    .describe(
      "Whether the agent is responding (responding action, defaults to true)"
    ),
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

function initTool(server: McpServer, bridge: DevToolsBridge): void {
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

  server.tool(
    "live-studio",
    description,
    args,
    async ({ action, timeout, reason, element, question, options, text, active }) => {
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
        bridge.sendAgentMessage(text ?? "");
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

      // --- get (default) ---
      return handleGetAction(bridge, timeout);
    }
  );
}

/** Handle the default 'get' action — poll for changes, messages, url, viewport. */
async function handleGetAction(
  bridge: DevToolsBridge,
  timeout: number
): Promise<{
  content: { type: "text"; text: string }[];
  isError?: true;
}> {
  const changes = await bridge.waitForUpdate(timeout, () => {
    bridge.sendReady();
  });

  const messages = bridge.consumeUserMessages();

  if (!changes && messages.length === 0) {
    return textResult(
      "No pending updates. Call this tool again to continue waiting."
    );
  }

  const url = bridge.consumeUrl();
  const viewport = bridge.consumeViewport();

  const response: Record<string, unknown> = {
    changes: changes ?? [],
  };
  if (changes && changes.length > 0) bridge.consumeChanges();
  if (url) response.url = url;
  if (viewport) response.viewport = viewport;
  if (messages.length > 0) response.messages = messages;

  return textResult(JSON.stringify(response));
}

// ---------------------------------------------------------------------------
// Server entry point
// ---------------------------------------------------------------------------

const instructions =
  "Live Studio bridges a visual editor panel to this agent. Use the /studio skill to start a session.";

export async function startServer(): Promise<void> {
  const server = new McpServer(
    {
      name: "live-studio",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
        experimental: { "claude/channel": {} },
      },
      instructions,
    }
  );

  const bridge = new DevToolsBridge();

  initTool(server, bridge);

  bridge.onUpdate = (changes) => {
    sendNotification(server, { changes });
  };

  bridge.onUserMessage = (msg) => {
    sendNotification(server, { messages: [msg] });
  };

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
