import type { ComponentProps } from '../../bridge/component-bridge';

export interface ComponentSlice {
  selectedComponent: ComponentProps | null;
  setSelectedComponent: (info: ComponentProps | null) => void;
  updateSelectedProp: (name: string, value: unknown) => void;
}

type ImmerSet = (fn: (state: ComponentSlice) => void) => void;

function shallowEqualProps(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  for (const k of ak) if (a[k] !== b[k]) return false;
  return true;
}

function sameComponent(a: ComponentProps | null, b: ComponentProps | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.name === b.name
    && a.source === b.source
    && a.framework === b.framework
    && a.isRoot === b.isRoot
    && shallowEqualProps(a.props, b.props);
}

export const createComponentSlice = (
  set: ImmerSet,
  _get: () => ComponentSlice,
): ComponentSlice => ({
  selectedComponent: null,

  setSelectedComponent: (info) =>
    set((state) => {
      if (sameComponent(state.selectedComponent, info)) return;
      state.selectedComponent = info;
    }),

  updateSelectedProp: (name, value) =>
    set((state) => {
      const comp = state.selectedComponent;
      if (!comp) return;
      if (comp.props[name] === value) return;
      comp.props[name] = value;
    }),
});
