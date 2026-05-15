import { create } from 'zustand';
import { useCallback, useRef } from 'preact/hooks';
import type { MenuItem } from './ContextMenu';

interface ContextMenuStore {
  open: boolean;
  x: number;
  y: number;
  items: MenuItem[];
  show: (x: number, y: number, items: MenuItem[]) => void;
  close: () => void;
}

export const useContextMenuStore = create<ContextMenuStore>((set) => ({
  open: false,
  x: 0,
  y: 0,
  items: [],
  show: (x, y, items) => set({ open: true, x, y, items }),
  close: () => set({ open: false, items: [] }),
}));

/**
 * Returns an `onContextMenu` handler that opens the global context menu at
 * the cursor with items returned by `getItems`. Items are evaluated lazily
 * on right-click, so they capture fresh state at the moment of interaction.
 * If `getItems` returns an empty array, the default browser menu is allowed.
 */
export function useContextMenu(getItems: () => MenuItem[]) {
  const show = useContextMenuStore((s) => s.show);
  const ref = useRef(getItems);
  ref.current = getItems;

  return useCallback(
    (e: MouseEvent) => {
      const items = ref.current();
      if (!items.length) return;
      e.preventDefault();
      e.stopPropagation();
      show(e.clientX, e.clientY, items);
    },
    [show],
  );
}
