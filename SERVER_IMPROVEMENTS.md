# Server Improvements

Analysis of `src/server/` code against TypeScript, Node.js, MCP, and accessibility/skill patterns.

**Date:** 2026-04-12
**Files analyzed:** `cli.ts`, `serve.ts`, `bridge.ts`, `install.ts`, `skill.ts`

---

## `bridge.ts` — WebSocket Server

### Problems

1. **No heartbeat/ping-pong for dead connections**
   - If the browser reloads (HMR), the WebSocket closes but `clients` may hold dead sockets
   - `ws.close()` doesn't always fire reliably during dev server reloads
   - Over time, `clients.size` grows with unusable connections

2. **No `maxPayload` restriction**
   - No limit on incoming message size — theoretically allows a 100MB WS payload

3. **EADDRINUSE error loses stack trace**
   - Only logs `err.code` and `err.message`, not full stack — makes debugging complex port conflicts harder

4. **`started = true` set before `this.start()`**
   - If `start()` fails fatally, a subsequent `ensureStarted()` call won't retry because `this.started` is already `true`

5. **No graceful shutdown on SIGTERM/SIGINT**
   - `stop()` method exists but is never called from a signal handler
   - When the MCP process is killed, pending waiters leak and the WebSocket closes uncleanly

6. **`msg: any` in `handleMessage` loses type safety**
   - No Zod validation on incoming WS messages — invalid payloads silently ignored

### Recommendations

```typescript
// 1. Add ping/pong
this.wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });
});
const interval = setInterval(() => {
  this.wss?.clients.forEach((ws: any) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30_000);

// 2. Add maxPayload
this.wss = new WebSocketServer({ port: this.port, maxPayload: 10 * 1024 * 1024 });

// 5. Add signal handler in serve.ts or bridge.stop()
process.on("SIGINT", () => { bridge.stop(); process.exit(0); });
process.on("SIGTERM", () => { bridge.stop(); process.exit(0); });

// 6. Validate incoming messages with Zod
const msgSchema = z.object({ type: z.string() }).passthrough();
```

---

## `serve.ts` — MCP Server + Tool Registration

### Problems

1. **One giant tool with 7 enum actions**
   - A single `live-studio` tool with `z.enum(["get", "panic", "calm", "ask", "message", "responding", "chat"])` is hard for agents to discover
   - Each action has different argument requirements, making the schema confusing
   - MCP best practice: one tool per action for better agent understanding

2. **No graceful shutdown**
   - No `SIGINT`/`SIGTERM` handling — when killed, the WebSocket and MCP transport are not cleaned up
   - Stdio transport may leak

3. **Empty string validation for `message` action**
   - `text: z.string().optional()` allows empty string `""` which sends a blank message to chat

4. **Untested `handleGetAction` and `initTool`**
   - Functions are not exported, making unit testing difficult
   - No test coverage for the most critical code path (polling loop)

5. **`sendNotification` swallows all errors**
   - Catch-all `try/catch` hides real integration bugs

### Recommendations

```typescript
// 1. Split into separate tools
server.tool("live-studio-get", "...", { timeout: z.number().min(0).max(60_000).default(30_000) }, handler);
server.tool("live-studio-panic", "...", { reason: z.string(), element: z.string().optional() }, handler);
server.tool("live-studio-ask", "...", { question: z.string().min(1), options: z.array(z.string().min(1)), timeout: z.number() }, handler);
// etc.

// 2. Graceful shutdown
process.on("SIGINT", () => {
  bridge.stop();
  server.close();
  process.exit(0);
});

// 3. Non-empty text
text: z.string().min(1).describe("Message text to send to the user"),
```

---

## `cli.ts` — CLI Entry Point

### Problems

1. **No `--help` flag** — standard CLI convention broken
2. **No `--version` flag** — can't check which version is running
3. **No `--port` override** — port can only be changed via `LIVE_STUDIO_PORT` env var
4. **No error formatting** — `console.error(err)` prints raw stack, not user-friendly message
5. **No `--verbose` / `DEBUG` mode** — hard to diagnose connection issues

### Recommendations

```typescript
// Minimal: add --help and --port without dependencies
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: live-studio [command] [options]");
  console.log("Commands:");
  console.log("  install    Install MCP config and skill files");
  console.log("  (default)  Start MCP server");
  console.log("Options:");
  console.log("  --port, -p <number>  WebSocket port (default: 9877)");
  console.log("  --help, -h           Show this help");
  console.log("  --version, -v        Show version");
  process.exit(0);
}
if (args.includes("--version") || args.includes("-v")) {
  console.log("0.1.0");
  process.exit(0);
}
const portIdx = args.indexOf("--port");
const port = portIdx !== -1 ? parseInt(args[portIdx + 1]) : undefined;
// pass port to startServer(port)
```

---

## `install.ts` — MCP + Skill Installer

### Problems

1. **Always uses `npx` for MCP entry**
   - `npx` resolves and installs on every invocation (slow)
   - If `live-studio` is already in `node_modules`, a direct path would be instant

2. **No `--global` flag**
   - Skill files are only written to the project directory
   - Users who work across multiple projects need to reinstall each time

3. **`.mcp.json` merge doesn't validate existing config**
   - If the file is malformed JSON, silently overwrites
   - No backup of user's existing config

4. **No uninstall command**
   - Once installed, there's no easy way to remove the MCP config and skill files

### Recommendations

```typescript
// 1. Use direct path if package is local
const localBin = existsSync(join(root, "node_modules", "live-studio", "dist", "cli.mjs"));
const MCP_ENTRY = localBin
  ? { command: "node", args: [localBin] }
  : { command: "npx", args: ["-y", "live-studio"] };

// 3. Better error handling with fallback
const loadConfig = (file: string): Record<string, any> => {
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return {};
  }
};

// 4. Add uninstall
async function uninstall() {
  // remove .mcp.json or remove live-studio entry from it
  // remove skill files
}
```

---

## `skill.ts` — Skill Prompt

### Problems

1. **Polling instructions are extremely verbose**
   - ~200 words just about polling, which can overwhelm agents with context limits
   - Key message ("never stop polling") gets diluted

2. **No mention of graceful session end**
   - When the user closes the browser tab, there's no instruction for the agent to stop

### Recommendations

Condense polling section while keeping the critical rule:

```markdown
### Polling (fallback)

Call `live-studio` repeatedly with a **60-second timeout**. The tool returns empty when no changes are pending — this is normal. **Keep polling indefinitely** until the user ends the session. Never stop early due to timeouts, empty responses, or inactivity. Blocking the chat via polling is the success case.
```

---

## Priority Summary

| Priority | Change | File | Impact |
|----------|--------|------|--------|
| **P0** | Graceful shutdown (SIGINT/SIGTERM) | `bridge.ts`, `serve.ts` | Prevents resource leaks |
| **P0** | WebSocket heartbeat/ping-pong | `bridge.ts` | Fixes dead connections on HMR |
| **P1** | Add `--help`, `--version`, `--port` to CLI | `cli.ts` | Usability |
| **P1** | Validate `text` for message action | `serve.ts` | Data integrity |
| **P1** | `maxPayload` on WebSocket server | `bridge.ts` | Security |
| **P2** | Split single tool into separate tools | `serve.ts` | Agent discoverability |
| **P2** | Use direct path instead of npx when local | `install.ts` | Performance |
| **P2** | Add `--global` flag for skill install | `install.ts` | Multi-project workflow |
| **P2** | Condense polling instructions | `skill.ts` | Agent clarity |
| **P3** | Add uninstall command | `install.ts` | Cleanup |
| **P3** | Export `handleGetAction`/`initTool` for testing | `serve.ts` | Testability |
| **P3** | Zod validation for incoming WS messages | `bridge.ts` | Type safety |
