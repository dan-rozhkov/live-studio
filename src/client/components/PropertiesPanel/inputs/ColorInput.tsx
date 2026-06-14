import { h, Fragment } from 'preact';
import { useState, useCallback, useEffect, useRef, useLayoutEffect } from 'preact/hooks';
import type { JSX } from 'preact';
import { X, Pipette } from 'lucide-preact';
import inputStyles from './inputs.module.css';
import styles from './ColorInput.module.css';

/* ══════════════════════════════════════════════════════════════
   Color utilities — HSVA as internal model
   ══════════════════════════════════════════════════════════════ */

export interface HSVA {
  h: number; // 0-360
  s: number; // 0-1
  v: number; // 0-1
  a: number; // 0-1
}

export function hsvaToRgba(hsva: HSVA) {
  const { s, v, a } = hsva;
  const h = ((hsva.h % 360) + 360) % 360;
  const i = Math.floor(h / 60);
  const f = h / 60 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r = 0, g = 0, b = 0;
  switch (i) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
    a,
  };
}

export function rgbaToHsva(r: number, g: number, b: number, a: number, hueHint?: number): HSVA {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = hueHint ?? 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (d !== 0) {
    switch (max) {
      case r: h = 60 * (((g - b) / d) % 6); break;
      case g: h = 60 * ((b - r) / d + 2); break;
      case b: h = 60 * ((r - g) / d + 4); break;
    }
    if (h < 0) h += 360;
  }
  return { h, s, v, a };
}

export function hsvaToHsla(hsva: HSVA) {
  const { h, s, v, a } = hsva;
  const l = v * (1 - s / 2);
  const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
  return {
    h: Math.round(h),
    s: Math.round(sl * 100),
    l: Math.round(l * 100),
    a,
  };
}

export function hslaToHsva(h: number, s: number, l: number, a: number): HSVA {
  s /= 100; l /= 100;
  const v = l + s * Math.min(l, 1 - l);
  const sv = v === 0 ? 0 : 2 * (1 - l / v);
  return { h, s: sv, v, a };
}

export function hsvaToHex(hsva: HSVA): string {
  const { r, g, b, a } = hsvaToRgba(hsva);
  const hex = `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
  if (a < 1) {
    const alphaHex = Math.round(a * 255).toString(16).padStart(2, '0');
    return hex + alphaHex;
  }
  return hex;
}

export function hexToHsva(hex: string): HSVA {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  else if (hex.length === 4) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
  return rgbaToHsva(r, g, b, a);
}

function round2(n: number) { return Math.round(n * 100) / 100; }

function hsvaToRgbString(hsva: HSVA): string {
  const { r, g, b, a } = hsvaToRgba(hsva);
  if (a < 1) return `rgba(${r}, ${g}, ${b}, ${round2(a)})`;
  return `rgb(${r}, ${g}, ${b})`;
}

function hsvaToHslString(hsva: HSVA): string {
  const { h, s, l, a } = hsvaToHsla(hsva);
  if (a < 1) return `hsla(${h}, ${s}%, ${l}%, ${round2(a)})`;
  return `hsl(${h}, ${s}%, ${l}%)`;
}

export type ColorMode = 'rgba' | 'hsla' | 'hex' | 'custom';

export function formatColor(hsva: HSVA, mode: ColorMode): string {
  switch (mode) {
    case 'rgba': return hsvaToRgbString(hsva);
    case 'hsla': return hsvaToHslString(hsva);
    case 'hex':  return hsvaToHex(hsva);
    case 'custom': return hsvaToRgbString(hsva);
  }
}

/** Standard CSS named colors → hex. Lowercase keys; keyword colors that have no
 *  fixed value (currentcolor, inherit) are intentionally absent. */
const NAMED_COLOR_HEX: Record<string, string> = {
  aliceblue: '#f0f8ff', antiquewhite: '#faebd7', aqua: '#00ffff', aquamarine: '#7fffd4',
  azure: '#f0ffff', beige: '#f5f5dc', bisque: '#ffe4c4', black: '#000000',
  blanchedalmond: '#ffebcd', blue: '#0000ff', blueviolet: '#8a2be2', brown: '#a52a2a',
  burlywood: '#deb887', cadetblue: '#5f9ea0', chartreuse: '#7fff00', chocolate: '#d2691e',
  coral: '#ff7f50', cornflowerblue: '#6495ed', cornsilk: '#fff8dc', crimson: '#dc143c',
  cyan: '#00ffff', darkblue: '#00008b', darkcyan: '#008b8b', darkgoldenrod: '#b8860b',
  darkgray: '#a9a9a9', darkgreen: '#006400', darkgrey: '#a9a9a9', darkkhaki: '#bdb76b',
  darkmagenta: '#8b008b', darkolivegreen: '#556b2f', darkorange: '#ff8c00', darkorchid: '#9932cc',
  darkred: '#8b0000', darksalmon: '#e9967a', darkseagreen: '#8fbc8f', darkslateblue: '#483d8b',
  darkslategray: '#2f4f4f', darkslategrey: '#2f4f4f', darkturquoise: '#00ced1', darkviolet: '#9400d3',
  deeppink: '#ff1493', deepskyblue: '#00bfff', dimgray: '#696969', dimgrey: '#696969',
  dodgerblue: '#1e90ff', firebrick: '#b22222', floralwhite: '#fffaf0', forestgreen: '#228b22',
  fuchsia: '#ff00ff', gainsboro: '#dcdcdc', ghostwhite: '#f8f8ff', gold: '#ffd700',
  goldenrod: '#daa520', gray: '#808080', green: '#008000', greenyellow: '#adff2f',
  grey: '#808080', honeydew: '#f0fff0', hotpink: '#ff69b4', indianred: '#cd5c5c',
  indigo: '#4b0082', ivory: '#fffff0', khaki: '#f0e68c', lavender: '#e6e6fa',
  lavenderblush: '#fff0f5', lawngreen: '#7cfc00', lemonchiffon: '#fffacd', lightblue: '#add8e6',
  lightcoral: '#f08080', lightcyan: '#e0ffff', lightgoldenrodyellow: '#fafad2', lightgray: '#d3d3d3',
  lightgreen: '#90ee90', lightgrey: '#d3d3d3', lightpink: '#ffb6c1', lightsalmon: '#ffa07a',
  lightseagreen: '#20b2aa', lightskyblue: '#87cefa', lightslategray: '#778899', lightslategrey: '#778899',
  lightsteelblue: '#b0c4de', lightyellow: '#ffffe0', lime: '#00ff00', limegreen: '#32cd32',
  linen: '#faf0e6', magenta: '#ff00ff', maroon: '#800000', mediumaquamarine: '#66cdaa',
  mediumblue: '#0000cd', mediumorchid: '#ba55d3', mediumpurple: '#9370db', mediumseagreen: '#3cb371',
  mediumslateblue: '#7b68ee', mediumspringgreen: '#00fa9a', mediumturquoise: '#48d1cc',
  mediumvioletred: '#c71585', midnightblue: '#191970', mintcream: '#f5fffa', mistyrose: '#ffe4e1',
  moccasin: '#ffe4b5', navajowhite: '#ffdead', navy: '#000080', oldlace: '#fdf5e6',
  olive: '#808000', olivedrab: '#6b8e23', orange: '#ffa500', orangered: '#ff4500',
  orchid: '#da70d6', palegoldenrod: '#eee8aa', palegreen: '#98fb98', paleturquoise: '#afeeee',
  palevioletred: '#db7093', papayawhip: '#ffefd5', peachpuff: '#ffdab9', peru: '#cd853f',
  pink: '#ffc0cb', plum: '#dda0dd', powderblue: '#b0e0e6', purple: '#800080',
  rebeccapurple: '#663399', red: '#ff0000', rosybrown: '#bc8f8f', royalblue: '#4169e1',
  saddlebrown: '#8b4513', salmon: '#fa8072', sandybrown: '#f4a460', seagreen: '#2e8b57',
  seashell: '#fff5ee', sienna: '#a0522d', silver: '#c0c0c0', skyblue: '#87ceeb',
  slateblue: '#6a5acd', slategray: '#708090', slategrey: '#708090', snow: '#fffafa',
  springgreen: '#00ff7f', steelblue: '#4682b4', tan: '#d2b48c', teal: '#008080',
  thistle: '#d8bfd8', tomato: '#ff6347', turquoise: '#40e0d0', violet: '#ee82ee',
  wheat: '#f5deb3', white: '#ffffff', whitesmoke: '#f5f5f5', yellow: '#ffff00',
  yellowgreen: '#9acd32',
};

/** Parse a single rgb()/rgba() channel that is either a 0-255 number or a 0-100% value. */
function parseColorChannel(token: string): number {
  if (token.endsWith('%')) return Math.round((parseFloat(token) / 100) * 255);
  return parseInt(token, 10);
}

/** Normalize a CSS hue value to degrees, honoring the optional angle unit. */
function hueToDegrees(value: number, unit?: string): number {
  switch (unit) {
    case 'turn': return value * 360;
    case 'rad': return (value * 180) / Math.PI;
    case 'grad': return value * 0.9;
    default: return value; // deg or unitless
  }
}

export function parseCssColor(value: string): HSVA | null {
  const v = value.trim().toLowerCase();
  if (v === 'transparent') return { h: 0, s: 0, v: 0, a: 0 };
  const named = NAMED_COLOR_HEX[v];
  if (named) return hexToHsva(named);
  if (v.startsWith('#')) {
    const hex = v.slice(1);
    if (/^[0-9a-f]{3}$|^[0-9a-f]{4}$|^[0-9a-f]{6}$|^[0-9a-f]{8}$/.test(hex)) {
      return hexToHsva(v);
    }
    return null;
  }
  // Regexes are anchored to the whole value so wrappers like color-mix()/oklch()
  // that merely contain an rgb()/hsl() substring are NOT mis-parsed (P1.14).
  const rgbMatch = v.match(
    /^rgba?\(\s*([\d.]+%?)\s*[,\s]\s*([\d.]+%?)\s*[,\s]\s*([\d.]+%?)\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/,
  );
  if (rgbMatch) {
    const r = parseColorChannel(rgbMatch[1]);
    const g = parseColorChannel(rgbMatch[2]);
    const b = parseColorChannel(rgbMatch[3]);
    let a = 1;
    if (rgbMatch[4]) {
      a = rgbMatch[4].endsWith('%') ? parseFloat(rgbMatch[4]) / 100 : parseFloat(rgbMatch[4]);
    }
    return rgbaToHsva(r, g, b, a);
  }
  const hslMatch = v.match(
    /^hsla?\(\s*([\d.]+)(deg|grad|rad|turn)?\s*[,\s]\s*([\d.]+)%\s*[,\s]\s*([\d.]+)%\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/,
  );
  if (hslMatch) {
    const h = hueToDegrees(parseFloat(hslMatch[1]), hslMatch[2]);
    const s = parseFloat(hslMatch[3]);
    const l = parseFloat(hslMatch[4]);
    let a = 1;
    if (hslMatch[5]) {
      a = hslMatch[5].endsWith('%') ? parseFloat(hslMatch[5]) / 100 : parseFloat(hslMatch[5]);
    }
    return hslaToHsva(h, s, l, a);
  }
  return null;
}

export function detectColorMode(value: string): ColorMode {
  const v = value.trim().toLowerCase();
  if (v.startsWith('rgb')) return 'rgba';
  if (v.startsWith('hsl')) return 'hsla';
  if (v.startsWith('#') || v === 'transparent') return 'hex';
  return 'custom';
}

function clamp(v: number) { return Math.max(0, Math.min(1, v)); }

/* ══════════════════════════════════════════════════════════════
   Popover positioning
   ══════════════════════════════════════════════════════════════ */

function computePopoverPosition(
  anchorRect: DOMRect,
  popoverWidth: number,
  popoverHeight: number,
) {
  const GAP = 4;
  const spaceBelow = window.innerHeight - anchorRect.bottom - GAP;
  const spaceAbove = anchorRect.top - GAP;
  const top = spaceBelow >= popoverHeight || spaceBelow >= spaceAbove
    ? anchorRect.bottom + GAP
    : anchorRect.top - popoverHeight - GAP;
  const left = Math.max(GAP, anchorRect.right - popoverWidth);
  return { top, left };
}

/* ══════════════════════════════════════════════════════════════
   Eye dropper support
   ══════════════════════════════════════════════════════════════ */

const supportsEyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window;

/* ══════════════════════════════════════════════════════════════
   Popover Panel (draggable, close on outside click / Escape)
   ══════════════════════════════════════════════════════════════ */

const POPOVER_WIDTH = 240;

export interface PopoverPanelProps {
  anchorRect: DOMRect;
  onClose: () => void;
  children: any;
  width?: number;
}

export function PopoverPanel({ anchorRect, onClose, children, width = POPOVER_WIDTH }: PopoverPanelProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const measuredHeight = useRef(0);

  const [position, setPosition] = useState(() =>
    computePopoverPosition(anchorRect, width, measuredHeight.current),
  );

  useLayoutEffect(() => {
    if (popoverRef.current) {
      measuredHeight.current = popoverRef.current.offsetHeight;
    }
    setPosition(computePopoverPosition(anchorRect, width, measuredHeight.current));
  }, [anchorRect, width]);

  // Close on outside click
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.composedPath()[0] as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      onClose();
    };
    const root = popoverRef.current?.getRootNode() as Document ?? document;
    root.addEventListener('pointerdown', handlePointerDown as any);
    return () => root.removeEventListener('pointerdown', handlePointerDown as any);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      ref={popoverRef}
      class={styles.popover}
      style={{ top: position.top, left: position.left, width }}
    >
      <div class={styles.body}>{children}</div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   ChannelField — a single numeric input with optional scrub
   ══════════════════════════════════════════════════════════════ */

interface ScrubConfig {
  min: number;
  max: number;
  suffix?: string;
}

interface ChannelFieldProps {
  value: string | number;
  onCommit: (raw: string) => void;
  scrub?: ScrubConfig;
}

function ChannelField({ value, onCommit, scrub }: ChannelFieldProps) {
  const [local, setLocal] = useState(String(value));
  const isFocusedRef = useRef(false);
  const dragRef = useRef<{ startX: number; startVal: number } | null>(null);

  useEffect(() => {
    if (isFocusedRef.current || dragRef.current) return;
    setLocal(String(value));
  }, [value]);

  return (
    <input
      class={`${styles.channelInput} ${scrub ? styles.scrubbable : ''}`}
      value={local}
      onInput={(e) => setLocal((e.target as HTMLInputElement).value)}
      onFocus={() => { isFocusedRef.current = true; }}
      onBlur={() => { isFocusedRef.current = false; onCommit(local); }}
      onKeyDown={(e) => { if (e.key === 'Enter') onCommit(local); }}
      onPointerDown={scrub ? (e) => {
        if (isFocusedRef.current) return;
        e.preventDefault();
        const numStr = String(value).replace(/[^0-9.\-]/g, '');
        dragRef.current = { startX: e.clientX, startVal: parseFloat(numStr) || 0 };
        (e.currentTarget as HTMLInputElement).setPointerCapture(e.pointerId);
        document.body.style.cursor = 'ew-resize';
      } : undefined}
      onPointerMove={scrub ? (e) => {
        if (!dragRef.current || !(e.currentTarget as HTMLInputElement).hasPointerCapture(e.pointerId)) return;
        const delta = e.clientX - dragRef.current.startX;
        const clamped = Math.round(Math.max(scrub.min, Math.min(scrub.max, dragRef.current.startVal + delta)));
        const formatted = scrub.suffix ? `${clamped}${scrub.suffix}` : String(clamped);
        setLocal(formatted);
        onCommit(formatted);
      } : undefined}
      onPointerUp={scrub ? (e) => {
        document.body.style.cursor = '';
        const drag = dragRef.current;
        dragRef.current = null;
        if (!drag) return;
        if (Math.abs(e.clientX - drag.startX) < 3) {
          (e.currentTarget as HTMLInputElement).focus();
          (e.currentTarget as HTMLInputElement).select();
        }
      } : undefined}
    />
  );
}

/* ══════════════════════════════════════════════════════════════
   Channel input groups — RGBA / HSLA / Hex / Custom
   ══════════════════════════════════════════════════════════════ */

function RgbaInputs({ hsva, onChange }: { hsva: HSVA; onChange: (h: HSVA) => void }) {
  const { r, g, b, a } = hsvaToRgba(hsva);
  const update = useCallback(
    (channel: string, raw: string) => {
      const num = parseInt(raw) || 0;
      if (channel === 'a') {
        onChange({ ...hsva, a: clamp(num / 100) });
      } else {
        const rgba = hsvaToRgba(hsva);
        const clamped = Math.max(0, Math.min(255, num));
        const newRgba = { ...rgba, [channel]: clamped };
        onChange(rgbaToHsva(newRgba.r, newRgba.g, newRgba.b, hsva.a, hsva.h));
      }
    },
    [hsva, onChange],
  );
  return (
    <div class={styles.channelGroup}>
      <div class={styles.channelLabels}>
        <span class={styles.channelLabel}>R</span>
        <span class={styles.channelLabel}>G</span>
        <span class={styles.channelLabel}>B</span>
        <span class={styles.channelLabel}>A</span>
      </div>
      <div class={styles.channelRow}>
        <ChannelField value={r} onCommit={(v) => update('r', v)} scrub={{ min: 0, max: 255 }} />
        <ChannelField value={g} onCommit={(v) => update('g', v)} scrub={{ min: 0, max: 255 }} />
        <ChannelField value={b} onCommit={(v) => update('b', v)} scrub={{ min: 0, max: 255 }} />
        <ChannelField
          value={`${Math.round(a * 100)}%`}
          onCommit={(v) => update('a', v.replace('%', ''))}
          scrub={{ min: 0, max: 100, suffix: '%' }}
        />
      </div>
    </div>
  );
}

function HslaInputs({ hsva, onChange }: { hsva: HSVA; onChange: (h: HSVA) => void }) {
  const { h, s, l, a } = hsvaToHsla(hsva);
  const update = useCallback(
    (channel: string, raw: string) => {
      const num = parseInt(raw) || 0;
      if (channel === 'a') {
        onChange({ ...hsva, a: clamp(num / 100) });
      } else {
        const hsl = hsvaToHsla(hsva);
        const newHsl = { ...hsl, [channel]: num };
        newHsl.h = Math.max(0, Math.min(360, newHsl.h));
        newHsl.s = Math.max(0, Math.min(100, newHsl.s));
        newHsl.l = Math.max(0, Math.min(100, newHsl.l));
        onChange(hslaToHsva(newHsl.h, newHsl.s, newHsl.l, hsva.a));
      }
    },
    [hsva, onChange],
  );
  return (
    <div class={styles.channelGroup}>
      <div class={styles.channelLabels}>
        <span class={styles.channelLabel}>H</span>
        <span class={styles.channelLabel}>S</span>
        <span class={styles.channelLabel}>L</span>
        <span class={styles.channelLabel}>A</span>
      </div>
      <div class={styles.channelRow}>
        <ChannelField value={h} onCommit={(v) => update('h', v)} scrub={{ min: 0, max: 360 }} />
        <ChannelField value={s} onCommit={(v) => update('s', v)} scrub={{ min: 0, max: 100 }} />
        <ChannelField value={l} onCommit={(v) => update('l', v)} scrub={{ min: 0, max: 100 }} />
        <ChannelField
          value={`${Math.round(a * 100)}%`}
          onCommit={(v) => update('a', v.replace('%', ''))}
          scrub={{ min: 0, max: 100, suffix: '%' }}
        />
      </div>
    </div>
  );
}

function HexInputs({ hsva, onChange }: { hsva: HSVA; onChange: (h: HSVA) => void }) {
  const hex = hsvaToHex({ ...hsva, a: 1 }).slice(1);
  const commitHex = useCallback(
    (raw: string) => {
      const cleaned = raw.replace(/^#/, '');
      if (/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{4}$|^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{8}$/.test(cleaned)) {
        const parsed = hexToHsva('#' + cleaned);
        onChange({ ...parsed, a: hsva.a });
      }
    },
    [hsva.a, onChange],
  );
  const commitAlpha = useCallback(
    (raw: string) => {
      const num = parseInt(raw.replace('%', '')) || 0;
      onChange({ ...hsva, a: clamp(num / 100) });
    },
    [hsva, onChange],
  );
  return (
    <div class={styles.channelGroup}>
      <div class={`${styles.channelLabels} ${styles.twoCol}`}>
        <span class={styles.channelLabel}>Hex</span>
        <span class={styles.channelLabel}>A</span>
      </div>
      <div class={`${styles.channelRow} ${styles.twoCol}`}>
        <ChannelField value={hex} onCommit={commitHex} />
        <ChannelField
          value={`${Math.round(hsva.a * 100)}%`}
          onCommit={commitAlpha}
          scrub={{ min: 0, max: 100, suffix: '%' }}
        />
      </div>
    </div>
  );
}

function CustomInput({
  hsva,
  onChange,
  onCustomChange,
}: {
  hsva: HSVA;
  onChange: (h: HSVA) => void;
  onCustomChange?: (raw: string) => void;
}) {
  const [local, setLocal] = useState(() => formatColor(hsva, 'rgba'));
  const isFocusedRef = useRef(false);

  useEffect(() => {
    if (isFocusedRef.current) return;
    setLocal(formatColor(hsva, 'rgba'));
  }, [hsva]);

  const handleCommit = useCallback(() => {
    const parsed = parseCssColor(local);
    if (parsed) {
      onChange(parsed);
    } else {
      onCustomChange?.(local);
    }
  }, [local, onChange, onCustomChange]);

  return (
    <div class={styles.channelRow}>
      <input
        class={styles.customInput}
        value={local}
        onInput={(e) => setLocal((e.target as HTMLInputElement).value)}
        onFocus={() => { isFocusedRef.current = true; }}
        onBlur={() => { isFocusedRef.current = false; handleCommit(); }}
        onKeyDown={(e) => e.key === 'Enter' && handleCommit()}
      />
    </div>
  );
}

function ChannelInputs({
  hsva,
  mode,
  onChange,
  onCustomChange,
}: {
  hsva: HSVA;
  mode: ColorMode;
  onChange: (h: HSVA) => void;
  onCustomChange?: (raw: string) => void;
}) {
  if (mode === 'custom') return <CustomInput hsva={hsva} onChange={onChange} onCustomChange={onCustomChange} />;
  if (mode === 'hex') return <HexInputs hsva={hsva} onChange={onChange} />;
  if (mode === 'hsla') return <HslaInputs hsva={hsva} onChange={onChange} />;
  return <RgbaInputs hsva={hsva} onChange={onChange} />;
}

/* ══════════════════════════════════════════════════════════════
   ColorPickerCore — the actual picker UI
   ══════════════════════════════════════════════════════════════ */

export interface ColorPickerCoreProps {
  hsva: HSVA;
  mode: ColorMode;
  onChange: (hsva: HSVA) => void;
  onModeChange: (mode: ColorMode) => void;
  onCustomChange?: (raw: string) => void;
}

export function ColorPickerCore({ hsva, mode, onChange, onModeChange, onCustomChange }: ColorPickerCoreProps) {
  function dragHandlers(map: (pctX: number, pctY: number) => Partial<HSVA>) {
    const handle = (e: JSX.TargetedPointerEvent<HTMLDivElement>) => {
      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
      const pctX = clamp((e.clientX - rect.left) / rect.width);
      const pctY = clamp((e.clientY - rect.top) / rect.height);
      onChange({ ...hsva, ...map(pctX, pctY) });
    };
    return {
      onPointerDown: (e: JSX.TargetedPointerEvent<HTMLDivElement>) => {
        handle(e);
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      },
      onPointerMove: (e: JSX.TargetedPointerEvent<HTMLDivElement>) => {
        if (!(e.currentTarget as HTMLDivElement).hasPointerCapture(e.pointerId)) return;
        handle(e);
      },
    };
  }

  const handleEyeDropper = useCallback(async () => {
    try {
      const dropper = new (window as any).EyeDropper();
      const result = await dropper.open();
      const picked = hexToHsva(result.sRGBHex);
      onChange({ ...picked, a: hsva.a });
    } catch { /* cancelled */ }
  }, [hsva.a, onChange]);

  const svDrag = dragHandlers((x, y) => ({ s: x, v: 1 - y }));
  const hueDrag = dragHandlers((x) => ({ h: x * 360 }));
  const alphaDrag = dragHandlers((x) => ({ a: x }));
  const solidHex = hsvaToHex({ ...hsva, a: 1 });
  const thumbRgba = hsvaToRgba(hsva);

  return (
    <Fragment>
      {/* SV area + hue slider + alpha slider */}
      <div class={styles.visualSection}>
        <div
          class={styles.svArea}
          style={{ backgroundColor: `hsl(${hsva.h}, 100%, 50%)` }}
          {...svDrag}
        >
          <div
            class={styles.thumb}
            style={{
              left: `calc(6px + (100% - 12px) * ${hsva.s})`,
              top: `calc(6px + (100% - 12px) * ${1 - hsva.v})`,
              backgroundColor: `rgb(${thumbRgba.r},${thumbRgba.g},${thumbRgba.b})`,
            }}
          />
        </div>

        <div class={`${styles.sliderTrack} ${styles.hueTrack}`} {...hueDrag}>
          <div
            class={styles.sliderThumb}
            style={{ left: `calc(6px + (100% - 12px) * ${hsva.h / 360})` }}
          />
        </div>

        <div class={`${styles.sliderTrack} ${styles.alphaTrack}`} {...alphaDrag}>
          <div
            class={styles.alphaGradient}
            style={{ background: `linear-gradient(to right, transparent, ${solidHex})` }}
          />
          <div
            class={styles.sliderThumb}
            style={{ left: `calc(6px + (100% - 12px) * ${hsva.a})` }}
          />
        </div>
      </div>

      {/* Channel numeric inputs */}
      <ChannelInputs hsva={hsva} mode={mode} onChange={onChange} onCustomChange={onCustomChange} />

      {/* Mode select + eyedropper */}
      <div class={styles.bottomRow}>
        <select
          class={styles.modeSelect}
          value={mode}
          onChange={(e) => onModeChange((e.target as HTMLSelectElement).value as ColorMode)}
        >
          <option value="rgba">RGB</option>
          <option value="hsla">HSL</option>
          <option value="hex">Hex</option>
          <option value="custom">Custom</option>
        </select>
        {supportsEyeDropper && (
          <button class={styles.eyedropperButton} onClick={handleEyeDropper} title="Pick color from screen">
            <Pipette size={16} />
          </button>
        )}
      </div>
    </Fragment>
  );
}

/* ══════════════════════════════════════════════════════════════
   ColorPicker — popover wrapper around ColorPickerCore
   ══════════════════════════════════════════════════════════════ */

interface ColorPickerProps {
  hsva: HSVA;
  mode: ColorMode;
  anchorRect: DOMRect;
  onChange: (hsva: HSVA) => void;
  onModeChange: (mode: ColorMode) => void;
  onCustomChange?: (raw: string) => void;
  onClose: () => void;
}

function ColorPicker({ hsva, mode, anchorRect, onChange, onModeChange, onCustomChange, onClose }: ColorPickerProps) {
  return (
    <PopoverPanel anchorRect={anchorRect} onClose={onClose}>
      <ColorPickerCore
        hsva={hsva}
        mode={mode}
        onChange={onChange}
        onModeChange={onModeChange}
        onCustomChange={onCustomChange}
      />
    </PopoverPanel>
  );
}

/* ══════════════════════════════════════════════════════════════
   ColorInput — main exported component (swatch + text + picker)
   ══════════════════════════════════════════════════════════════ */

const DEFAULT_HSVA: HSVA = { h: 0, s: 0, v: 0, a: 1 };

export interface ColorInputProps {
  label?: string;
  displayName?: string;
  value: string;
  mono?: boolean;
  endContent?: JSX.Element;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onCustomChange?: (raw: string) => void;
}

export function ColorInput({
  label,
  displayName,
  value,
  mono,
  endContent,
  onChange,
  onFocus,
  onCustomChange,
}: ColorInputProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hsva, setHsva] = useState<HSVA>(() => parseCssColor(value) ?? DEFAULT_HSVA);
  const [mode, setMode] = useState<ColorMode>(() => detectColorMode(value));
  const [localText, setLocalText] = useState(value);
  const hueRef = useRef(hsva.h);
  const isEditingRef = useRef(false);
  const swatchRef = useRef<HTMLButtonElement>(null);
  const anchorRectRef = useRef<DOMRect | null>(null);

  function updateHsva(parsed: HSVA) {
    if (parsed.s > 0 && parsed.v > 0) hueRef.current = parsed.h;
    setHsva({
      ...parsed,
      h: parsed.s === 0 || parsed.v === 0 ? hueRef.current : parsed.h,
    });
  }

  useEffect(() => {
    if (isEditingRef.current) return;
    const parsed = parseCssColor(value);
    if (parsed) updateHsva(parsed);
    setLocalText(value);
  }, [value]);

  const handlePickerChange = useCallback(
    (newHsva: HSVA) => {
      if (newHsva.s > 0 && newHsva.v > 0) hueRef.current = newHsva.h;
      setHsva(newHsva);
      isEditingRef.current = true;
      const css = formatColor(newHsva, mode);
      setLocalText(css);
      onChange(css);
    },
    [mode, onChange],
  );

  const handleModeChange = useCallback(
    (newMode: ColorMode) => {
      setMode(newMode);
      if (newMode !== 'custom') {
        const css = formatColor(hsva, newMode);
        setLocalText(css);
        onChange(css);
      }
    },
    [hsva, onChange],
  );

  const handleCustomChange = useCallback(
    (raw: string) => {
      setLocalText(raw);
      onChange(raw);
      onCustomChange?.(raw);
    },
    [onChange, onCustomChange],
  );

  const commitText = useCallback(
    (text: string) => {
      const val = text.toLowerCase() === 'none' ? 'transparent' : text;
      onChange(val);
      const parsed = parseCssColor(val);
      if (parsed) updateHsva(parsed);
    },
    [onChange],
  );

  const handleTextChange = useCallback((e: JSX.TargetedEvent<HTMLInputElement>) => {
    setLocalText((e.target as HTMLInputElement).value);
  }, []);

  const handleTextFocus = useCallback(() => {
    isEditingRef.current = true;
    onFocus?.();
  }, [onFocus]);

  const handleTextBlur = useCallback(() => {
    isEditingRef.current = false;
    if (localText !== value) commitText(localText);
  }, [localText, value, commitText]);

  const handleTextKeyDown = useCallback(
    (e: JSX.TargetedKeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') commitText(localText);
    },
    [localText, commitText],
  );

  const handleSwatchClick = useCallback(() => {
    if (swatchRef.current) {
      anchorRectRef.current = swatchRef.current.getBoundingClientRect();
    }
    setPickerOpen((prev) => !prev);
    onFocus?.();
  }, [onFocus]);

  const handleClose = useCallback(() => {
    setPickerOpen(false);
    isEditingRef.current = false;
  }, []);

  const isValid = parseCssColor(value) !== null;
  const displayLabel = displayName !== undefined ? displayName : label;
  const swatchRgba = hsvaToRgba(hsva);
  const swatchStyle = {
    backgroundColor: `rgba(${swatchRgba.r},${swatchRgba.g},${swatchRgba.b},${swatchRgba.a})`,
  };

  return (
    <div class={inputStyles.row}>
      {displayLabel && (
        <label class={`${inputStyles.label} ${mono ? inputStyles.mono : ''}`}>
          {displayLabel}
        </label>
      )}
      <div class={styles.colorGroup} style={{ position: 'relative' }}>
        <div class={styles.swatchWrapper}>
          {!isValid && <div class={styles.emptyColorSwatch} />}
          <button ref={swatchRef} class={styles.swatchButton} onClick={handleSwatchClick}>
            <span class={styles.swatchColor} style={isValid ? swatchStyle : undefined} />
          </button>
        </div>
        <input
          type="text"
          class={styles.colorText}
          value={localText}
          onInput={handleTextChange}
          onBlur={handleTextBlur}
          onKeyDown={handleTextKeyDown}
          onFocus={handleTextFocus}
          style={endContent ? { paddingRight: '20px' } : undefined}
        />
        {endContent}
      </div>
      {pickerOpen && anchorRectRef.current && (
        <ColorPicker
          hsva={hsva}
          mode={mode}
          anchorRect={anchorRectRef.current}
          onChange={handlePickerChange}
          onModeChange={handleModeChange}
          onCustomChange={handleCustomChange}
          onClose={handleClose}
        />
      )}
    </div>
  );
}
