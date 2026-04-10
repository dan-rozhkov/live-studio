export interface UiSlice {
  isPickingElement: boolean;
  isDrawingElement: boolean;
  mcpStatus: 'disconnected' | 'connected' | 'error';
  agentPolling: boolean;
  agentStatus: 'idle' | 'polling' | 'implementing';
  splitAxis: Record<string, boolean>;
  splitCorners: Record<string, boolean>;
  showMinMax: Record<string, 'min' | 'max' | 'both' | null>;

  setPickingElement: (picking: boolean) => void;
  setDrawingElement: (drawing: boolean) => void;
  setMcpStatus: (status: 'disconnected' | 'connected' | 'error') => void;
  setAgentStatus: (status: 'idle' | 'polling' | 'implementing') => void;
  toggleSplitAxis: (prop: string) => void;
  toggleSplitCorners: (prop: string) => void;
  toggleMinMax: (prop: string, which: 'min' | 'max') => void;
}

type ImmerSet = (fn: (state: UiSlice) => void) => void;

export const createUiSlice = (set: ImmerSet, _get: () => UiSlice): UiSlice => ({
  isPickingElement: false,
  isDrawingElement: false,
  mcpStatus: 'disconnected',
  agentPolling: false,
  agentStatus: 'idle',
  splitAxis: {},
  splitCorners: {},
  showMinMax: {},

  setPickingElement: (picking) =>
    set((state) => {
      state.isPickingElement = picking;
      if (picking) state.isDrawingElement = false;
    }),

  setDrawingElement: (drawing) =>
    set((state) => {
      state.isDrawingElement = drawing;
      if (drawing) state.isPickingElement = false;
    }),

  setMcpStatus: (status) =>
    set((state) => {
      state.mcpStatus = status;
    }),

  setAgentStatus: (status) =>
    set((state) => {
      state.agentStatus = status;
      state.agentPolling = status === 'polling' || status === 'implementing';
    }),

  toggleSplitAxis: (prop) =>
    set((state) => {
      state.splitAxis[prop] = !state.splitAxis[prop];
    }),

  toggleSplitCorners: (prop) =>
    set((state) => {
      state.splitCorners[prop] = !state.splitCorners[prop];
    }),

  toggleMinMax: (prop, which) =>
    set((state) => {
      const current = state.showMinMax[prop];
      if (current === which) {
        state.showMinMax[prop] = null;
      } else if (current === null || current === undefined) {
        state.showMinMax[prop] = which;
      } else if (current !== which) {
        state.showMinMax[prop] = 'both';
      } else {
        state.showMinMax[prop] = null;
      }
    }),
});
