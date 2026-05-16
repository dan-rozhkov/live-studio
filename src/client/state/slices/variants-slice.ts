export type VariantPhase = 'requested' | 'previewing' | 'applying' | 'error';

export interface VariantUiState {
  taskId: string;
  targetNodeId: number;
  phase: VariantPhase;
  variantNames: string[];
  activeName: string;
  errorMessage?: string;
}

export interface VariantsSlice {
  variant: VariantUiState | null;
  setVariant: (v: VariantUiState | null) => void;
  patchVariant: (patch: Partial<VariantUiState>) => void;
}

type ImmerSet = (fn: (state: VariantsSlice) => void) => void;

export const createVariantsSlice = (
  set: ImmerSet,
  _get: () => VariantsSlice,
): VariantsSlice => ({
  variant: null,

  setVariant: (v) =>
    set((state) => {
      state.variant = v;
    }),

  patchVariant: (patch) =>
    set((state) => {
      if (state.variant) Object.assign(state.variant, patch);
    }),
});
