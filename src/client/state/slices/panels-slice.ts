export type DockPosition = 'left' | 'right' | 'bottom';

export interface PanelState {
  open: boolean;
  dock: DockPosition;
  size: number;
  activeTab: string;
}

export type PanelId = 'inspector' | 'navigator' | 'timeline';

export interface DockedClaims {
  left: number;
  right: number;
  bottom: number;
}

export interface PanelsSlice {
  panels: Record<PanelId, PanelState>;
  dockedClaims: DockedClaims;

  setPanelOpen: (id: PanelId, open: boolean) => void;
  togglePanel: (id: PanelId) => void;
  setPanelDock: (id: PanelId, dock: DockPosition) => void;
  setPanelSize: (id: PanelId, size: number) => void;
  setPanelActiveTab: (id: PanelId, tab: string) => void;
  togglePanelTab: (id: PanelId, tab: string) => void;
  openChat: () => void;
}

const DEFAULT_PANELS: Record<PanelId, PanelState> = {
  inspector: { open: false, dock: 'right', size: 320, activeTab: 'design' },
  navigator: { open: false, dock: 'left', size: 300, activeTab: 'elements' },
  timeline: { open: false, dock: 'bottom', size: 250, activeTab: 'animations' },
};

function recomputeClaims(panels: Record<PanelId, PanelState>): DockedClaims {
  const claims: DockedClaims = { left: 0, right: 0, bottom: 0 };
  for (const panel of Object.values(panels)) {
    if (panel.open) {
      claims[panel.dock] = Math.max(claims[panel.dock], panel.size);
    }
  }
  return claims;
}

type ImmerSet = (fn: (state: PanelsSlice) => void) => void;

export const createPanelsSlice = (set: ImmerSet, _get: () => PanelsSlice): PanelsSlice => ({
  panels: { ...DEFAULT_PANELS },
  dockedClaims: { left: 0, right: 0, bottom: 0 },

  setPanelOpen: (id, open) =>
    set((state) => {
      state.panels[id].open = open;
      state.dockedClaims = recomputeClaims(state.panels);
    }),

  togglePanel: (id) =>
    set((state) => {
      state.panels[id].open = !state.panels[id].open;
      state.dockedClaims = recomputeClaims(state.panels);
    }),

  setPanelDock: (id, dock) =>
    set((state) => {
      state.panels[id].dock = dock;
      state.dockedClaims = recomputeClaims(state.panels);
    }),

  setPanelSize: (id, size) =>
    set((state) => {
      state.panels[id].size = size;
      state.dockedClaims = recomputeClaims(state.panels);
    }),

  setPanelActiveTab: (id, tab) =>
    set((state) => {
      state.panels[id].activeTab = tab;
    }),

  togglePanelTab: (id, tab) =>
    set((state) => {
      const panel = state.panels[id];
      if (panel.open && panel.activeTab === tab) {
        panel.open = false;
      } else {
        panel.open = true;
        panel.activeTab = tab;
      }
      state.dockedClaims = recomputeClaims(state.panels);
    }),

  openChat: () =>
    set((state) => {
      state.panels.navigator.open = true;
      state.panels.navigator.activeTab = 'chat';
      state.dockedClaims = recomputeClaims(state.panels);
    }),
});
