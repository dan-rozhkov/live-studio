export interface CssProperty {
  name: string;
  value: string;
  source?: string;
  selector?: string;
}

export interface DesignToken {
  name: string;
  value: string;
}

export interface StylesSlice {
  properties: CssProperty[];
  computedStyles: Record<string, string>;
  parentDisplay: string;
  designTokens: DesignToken[];
  elementVariables: DesignToken[];
  selectedAttributes: Record<string, string>;
  selectedTextContent: string;

  setProperties: (props: CssProperty[]) => void;
  setComputedStyles: (styles: Record<string, string>) => void;
  setParentDisplay: (display: string) => void;
  setDesignTokens: (tokens: DesignToken[]) => void;
  addDesignToken: (token: DesignToken) => void;
  createDesignToken: (name: string, value: string) => void;
  setElementVariables: (vars: DesignToken[]) => void;
  updateProperty: (name: string, value: string) => void;
  setSelectedAttributes: (attrs: Record<string, string>) => void;
  setSelectedTextContent: (text: string) => void;
}

type ImmerSet = (fn: (state: StylesSlice) => void) => void;
type GetState = () => StylesSlice;

export const createStylesSlice = (set: ImmerSet, get: GetState): StylesSlice => ({
  properties: [],
  computedStyles: {},
  parentDisplay: '',
  designTokens: [],
  elementVariables: [],
  selectedAttributes: {},
  selectedTextContent: '',

  setProperties: (props) =>
    set((state) => {
      state.properties = props;
    }),

  setComputedStyles: (styles) =>
    set((state) => {
      state.computedStyles = styles;
    }),

  setParentDisplay: (display) => {
    if (display !== get().parentDisplay) {
      set((state) => {
        state.parentDisplay = display;
      });
    }
  },

  setDesignTokens: (tokens) =>
    set((state) => {
      state.designTokens = tokens;
    }),

  addDesignToken: (token) =>
    set((state) => {
      const existing = state.designTokens.findIndex((t) => t.name === token.name);
      if (existing >= 0) {
        if (state.designTokens[existing].value === token.value) return;
        state.designTokens[existing] = token;
      } else {
        state.designTokens.push(token);
      }
    }),

  createDesignToken: (name, value) => {
    // Pre-validated input only — callers must run validateToken first.
    document.documentElement.style.setProperty(`--${name}`, value);
    get().addDesignToken({ name, value });
    (get() as StylesSlice & { queueEdit?: (c: unknown) => void }).queueEdit?.({
      type: 'style',
      element: ':root',
      name: `--${name}`,
      value: `→ ${value}`,
    });
  },

  setElementVariables: (vars) =>
    set((state) => {
      state.elementVariables = vars;
    }),

  updateProperty: (name, value) =>
    set((state) => {
      const prop = state.properties.find((p) => p.name === name);
      if (prop) {
        prop.value = value;
      }
      state.computedStyles[name] = value;
    }),

  setSelectedAttributes: (attrs) =>
    set((state) => {
      state.selectedAttributes = attrs;
    }),

  setSelectedTextContent: (text) =>
    set((state) => {
      state.selectedTextContent = text;
    }),
});
