export interface DesignMdSlice {
  designMd: { content: string | null };
  setDesignMd: (content: string | null) => void;
}

type ImmerSet = (fn: (state: DesignMdSlice) => void) => void;

export const createDesignMdSlice = (
  set: ImmerSet,
  get: () => DesignMdSlice
): DesignMdSlice => ({
  designMd: { content: null },

  setDesignMd: (content) => {
    if (get().designMd.content === content) return;
    set((state) => {
      state.designMd = { content };
    });
  },
});
