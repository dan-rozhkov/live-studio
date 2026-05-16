import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Layers2, Trash2 } from 'lucide-preact';
import type { PendingAttachment } from '../../state/slices/chat-slice';
import { useStore } from '../../state/store';
import type { DomNode } from '../../state/slices/dom-slice';
import styles from './ChatPanel.module.css';
import opStyles from '../DomTree/DomOperations.module.css';

function findNode(tree: DomNode | null, id: number): DomNode | null {
  if (!tree) return null;
  if (tree.id === id) return tree;
  for (const child of tree.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

export interface ChatPanelProps {
  onSend: (text: string, attachments: PendingAttachment[]) => void;
  onGenerateVariants: () => void;
}

/**
 * Chat panel component displaying message history and a compose area.
 *
 * Features:
 * - Scrollable message list with user/agent message styling
 * - Agent "typing" indicator (bouncing dots)
 * - Auto-scroll to bottom on new messages
 * - Element attachment support (auto-attaches selected element, manual attachments)
 * - Empty state when no messages exist
 */
export function ChatPanel({ onSend, onGenerateVariants }: ChatPanelProps) {
  const chatMessages = useStore((s) => s.chatMessages);
  const agentResponding = useStore((s) => s.agentResponding);
  const mcpStatus = useStore((s) => s.mcpStatus);
  const isConnected = mcpStatus === 'connected';
  const pendingAttachments = useStore((s) => s.pendingAttachments);
  const removePendingAttachment = useStore((s) => s.removePendingAttachment);
  const clearPendingAttachments = useStore((s) => s.clearPendingAttachments);
  const selectedNodeIds = useStore((s) => s.selectedNodeIds);
  const domTree = useStore((s) => s.domTree);
  const variant = useStore((s) => s.variant);
  const variantsDisabled = !isConnected || selectedNodeIds.length === 0 || variant !== null;

  // Auto-attachments: currently selected elements not already in pending
  const autoAttachments = useMemo(() => {
    if (selectedNodeIds.length === 0 || !domTree) return [];
    return selectedNodeIds
      .filter((id) => !pendingAttachments.some((a) => a.nodeId === id))
      .map((id) => {
        const node = findNode(domTree, id);
        const label = node ? node.tag + (node.attributes?.id ? `#${node.attributes.id}` : '') : `#${id}`;
        return { nodeId: id, label };
      });
  }, [selectedNodeIds, pendingAttachments, domTree]);

  const [inputValue, setInputValue] = useState('');
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when messages change or agent starts responding
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMessages.length, agentResponding]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text) return;
    const allAttachments = [...autoAttachments, ...pendingAttachments];
    onSend(text, allAttachments);
    setInputValue('');
    clearPendingAttachments();
  }, [inputValue, autoAttachments, pendingAttachments, onSend, clearPendingAttachments]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const hasMessages = chatMessages.length > 0;

  return (
    <div class={styles.chatContent}>
      <div class={styles.messages} ref={messagesRef}>
        {!hasMessages && !agentResponding && (
          <div class={styles.emptyState}>
            <EmptyIllustration />
            <div class={styles.emptyText}>
              Send a message to your AI agent. Selected elements will be attached automatically.
            </div>
          </div>
        )}

        {chatMessages.map((msg) => {
          if (msg.role === 'user') {
            return (
              <div
                key={msg.id}
                class={`${styles.userMsg}${msg.pending ? ` ${styles.userMsgPending}` : ''}`}
              >
                {(msg as any).attachments && (msg as any).attachments.length > 0 && (
                  <div class={styles.msgAttachments}>
                    {(msg as any).attachments.map((a: PendingAttachment) => (
                      <span key={a.nodeId} class={styles.msgChip}>
                        {a.label}
                      </span>
                    ))}
                  </div>
                )}
                {msg.content}
                <div class={styles.timestamp}>{formatTime(msg.timestamp)}</div>
              </div>
            );
          }

          // Agent message
          return (
            <div key={msg.id} class={styles.agentMsg}>
              {msg.content}
              <div class={styles.timestamp}>{formatTime(msg.timestamp)}</div>
            </div>
          );
        })}

        {agentResponding && (
          <div class={styles.agentMsg}>
            <span class={styles.typingDots}>
              <span />
              <span />
              <span />
            </span>
          </div>
        )}
      </div>

      {/* Attachment chips (auto + manual) */}
      {(autoAttachments.length > 0 || pendingAttachments.length > 0) && (
        <div class={styles.attachments}>
          {autoAttachments.map((a) => (
            <span key={a.nodeId} class={`${styles.chip} ${styles.chipAuto}`}>
              {a.label}
            </span>
          ))}
          {pendingAttachments.map((a) => (
            <span key={a.nodeId} class={styles.chip}>
              {a.label}
              <button
                class={styles.chipRemove}
                onClick={() => removePendingAttachment(a.nodeId)}
                aria-label="Remove attachment"
              >
                x
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input area */}
      <div class={styles.inputRow}>
        <textarea
          ref={inputRef}
          class={styles.input}
          placeholder={isConnected ? 'Message agent...' : 'Not connected'}
          disabled={!isConnected}
          value={inputValue}
          onInput={(e) => setInputValue((e.target as HTMLTextAreaElement).value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <button
          class={styles.iconButton}
          disabled={variantsDisabled}
          onClick={onGenerateVariants}
          title="Generate AI variants for selection"
          aria-label="Generate variants"
        >
          <Layers2 size={14} />
        </button>
        <button
          class={styles.sendButton}
          disabled={!isConnected || !inputValue.trim()}
          onClick={handleSend}
        >
          Send
        </button>
      </div>
    </div>
  );
}

function EmptyIllustration() {
  return (
    <svg
      class={styles.emptyIllustration}
      width="96"
      height="72"
      viewBox="0 0 96 72"
      fill="none"
      stroke="currentColor"
      stroke-width="1"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {/* window frame */}
      <rect x="2" y="2" width="92" height="68" rx="4" />
      {/* traffic lights */}
      <circle cx="8" cy="8" r="1" />
      <circle cx="13" cy="8" r="1" />
      <circle cx="18" cy="8" r="1" />
      {/* top divider */}
      <line x1="2" y1="14" x2="94" y2="14" />
      {/* incoming agent bubble (left) */}
      <path d="M10 22 h34 a3 3 0 0 1 3 3 v10 a3 3 0 0 1 -3 3 h-28 l-6 4 v-4 a3 3 0 0 1 -3 -3 v-10 a3 3 0 0 1 3 -3 z" />
      <line x1="14" y1="27" x2="38" y2="27" />
      <line x1="14" y1="32" x2="32" y2="32" />
      {/* outgoing user bubble (right, dashed) */}
      <path
        d="M52 44 h30 a3 3 0 0 1 3 3 v10 a3 3 0 0 1 -3 3 h-24 l-6 4 v-4 a3 3 0 0 1 -3 -3 v-10 a3 3 0 0 1 3 -3 z"
        stroke-dasharray="3 2"
      />
      {/* sparkle on the outgoing bubble */}
      <path d="M68 48 L69 51 L72 52 L69 53 L68 56 L67 53 L64 52 L67 51 Z" />
    </svg>
  );
}

export function ChatActions() {
  const hasMessages = useStore((s) => s.chatMessages.length > 0);
  const clearChat = useStore((s) => s.clearChat);

  return (
    <div className={opStyles.actionBar}>
      <button
        className={opStyles.actionBtn}
        title="Clear chat"
        onClick={clearChat}
        disabled={!hasMessages}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
