import { useEffect, useRef, useCallback } from 'preact/hooks';
import { useStore } from '../state/store';
import { getElementById } from '../bridge/dom-bridge';
import {
  acceptVariantPreview,
  cancelVariantPreview,
  startVariantPreview,
} from '../bridge/variants-bridge';

/* ── Constants ───────────────────────────────────────────────── */

const AUTO_SEND_DEBOUNCE = 1_000;
const WARM_RECONNECT_INITIAL = 2_000;
const WARM_RECONNECT_MAX = 15_000;
const VISIBILITY_PROBE_COOLDOWN = 5_000;
const DEFAULT_PORT = 9877;

/* ── Types ───────────────────────────────────────────────────── */

interface OfflineMessage {
  id: string;
  text: string;
  attachments?: ChatAttachment[];
}

interface ChatAttachment {
  nodeId: number;
  label: string;
}

/* ── Hook ────────────────────────────────────────────────────── */

export function useMcpDirect(mcpPort?: number) {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRef = useRef<() => void>(() => {});
  const activeRef = useRef(true);
  const hasEverConnectedRef = useRef(false);
  const lastProbeRef = useRef(0);
  const offlineQueueRef = useRef<OfflineMessage[]>([]);
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const autoApply = useStore((s) => s.autoApply);
  const editVersion = useStore((s) => s.editVersion);

  const port = mcpPort ?? DEFAULT_PORT;

  /* ── Flush offline queue ─────────────────────────────────── */

  function flushOfflineQueue(ws: WebSocket): void {
    for (const item of offlineQueueRef.current.splice(0)) {
      ws.send(
        JSON.stringify({
          type: 'user-message',
          text: item.text,
          attachments: item.attachments,
          clientMsgId: item.id,
        }),
      );
    }
  }

  /* ── Send page-info ──────────────────────────────────────── */

  function sendPageInfo(ws: WebSocket): void {
    ws.send(
      JSON.stringify({
        type: 'page-info',
        url: location.href,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      }),
    );
  }

  /* ── Main connection effect ──────────────────────────────── */

  useEffect(() => {
    activeRef.current = true;
    let reconnectDelay = WARM_RECONNECT_INITIAL;

    function connect(): void {
      if (!activeRef.current || socketRef.current) return;
      lastProbeRef.current = Date.now();

      const { setMcpStatus } = useStore.getState();

      const ws = new WebSocket(`ws://localhost:${port}`);

      ws.onopen = () => {
        socketRef.current = ws;
        hasEverConnectedRef.current = true;
        reconnectDelay = WARM_RECONNECT_INITIAL;

        if (disconnectTimerRef.current) {
          clearTimeout(disconnectTimerRef.current);
          disconnectTimerRef.current = null;
        }

        setMcpStatus('connected');
        useStore.getState().setAgentResponding(false);

        sendPageInfo(ws);

        // Re-send any staged changes that were queued while disconnected
        const { stagedChanges, clearStagedChanges, setApplying } = useStore.getState();
        if (stagedChanges.length > 0) {
          ws.send(
            JSON.stringify({
              type: 'style-update',
              changes: stagedChanges,
              timestamp: Date.now(),
            }),
          );
          setApplying(true);
          clearStagedChanges();
        }

        flushOfflineQueue(ws);
      };

      ws.onclose = () => {
        socketRef.current = null;
        if (!activeRef.current) {
          setMcpStatus('disconnected');
          return;
        }
        if (hasEverConnectedRef.current) {
          // Delay the UI status change so brief reconnects don't flicker
          if (!disconnectTimerRef.current) {
            disconnectTimerRef.current = setTimeout(() => {
              disconnectTimerRef.current = null;
              if (!socketRef.current) {
                setMcpStatus('disconnected');
              }
            }, WARM_RECONNECT_MAX);
          }
          scheduleReconnect();
        } else {
          setMcpStatus('disconnected');
        }
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string);
          const store = useStore.getState();

          if (msg.type === 'panic') {
            const reason =
              msg.reason === 'element_not_found'
                ? "I couldn't find this element in the source code."
                : `Error: ${msg.reason}`;
            const text = msg.element ? `${reason}\n\n\`${msg.element}\`` : reason;
            store.setPanic({ message: text });
            store.addChatMessage({ role: 'agent', content: text });
          } else if (msg.type === 'calm') {
            store.setPanic(null);
          } else if (msg.type === 'ask') {
            store.setQuestion({
              id: crypto.randomUUID(),
              text: msg.question,
              options: msg.options,
            });
          } else if (msg.type === 'ready') {
            store.setApplying(false);
          } else if (msg.type === 'drained') {
            store.clearStagedChanges();
            if (msg.implementing) {
              store.setAgentStatus('implementing');
            } else {
              store.setApplying(false);
            }
          } else if (msg.type === 'polling') {
            if (msg.active) {
              if (store.agentStatus === 'implementing') store.setApplying(false);
              store.setAgentStatus('polling');
              flushOfflineQueue(ws);
            } else if (store.agentStatus !== 'implementing') {
              store.setAgentStatus('idle');
            }
          } else if (msg.type === 'user-message-ack') {
            store.acknowledgeMessages(msg.ids);
          } else if (msg.type === 'agent-message') {
            store.addChatMessage({ role: 'agent', content: msg.text });
            store.setAgentResponding(false);
          } else if (msg.type === 'agent-responding') {
            store.setAgentResponding(msg.active);
          } else if (msg.type === 'design-md') {
            store.setDesignMd(msg.content ?? null);
          } else if (msg.type === 'variant-started') {
            store.setVariant({
              taskId: msg.taskId,
              targetNodeId: msg.targetNodeId,
              phase: 'requested',
              variantNames: [],
              activeName: 'Original',
            });
          } else if (msg.type === 'variant-result') {
            const variant = store.variant;
            if (!variant || variant.taskId !== msg.taskId) return;
            const target = getElementById(variant.targetNodeId);
            if (!target) {
              store.setVariant({
                ...variant,
                phase: 'error',
                errorMessage: 'Target element no longer in DOM',
              });
              return;
            }
            const preview = startVariantPreview(msg.taskId, target, msg.html);
            if (!preview) {
              store.setVariant({
                ...variant,
                phase: 'error',
                errorMessage: 'Malformed variant payload',
              });
              return;
            }
            store.patchVariant({
              phase: 'previewing',
              variantNames: preview.variantNames,
              activeName: preview.activeName,
            });
          } else if (msg.type === 'variant-implemented') {
            const variant = store.variant;
            if (!variant || variant.taskId !== msg.taskId) return;
            acceptVariantPreview();
            store.setVariant(null);
          } else if (msg.type === 'variant-error') {
            const variant = store.variant;
            cancelVariantPreview();
            if (variant) {
              store.setVariant({
                ...variant,
                phase: 'error',
                errorMessage: msg.message,
              });
            }
          } else if (msg.type === 'variant-cancelled') {
            cancelVariantPreview();
            store.setVariant(null);
          }
        } catch {
          // Ignore malformed messages
        }
      };
    }

    connectRef.current = connect;

    function scheduleReconnect(): void {
      if (reconnectRef.current || !activeRef.current) return;
      reconnectRef.current = setTimeout(() => {
        reconnectRef.current = null;
        if (activeRef.current) connect();
      }, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 1.5, WARM_RECONNECT_MAX);
    }

    function onVisibilityChange(): void {
      if (document.visibilityState !== 'visible') return;
      if (socketRef.current) return;
      if (!activeRef.current) return;
      if (Date.now() - lastProbeRef.current < VISIBILITY_PROBE_COOLDOWN) return;
      connect();
    }

    // Start connecting immediately (no auth gate)
    connect();

    document.addEventListener('visibilitychange', onVisibilityChange);

    function onResize(): void {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        sendPageInfo(socketRef.current);
      }
    }

    window.addEventListener('resize', onResize);

    return () => {
      activeRef.current = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('resize', onResize);

      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.onclose = null;
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [port]);

  /* ── sendAnswer ──────────────────────────────────────────── */

  const sendAnswer = useCallback((answer: string) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'answer', answer }));
    }
    useStore.getState().setQuestion(null);
  }, []);

  /* ── sendEdit ────────────────────────────────────────────── */

  const sendEdit = useCallback(() => {
    const { stagedChanges, clearStagedChanges, setApplying, addChatMessage, mcpStatus } =
      useStore.getState();

    if (stagedChanges.length === 0) return;

    if (!socketRef.current || mcpStatus !== 'connected') {
      // Attempt reconnect if cooldown elapsed
      if (
        !socketRef.current &&
        Date.now() - lastProbeRef.current > VISIBILITY_PROBE_COOLDOWN
      ) {
        connectRef.current();
      }
      return;
    }

    const count = stagedChanges.length;
    const ws = socketRef.current;
    ws.send(
      JSON.stringify({
        type: 'style-update',
        changes: stagedChanges,
        timestamp: Date.now(),
      }),
    );
    setApplying(true);
    clearStagedChanges();
    addChatMessage({
      role: 'agent',
      content: `Sent ${count} change${count === 1 ? '' : 's'}`,
    });
  }, []);

  /* ── sendUserMessage ─────────────────────────────────────── */

  const sendUserMessage = useCallback(
    (text: string, attachments: ChatAttachment[]) => {
      const store = useStore.getState();
      const msgAttachments = attachments.length > 0 ? attachments : undefined;
      const id = crypto.randomUUID();
      const ws = socketRef.current;
      const canSendNow = ws && ws.readyState === WebSocket.OPEN;

      store.addChatMessage({
        id,
        role: 'user',
        content: text,
        pending: true,
      });

      if (canSendNow) {
        flushOfflineQueue(ws);
        ws.send(
          JSON.stringify({
            type: 'user-message',
            text,
            attachments: msgAttachments,
            clientMsgId: id,
          }),
        );
      } else {
        if (offlineQueueRef.current.length < 50) {
          offlineQueueRef.current.push({ id, text, attachments: msgAttachments });
        }
        if (
          !ws &&
          Date.now() - lastProbeRef.current > VISIBILITY_PROBE_COOLDOWN
        ) {
          connectRef.current();
        }
      }
    },
    [],
  );

  /* ── Auto-apply debounce ─────────────────────────────────── */

  useEffect(() => {
    if (!autoApply || editVersion === 0) return;
    const timer = setTimeout(sendEdit, AUTO_SEND_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [autoApply, editVersion, sendEdit]);

  /* ── Probe on first edit while disconnected ──────────────── */

  useEffect(() => {
    if (editVersion === 0) return;
    if (socketRef.current) return;
    if (Date.now() - lastProbeRef.current < VISIBILITY_PROBE_COOLDOWN) return;
    connectRef.current();
  }, [editVersion]);

  /* ── Variant task send helpers ───────────────────────────── */

  const sendMessage = useCallback((payload: Record<string, unknown>): boolean => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(payload));
    return true;
  }, []);

  const sendStartVariant = useCallback(
    (payload: { targetNodeId: number; targetHtml: string; selector: string }) => {
      sendMessage({ type: 'start-variant', ...payload });
    },
    [sendMessage],
  );

  const sendVariantApply = useCallback(
    (taskId: string, variantName: string) => {
      const variant = useStore.getState().variant;
      if (!variant || variant.phase !== 'previewing') return;
      if (sendMessage({ type: 'variant-apply', taskId, variantName })) {
        useStore.getState().patchVariant({ phase: 'applying' });
      }
    },
    [sendMessage],
  );

  const sendVariantCancel = useCallback(
    (taskId: string) => {
      sendMessage({ type: 'variant-cancel', taskId });
      cancelVariantPreview();
      useStore.getState().setVariant(null);
    },
    [sendMessage],
  );

  /* ── Manual reconnect ────────────────────────────────────── */

  const reconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.onclose = null;
      socketRef.current.close();
      socketRef.current = null;
    }
    connectRef.current();
  }, []);

  return {
    sendEdit,
    sendAnswer,
    sendUserMessage,
    reconnect,
    sendStartVariant,
    sendVariantApply,
    sendVariantCancel,
  };
}
