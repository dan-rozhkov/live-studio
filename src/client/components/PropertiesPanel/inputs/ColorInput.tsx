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

export function parseCssColor(value: string): HSVA | null {
  const v = value.trim().toLowerCase();
  if (v === 'transparent') return { h: 0, s: 0, v: 0, a: 0 };
  if (v.startsWith('#')) {
    const hex = v.slice(1);
    if (/^[0-9a-f]{3}$|^[0-9a-f]{4}$|^[0-9a-f]{6}$|^[0-9a-f]{8}$/.test(hex)) {
      return hexToHsva(v);
    }
    return null;
  }
  const rgbMatch = v.match(
    /rgba?\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)\s*(?:[,/]\s*([\d.]+%?))?\s*\)/,
  );
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]);
    const g = parseInt(rgbMatch[2]);
    const b = parseInt(rgbMatch[3]);
    let a = 1;
    if (rgbMatch[4]) {
      a = rgbMatch[4].endsWith('%') ? parseFloat(rgbMatch[4]) / 100 : parseFloat(rgbMatch[4]);
    }
    return rgbaToHsva(r, g, b, a);
  }
  const hslMatch = v.match(
    /hsla?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)%\s*[,\s]\s*([\d.]+)%\s*(?:[,/]\s*([\d.]+%?))?\s*\)/,
  );
  if (hslMatch) {
    const h = parseFloat(hslMatch[1]);
    const s = parseFloat(hslMatch[2]);
    const l = parseFloat(hslMatch[3]);
    let a = 1;
    if (hslMatch[4]) {
      a = hslMatch[4].endsWith('%') ? parseFloat(hslMatch[4]) / 100 : parseFloat(hslMatch[4]);
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
  popoverHeight: number,
  popoverWidth: number,
) {
  const MARGIN = 4;
  let top = anchorRect.bottom + 6;
  if (top + popoverHeight > window.innerHeight) {
    top = anchorRect.top - popoverHeight - 6;
  }
  let left = anchorRect.left;
  top = Math.max(MARGIN, Math.min(top, window.innerHeight - popoverHeight - MARGIN));
  left = Math.max(MARGIN, Math.min(left, window.innerWidth - popoverWidth - MARGIN));
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
const HEADER_HEIGHT = 33;

interface PopoverPanelProps {
  title: string;
  anchorRect: DOMRect;
  popoverHeight: number;
  onClose: () => void;
  children: any;
}

function PopoverPanel({ title, anchorRect, popoverHeight, onClose, children }: PopoverPanelProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const hasBeenDragged = useRef(false);

  const totalHeight = popoverHeight + HEADER_HEIGHT;
  const [position, setPosition] = useState(() =>
    computePopoverPosition(anchorRect, totalHeight, POPOVER_WIDTH),
  );

  useLayoutEffect(() => {
    if (hasBeenDragged.current) return;
    setPosition(computePopoverPosition(anchorRect, totalHeight, POPOVER_WIDTH));
  }, [anchorRect, totalHeight]);

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

  const handleDragStart = useCallback((e: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    dragging.current = true;
    hasBeenDragged.current = true;
    const rect = popoverRef.current!.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }, []);

  const handleDragMove = useCallback((e: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    setPosition({
      top: Math.max(0, e.clientY - dragOffset.current.y),
      left: Math.max(0, e.clientX - dragOffset.current.x),
    });
  }, []);

  const handleDragEnd = useCallback((e: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
  }, []);

  return (
    <div
      ref={popoverRef}
      class={styles.popover}
      style={{ top: position.top, left: position.left, width: POPOVER_WIDTH }}
    >
      <div
        class={styles.header}
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
      >
        <span class={styles.headerTitle}>{title}</span>
        <button class={styles.closeButton} onClick={onClose} title="Close (Escape)">
          <X size={10} />
        </button>
      </div>
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
    <PopoverPanel title="Color" anchorRect={anchorRect} popoverHeight={400} onClose={onClose}>
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
  onChange: (value: string) => void;
  onFocus?: () => void;
  onCustomChange?: (raw: string) => void;
}

export function ColorInput({
  label,
  displayName,
  value,
  mono,
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
  const displayLabel = displayName || label;
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
      <div class={styles.colorGroup}>
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
        />
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
