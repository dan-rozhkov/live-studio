export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: number;
  pending?: boolean;
}

export interface PendingAttachment {
  nodeId: number;
  label: string;
}

export interface ChatSlice {
  chatMessages: ChatMessage[];
  agentResponding: boolean;
  pendingAttachments: PendingAttachment[];

  addChatMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'> & { id?: string; timestamp?: number }) => void;
  acknowledgeMessages: (ids: string[]) => void;
  setAgentResponding: (active: boolean) => void;
  addPendingAttachment: (a: PendingAttachment) => void;
  removePendingAttachment: (nodeId: number) => void;
  clearPendingAttachments: () => void;
  clearChat: () => void;
}

type ImmerSet = (fn: (state: ChatSlice) => void) => void;

export const createChatSlice = (set: ImmerSet, _get: () => ChatSlice): ChatSlice => ({
  chatMessages: [],
  agentResponding: false,
  pendingAttachments: [],

  addChatMessage: (msg) =>
    set((state) => {
      state.chatMessages.push({
        ...msg,
        id: msg.id ?? crypto.randomUUID(),
        timestamp: msg.timestamp ?? Date.now(),
      });
      if (state.chatMessages.length > 200) {
        state.chatMessages = state.chatMessages.slice(-200);
      }
    }),

  acknowledgeMessages: (ids) =>
    set((state) => {
      const idSet = new Set(ids);
      for (const msg of state.chatMessages) {
        if (idSet.has(msg.id)) msg.pending = false;
      }
    }),

  setAgentResponding: (active) =>
    set((state) => {
      if (state.agentResponding !== active) state.agentResponding = active;
    }),

  addPendingAttachment: (a) =>
    set((state) => {
      if (!state.pendingAttachments.some((p) => p.nodeId === a.nodeId && p.label === a.label)) {
        state.pendingAttachments.push(a);
      }
    }),

  removePendingAttachment: (nodeId) =>
    set((state) => {
      state.pendingAttachments = state.pendingAttachments.filter((a) => a.nodeId !== nodeId);
    }),

  clearPendingAttachments: () =>
    set((state) => {
      state.pendingAttachments = [];
    }),

  clearChat: () =>
    set((state) => {
      state.chatMessages = [];
      state.agentResponding = false;
    }),
});
