export interface Question {
  id: string;
  text: string;
  options?: string[];
}

export interface ErrorSlice {
  panic: { message: string } | null;
  question: Question | null;

  setPanic: (panic: { message: string } | null) => void;
  clearPanic: () => void;
  setQuestion: (question: Question | null) => void;
}

type ImmerSet = (fn: (state: ErrorSlice) => void) => void;

export const createErrorSlice = (set: ImmerSet, _get: () => ErrorSlice): ErrorSlice => ({
  panic: null,
  question: null,

  setPanic: (panic) =>
    set((state) => {
      state.panic = panic;
    }),

  clearPanic: () =>
    set((state) => {
      state.panic = null;
    }),

  setQuestion: (question) =>
    set((state) => {
      state.question = question;
    }),
});
