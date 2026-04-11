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
