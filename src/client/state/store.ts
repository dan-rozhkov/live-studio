import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import { createDomSlice, type DomSlice } from './slices/dom-slice';
import { createStylesSlice, type StylesSlice } from './slices/styles-slice';
import { createEditSlice, type EditSlice } from './slices/edit-slice';
import { createUiSlice, type UiSlice } from './slices/ui-slice';
import { createChatSlice, type ChatSlice } from './slices/chat-slice';
import { createErrorSlice, type ErrorSlice } from './slices/error-slice';
import { createPanelsSlice, type PanelsSlice } from './slices/panels-slice';
import { createDesignMdSlice, type DesignMdSlice } from './slices/design-md-slice';
import { createComponentSlice, type ComponentSlice } from './slices/component-slice';
import { createVariantsSlice, type VariantsSlice } from './slices/variants-slice';

export type StoreState = DomSlice &
  StylesSlice &
  EditSlice &
  UiSlice &
  ChatSlice &
  ErrorSlice &
  PanelsSlice &
  DesignMdSlice &
  ComponentSlice &
  VariantsSlice;

/**
 * Main Zustand store with Immer middleware.
 * The custom `set` wrapper keeps `selectedNodeId` in sync with the last
 * entry of `selectedNodeIds` after every state update — matching the
 * reference implementation's derived-field pattern.
 */
export const useStore = create<StoreState>()(
  immer((rawSet, get) => {
    const set = ((fn: (state: StoreState) => void) =>
      rawSet((state: StoreState) => {
        fn(state);
        state.selectedNodeId = state.selectedNodeIds.at(-1) ?? null;
      })) as typeof rawSet;

    return {
      ...createDomSlice(set, get),
      ...createStylesSlice(set, get),
      ...createUiSlice(set, get),
      ...createEditSlice(set, get),
      ...createChatSlice(set, get),
      ...createErrorSlice(set, get),
      ...createPanelsSlice(set, get),
      ...createDesignMdSlice(set, get),
      ...createComponentSlice(set, get),
      ...createVariantsSlice(set, get),
    };
  })
);
