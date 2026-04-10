// DevToolsBridge — WebSocket server for browser <-> MCP communication

import { WebSocketServer, WebSocket } from "ws";

/** Shape of a single style/DOM change coming from the browser editor. */
export interface Change {
  type: string;
  path?: string;
  element?: string;
  name?: string;
  value?: string;
  component?: string;
  source?: string;
}

/** Viewport dimensions reported by the browser. */
export interface Viewport {
  width: number;
  height: number;
}

/** A chat message sent by the user from the browser panel. */
export interface UserMessage {
  text: string;
  attachments?: { nodeId: number; label: string }[];
  clientMsgId?: string;
}

/** A waiter that resolves with a value or null on timeout. */
interface Waiter<T> {
  resolve: (value: T | null) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class DevToolsBridge {
  private static readonly POLLING_GRACE_MS = 30_000;

  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();

  /** Queued style/DOM changes not yet consumed by the agent. */
  pendingChanges: Change[] = [];

  /** Resolvers waiting for the next batch of changes. */
  private waitingResolvers: Waiter<Change[]>[] = [];

  /** Resolver waiting for an answer to an ask() question. */
  private waitingAnswerResolver: Waiter<string> | null = null;

  /** Resolver waiting for the next user chat message. */
  private waitingUserMessageResolver: Waiter<UserMessage> | null = null;

  /** Queued user messages not yet consumed. */
  private pendingUserMessages: UserMessage[] = [];

  private startError: string | null = null;
  private started = false;

  /** Callbacks the MCP layer can hook into. */
  onUpdate: ((changes: Change[]) => void) | null = null;
  onUserMessage: ((msg: UserMessage) => void) | null = null;

  private ready = false;
  private readyPromise: Promise<void> | null = null;

  /** Current page URL reported by the browser. */
  private activeUrl: string | null = null;
  private urlSentToAgent = false;

  /** Current viewport reported by the browser. */
  private activeViewport: Viewport | null = null;
  private viewportSentToAgent = false;

  /** Whether the agent is actively polling. */
  private pollingActive = false;
  private pollingGraceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastBroadcastedPolling: boolean | null = null;

  private readonly port: number;

  constructor(port?: number) {
    this.port = port ?? parseInt(process.env.LIVE_STUDIO_PORT || "9877", 10);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  get isListening(): boolean {
    return this.ready && this.startError === null;
  }

  /** Start the WebSocket server if not already started. */
  ensureStarted(): void {
    if (this.started && !this.startError) return;
    this.started = true;
    this.startError = null;
    this.readyPromise = this.start();
  }

  /** Wait until the server is listening (or has failed to start). */
  async waitUntilReady(): Promise<void> {
    if (this.readyPromise) await this.readyPromise;
  }

  private start(retried = false): Promise<void> {
    return new Promise<void>((resolve) => {
      try {
        this.wss = new WebSocketServer({ port: this.port });
      } catch (err: any) {
        this.startError = `Failed to create WebSocket server: ${err?.message ?? err}`;
        resolve();
        return;
      }

      this.wss.on("listening", () => {
        this.ready = true;
        this.startError = null;
        console.error(
          `[live-studio] WebSocket server listening on port ${this.port}`
        );
        resolve();
      });

      this.wss.on("error", (err: NodeJS.ErrnoException) => {
        if (err?.code === "EADDRINUSE" && !retried) {
          console.error(
            `[live-studio] Port ${this.port} in use, retrying in 1s...`
          );
          this.wss = null;
          setTimeout(() => {
            this.start(true).then(resolve);
          }, 1_000);
          return;
        }
        this.startError = `Port ${this.port} is already in use. Kill the other process or set LIVE_STUDIO_PORT to use a different port.`;
        this.wss = null;
        this.ready = false;
        resolve();
      });

      this.setupConnectionHandler();
    });
  }

  // ---------------------------------------------------------------------------
  // Connection handling
  // ---------------------------------------------------------------------------

  private setupConnectionHandler(): void {
    if (!this.wss) return;

    this.wss.on("connection", (ws: WebSocket) => {
      this.clients.add(ws);
      console.error(
        `[live-studio] Client connected (${this.clients.size} total)`
      );

      // Immediately tell the new client the current polling state.
      ws.send(JSON.stringify({ type: "polling", active: this.pollingActive }));

      ws.on("message", (data: Buffer | string) => {
        let msg: any;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }

        this.handleMessage(msg);
      });

      ws.on("close", () => {
        this.clients.delete(ws);
        if (this.clients.size === 0) this.activeUrl = null;
        console.error(
          `[live-studio] Client disconnected (${this.clients.size} total)`
        );
      });
    });
  }

  private handleMessage(msg: any): void {
    if (msg.type === "page-info") {
      if (this.activeUrl !== msg.url) {
        this.activeUrl = msg.url;
        this.urlSentToAgent = false;
      }
      const vp = msg.viewport;
      if (
        !this.activeViewport ||
        this.activeViewport.width !== vp.width ||
        this.activeViewport.height !== vp.height
      ) {
        this.activeViewport = vp;
        this.viewportSentToAgent = false;
      }
      return;
    }

    if (msg.type === "answer") {
      if (this.waitingAnswerResolver) {
        clearTimeout(this.waitingAnswerResolver.timer);
        this.waitingAnswerResolver.resolve(msg.answer);
        this.waitingAnswerResolver = null;
        this.schedulePollingInactive();
      }
      return;
    }

    if (msg.type === "user-message") {
      const payload: UserMessage = {
        text: msg.text,
        attachments: msg.attachments,
        clientMsgId: msg.clientMsgId,
      };

      if (this.waitingUserMessageResolver) {
        clearTimeout(this.waitingUserMessageResolver.timer);
        this.waitingUserMessageResolver.resolve(payload);
        this.waitingUserMessageResolver = null;
        if (payload.clientMsgId) {
          this.broadcast({ type: "user-message-ack", ids: [payload.clientMsgId] });
        }
      } else {
        this.pendingUserMessages.push(payload);
      }

      this.flushWaitingResolvers();
      this.onUserMessage?.(payload);
      return;
    }

    if (msg.type === "style-update") {
      this.pendingChanges.push(...msg.changes);
      this.flushWaitingResolvers();
      this.onUpdate?.(msg.changes);
    }
  }

  // ---------------------------------------------------------------------------
  // Polling state
  // ---------------------------------------------------------------------------

  /** Mark the agent as actively polling (resets the grace timer). */
  markPollingActive(): void {
    if (this.pollingGraceTimer) {
      clearTimeout(this.pollingGraceTimer);
      this.pollingGraceTimer = null;
    }
    if (!this.pollingActive) {
      this.pollingActive = true;
      this.broadcastPolling(true);
    }
  }

  /** Schedule a transition to inactive after POLLING_GRACE_MS of silence. */
  private schedulePollingInactive(): void {
    if (this.pollingGraceTimer) clearTimeout(this.pollingGraceTimer);
    this.pollingGraceTimer = setTimeout(() => {
      this.pollingGraceTimer = null;
      if (
        this.waitingResolvers.length === 0 &&
        !this.waitingAnswerResolver &&
        !this.waitingUserMessageResolver
      ) {
        this.pollingActive = false;
        this.broadcastPolling(false);
      }
    }, DevToolsBridge.POLLING_GRACE_MS);
  }

  /** Flush all waiting change resolvers with an isolated snapshot. */
  private flushWaitingResolvers(): void {
    const snapshot = [...this.pendingChanges];
    for (const waiter of this.waitingResolvers) {
      clearTimeout(waiter.timer);
      waiter.resolve(snapshot);
    }
    this.waitingResolvers = [];
    this.schedulePollingInactive();
  }

  // ---------------------------------------------------------------------------
  // Broadcasting
  // ---------------------------------------------------------------------------

  /** Send a JSON payload to all connected browser clients. */
  broadcast(payload: Record<string, unknown>): void {
    const msg = JSON.stringify(payload);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }

  private broadcastPolling(active: boolean): void {
    if (this.lastBroadcastedPolling === active) return;
    this.lastBroadcastedPolling = active;
    this.broadcast({ type: "polling", active });
  }

  // ---------------------------------------------------------------------------
  // Wait helpers
  // ---------------------------------------------------------------------------

  /**
   * Generic single-value waiter.  If a previous waiter exists it is resolved
   * with null so the caller doesn't hang forever.
   */
  private waitForSingle<T>(
    getResolver: () => Waiter<T> | null,
    setResolver: (r: Waiter<T> | null) => void,
    timeoutMs: number
  ): Promise<T | null> {
    this.markPollingActive();

    const existing = getResolver();
    if (existing) {
      clearTimeout(existing.timer);
      existing.resolve(null);
      setResolver(null);
    }

    return new Promise<T | null>((resolve) => {
      const timer = setTimeout(() => {
        setResolver(null);
        this.schedulePollingInactive();
        resolve(null);
      }, timeoutMs);
      setResolver({ resolve, timer });
    });
  }

  // ---------------------------------------------------------------------------
  // Public API — waiting for data from the browser
  // ---------------------------------------------------------------------------

  /**
   * Wait for the next batch of style/DOM changes from the browser.
   * Resolves immediately if changes are already pending.
   */
  waitForUpdate(
    timeoutMs: number,
    onWaiting?: () => void
  ): Promise<Change[] | null> {
    this.markPollingActive();

    if (this.pendingChanges.length > 0 || this.pendingUserMessages.length > 0) {
      this.schedulePollingInactive();
      return Promise.resolve([...this.pendingChanges]);
    }

    onWaiting?.();

    return new Promise<Change[] | null>((resolve) => {
      const timer = setTimeout(() => {
        const idx = this.waitingResolvers.findIndex((w) => w.resolve === resolve);
        if (idx !== -1) this.waitingResolvers.splice(idx, 1);
        this.schedulePollingInactive();
        resolve(null);
      }, timeoutMs);
      this.waitingResolvers.push({ resolve, timer });
    });
  }

  /** Wait for the user to answer an ask() question. */
  waitForAnswer(timeoutMs: number): Promise<string | null> {
    return this.waitForSingle(
      () => this.waitingAnswerResolver,
      (r) => {
        this.waitingAnswerResolver = r;
      },
      timeoutMs
    );
  }

  /** Wait for the next user chat message. Returns immediately if one is queued. */
  waitForUserMessage(timeoutMs: number): Promise<UserMessage | null> {
    if (this.pendingUserMessages.length > 0) {
      const msg = this.pendingUserMessages.shift()!;
      if (msg.clientMsgId) {
        this.broadcast({ type: "user-message-ack", ids: [msg.clientMsgId] });
      }
      return Promise.resolve(msg);
    }

    return this.waitForSingle(
      () => this.waitingUserMessageResolver,
      (r) => {
        this.waitingUserMessageResolver = r;
      },
      timeoutMs
    );
  }

  // ---------------------------------------------------------------------------
  // Public API — consuming queued data
  // ---------------------------------------------------------------------------

  /** Clear pending changes and tell the browser the agent is implementing them. */
  consumeChanges(): void {
    this.pendingChanges = [];
    this.broadcast({ type: "drained", implementing: true });
  }

  /** Returns the URL if it hasn't been sent yet or has changed. */
  consumeUrl(): string | null {
    if (!this.activeUrl || this.urlSentToAgent) return null;
    this.urlSentToAgent = true;
    return this.activeUrl;
  }

  /** Returns viewport if it hasn't been sent yet or has changed. */
  consumeViewport(): Viewport | null {
    if (!this.activeViewport || this.viewportSentToAgent) return null;
    this.viewportSentToAgent = true;
    return this.activeViewport;
  }

  /** Consume all pending user messages, acknowledging them to the browser. */
  consumeUserMessages(): UserMessage[] {
    const msgs = this.pendingUserMessages.splice(0);
    const ids = msgs.map((m) => m.clientMsgId).filter(Boolean) as string[];
    if (ids.length > 0) this.broadcast({ type: "user-message-ack", ids });
    return msgs;
  }

  // ---------------------------------------------------------------------------
  // Public API — sending data to the browser
  // ---------------------------------------------------------------------------

  /** Display a question with options in the browser panel. */
  sendQuestion(question: string, options: string[]): void {
    this.broadcast({ type: "ask", question, options });
  }

  /** Report an error state (element not found, etc.) to the browser. */
  sendPanic(reason: string, element?: string): void {
    this.broadcast({ type: "panic", reason, element });
  }

  /** Clear an error state in the browser. */
  sendCalm(): void {
    this.broadcast({ type: "calm" });
  }

  /** Send a text message from the agent to the browser chat panel. */
  sendAgentMessage(text: string): void {
    this.broadcast({ type: "agent-message", text });
  }

  /** Toggle the "agent is responding" indicator in the browser. */
  sendAgentResponding(active: boolean): void {
    this.broadcast({ type: "agent-responding", active });
  }

  /** Tell the browser the agent is ready to receive changes. */
  sendReady(): void {
    this.broadcast({ type: "ready" });
  }

  // ---------------------------------------------------------------------------
  // Status / teardown
  // ---------------------------------------------------------------------------

  getStatus(): {
    listening: boolean;
    error: string | null;
    connected: number;
    pendingChanges: number;
    port: number;
    url: string | null;
  } {
    return {
      listening: this.isListening,
      error: this.startError,
      connected: this.clients.size,
      pendingChanges: this.pendingChanges.length,
      port: this.port,
      url: this.activeUrl,
    };
  }

  /** Shut down the WebSocket server and clean up all pending waiters. */
  stop(): void {
    if (this.pollingGraceTimer) {
      clearTimeout(this.pollingGraceTimer);
      this.pollingGraceTimer = null;
    }
    this.pollingActive = false;

    if (this.waitingAnswerResolver) {
      clearTimeout(this.waitingAnswerResolver.timer);
      this.waitingAnswerResolver.resolve(null);
      this.waitingAnswerResolver = null;
    }

    if (this.waitingUserMessageResolver) {
      clearTimeout(this.waitingUserMessageResolver.timer);
      this.waitingUserMessageResolver.resolve(null);
      this.waitingUserMessageResolver = null;
    }

    for (const waiter of this.waitingResolvers) {
      clearTimeout(waiter.timer);
      waiter.resolve(null);
    }
    this.waitingResolvers = [];

    this.wss?.close();
    this.wss = null;
    this.ready = false;
  }
}
