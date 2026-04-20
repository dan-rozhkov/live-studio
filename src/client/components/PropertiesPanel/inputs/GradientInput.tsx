import { h, Fragment } from 'preact';
import { useState, useCallback, useEffect, useRef } from 'preact/hooks';
import type { JSX } from 'preact';
import { X } from 'lucide-preact';
import inputStyles from './inputs.module.css';
import styles from './GradientInput.module.css';
import { ColorPickerCore, PopoverPanel, parseCssColor, hsvaToRgba, hsvaToHex, type HSVA, type ColorMode } from './ColorInput';

/* ══════════════════════════════════════════════════════════════
   Gradient config types
   ══════════════════════════════════════════════════════════════ */

export interface GradientStop {
  id: string;
  color: string;
  position: number;
}

export interface GradientConfig {
  type: 'linear' | 'radial' | 'conic';
  repeating: boolean;
  angle: number;
  shape: string;
  posX: string;
  posY: string;
  stopUnit: string;
  stops: GradientStop[];
  selectedStopId: string | null;
}

/* ══════════════════════════════════════════════════════════════
   Gradient parsing / serialization utilities
   ══════════════════════════════════════════════════════════════ */

let nextId = 1;
function uid(): string {
  return `stop-${nextId++}-${Date.now().toString(36)}`;
}

export function createDefaultGradient(firstColor?: string): GradientConfig {
  return {
    type: 'linear',
    repeating: false,
    angle: 90,
    shape: 'circle',
    posX: '50%',
    posY: '50%',
    stopUnit: '%',
    stops: [
      { id: uid(), color: firstColor ?? '#000000', position: 0 },
      { id: uid(), color: '#ffffff', position: 100 },
    ],
    selectedStopId: null,
  };
}

const GRADIENT_RE = /^(repeating-)?(linear|radial|conic)-gradient\(\s*([\s\S]*)\s*\)$/i;

function splitGradientArgs(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function parsePosition(str: string): { x: string; y: string } {
  const nums = str.match(/([\d.]+)(px|%|)\s+([\d.]+)(px|%|)/);
  if (nums) {
    return {
      x: `${parseFloat(nums[1])}${nums[2] || '%'}`,
      y: `${parseFloat(nums[3])}${nums[4] || '%'}`,
    };
  }
  const named: Record<string, { x: string; y: string }> = {
    center: { x: '50%', y: '50%' },
    top: { x: '50%', y: '0%' },
    bottom: { x: '50%', y: '100%' },
    left: { x: '0%', y: '50%' },
    right: { x: '100%', y: '50%' },
    'top left': { x: '0%', y: '0%' },
    'top right': { x: '100%', y: '0%' },
    'bottom left': { x: '0%', y: '100%' },
    'bottom right': { x: '100%', y: '100%' },
  };
  return named[str.toLowerCase()] ?? { x: '50%', y: '50%' };
}

function directionToAngle(dir: string): number {
  const map: Record<string, number> = {
    top: 0, right: 90, bottom: 180, left: 270,
    'top right': 45, 'right top': 45,
    'bottom right': 135, 'right bottom': 135,
    'bottom left': 225, 'left bottom': 225,
    'top left': 315, 'left top': 315,
  };
  return map[dir] ?? 180;
}

function detectStopUnit(body: string): string {
  return /\d+px/i.test(body) ? 'px' : '%';
}

function parseStopPart(part: string, index: number, total: number): GradientStop | null {
  const posMatch = part.match(/^(.+?)\s+([\d.]+)(%|px)?\s*$/);
  if (posMatch) {
    return {
      id: uid(),
      color: posMatch[1].trim(),
      position: parseFloat(posMatch[2]),
    };
  }
  return {
    id: uid(),
    color: part.trim(),
    position: total > 1 ? (index / (total - 1)) * 100 : 0,
  };
}

export function parseGradient(css: string): GradientConfig | null {
  const trimmed = css.trim();
  const m = trimmed.match(GRADIENT_RE);
  if (!m) return null;
  const repeating = !!m[1];
  const type = m[2].toLowerCase() as GradientConfig['type'];
  const body = m[3];
  const parts = splitGradientArgs(body);
  let angle = type === 'linear' ? 180 : 0;
  let shape = 'circle';
  let posX = '50%';
  let posY = '50%';
  const stopUnit = detectStopUnit(body);
  let stopStartIndex = 0;

  if (parts.length > 0) {
    const first = parts[0].trim();
    if (type === 'linear') {
      const angleMatch = first.match(/^([\d.]+)deg$/);
      const dirMatch = first.match(/^to\s+(.+)$/);
      if (angleMatch) {
        angle = parseFloat(angleMatch[1]);
        stopStartIndex = 1;
      } else if (dirMatch) {
        angle = directionToAngle(dirMatch[1].trim());
        stopStartIndex = 1;
      }
    } else if (type === 'radial') {
      if (/^(circle|ellipse|closest|farthest)/i.test(first) || /\bat\b/i.test(first)) {
        const atMatch = first.match(/\bat\s+(.+)$/i);
        if (atMatch) {
          shape = first.slice(0, atMatch.index).trim() || 'circle';
          const pos = parsePosition(atMatch[1].trim());
          posX = pos.x;
          posY = pos.y;
        } else {
          shape = first;
        }
        stopStartIndex = 1;
      }
    } else if (type === 'conic') {
      const conicMatch = first.match(/^from\s+([\d.]+)deg/);
      if (conicMatch) {
        angle = parseFloat(conicMatch[1]);
        stopStartIndex = 1;
      }
      const atMatch = first.match(/\bat\s+(.+)$/i);
      if (atMatch) {
        const pos = parsePosition(atMatch[1].trim());
        posX = pos.x;
        posY = pos.y;
        stopStartIndex = 1;
      }
    }
  }

  const stops: GradientStop[] = [];
  const stopParts = parts.slice(stopStartIndex);
  for (let i = 0; i < stopParts.length; i++) {
    const parsed = parseStopPart(stopParts[i].trim(), i, stopParts.length);
    if (parsed) stops.push(parsed);
  }
  if (stops.length < 2) return null;

  return {
    type, repeating, angle, shape, posX, posY, stopUnit, stops,
    selectedStopId: null,
  };
}

export function serializeGradient(config: GradientConfig): string {
  const prefix = config.repeating ? 'repeating-' : '';
  const funcName = `${prefix}${config.type}-gradient`;
  const unit = config.stopUnit ?? '%';
  const sortedStops = [...config.stops].sort((a, b) => a.position - b.position);
  const stopStrs = sortedStops.map(
    (s) => `${s.color} ${Math.round(s.position)}${unit}`,
  );
  const posX = config.posX ?? '50%';
  const posY = config.posY ?? '50%';
  const atPos = posX !== '50%' || posY !== '50%' ? ` at ${posX} ${posY}` : '';
  let args: string;
  if (config.type === 'linear') {
    args = `${Math.round(config.angle)}deg, ${stopStrs.join(', ')}`;
  } else if (config.type === 'radial') {
    args = `${config.shape}${atPos}, ${stopStrs.join(', ')}`;
  } else {
    args = `from ${Math.round(config.angle)}deg${atPos}, ${stopStrs.join(', ')}`;
  }
  return `${funcName}(${args})`;
}

export function isGradientValue(css: string): boolean {
  return GRADIENT_RE.test(css.trim());
}

/* ══════════════════════════════════════════════════════════════
   Helper: max stop position
   ══════════════════════════════════════════════════════════════ */

function getMaxStopPosition(stops: GradientStop[], unit: string): number {
  return unit === 'px' ? Math.max(1, ...stops.map((s) => s.position)) : 100;
}


/* ══════════════════════════════════════════════════════════════
   StopBar — draggable color stop thumbs
   ══════════════════════════════════════════════════════════════ */

interface StopBarProps {
  stops: GradientStop[];
  selectedId: string | null;
  stopUnit: string;
  onSelect: (id: string) => void;
  onDrag: (id: string, position: number) => void;
  onDelete: (id: string) => void;
}

function StopBar({ stops, selectedId, stopUnit, onSelect, onDrag, onDelete }: StopBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<string | null>(null);
  const maxPos = getMaxStopPosition(stops, stopUnit);

  const handlePointerDown = useCallback(
    (e: JSX.TargetedPointerEvent<HTMLDivElement>, id: string) => {
      e.preventDefault();
      onSelect(id);
      draggingRef.current = id;
      (e.target as HTMLDivElement).setPointerCapture(e.pointerId);
    },
    [onSelect],
  );

  const handlePointerMove = useCallback(
    (e: JSX.TargetedPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current || !barRef.current) return;
      if (!(e.target as HTMLDivElement).hasPointerCapture(e.pointerId)) return;
      const rect = barRef.current.getBoundingClientRect();
      const pos = Math.round(((e.clientX - rect.left) / rect.width) * maxPos);
      onDrag(draggingRef.current, pos);
    },
    [onDrag, maxPos],
  );

  const handlePointerUp = useCallback(() => {
    draggingRef.current = null;
  }, []);

  return (
    <div
      ref={barRef}
      class={styles.stopBar}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {stops.map((stop) => (
        <div
          key={stop.id}
          class={`${styles.stopThumb} ${stop.id === selectedId ? styles.selected : ''}`}
          style={{
            left: `${(stop.position / maxPos) * 100}%`,
            backgroundColor: stop.color,
          }}
          onPointerDown={(e: JSX.TargetedPointerEvent<HTMLDivElement>) => handlePointerDown(e, stop.id)}
          onDblClick={() => onDelete(stop.id)}
        />
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   StopSwatch — small color preview button
   ══════════════════════════════════════════════════════════════ */

function StopSwatch({ color, onClick }: { color: string; onClick: () => void }) {
  const isParseable = parseCssColor(color) !== null;
  return (
    <button class={styles.stopSwatch} onClick={onClick}>
      <span
        class={styles.stopSwatchColor}
        style={{ backgroundColor: isParseable ? color : 'transparent' }}
      />
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════
   StopColorField — editable color text input
   ══════════════════════════════════════════════════════════════ */

function StopColorField({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const [local, setLocal] = useState(color);
  const isFocusedRef = useRef(false);

  useEffect(() => {
    if (isFocusedRef.current) return;
    setLocal(color);
  }, [color]);

  return (
    <input
      class={styles.stopColorInput}
      value={local}
      onInput={(e) => setLocal((e.target as HTMLInputElement).value)}
      onFocus={() => { isFocusedRef.current = true; }}
      onBlur={() => { isFocusedRef.current = false; onChange(local); }}
      onKeyDown={(e) => { if (e.key === 'Enter') onChange(local); }}
    />
  );
}

/* ══════════════════════════════════════════════════════════════
   PositionField — editable stop position input
   ══════════════════════════════════════════════════════════════ */

function PositionField({ position, unit, onChange }: { position: number; unit: string; onChange: (raw: string) => void }) {
  const [local, setLocal] = useState(`${Math.round(position)}${unit}`);
  const isFocusedRef = useRef(false);

  useEffect(() => {
    if (isFocusedRef.current) return;
    setLocal(`${Math.round(position)}${unit}`);
  }, [position, unit]);

  return (
    <input
      class={styles.positionInput}
      value={local}
      onInput={(e) => setLocal((e.target as HTMLInputElement).value)}
      onFocus={() => { isFocusedRef.current = true; }}
      onBlur={() => { isFocusedRef.current = false; onChange(local); }}
      onKeyDown={(e) => { if (e.key === 'Enter') onChange(local); }}
    />
  );
}

/* ══════════════════════════════════════════════════════════════
   GradientPicker — the full gradient editing panel
   ══════════════════════════════════════════════════════════════ */

const GRADIENT_TYPES: { value: string; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'radial', label: 'Radial' },
  { value: 'conic', label: 'Conic' },
];

export interface GradientPickerProps {
  config: GradientConfig;
  onChange: (config: GradientConfig) => void;
}

export function GradientPicker({ config, onChange }: GradientPickerProps) {
  const selectedStop = config.stops.find((s) => s.id === config.selectedStopId);
  const [miniPickerOpen, setMiniPickerOpen] = useState(false);
  const [stopMode, setStopMode] = useState<ColorMode>('hex');
  const [stopHsva, setStopHsva] = useState<HSVA>({ h: 0, s: 0, v: 0, a: 1 });
  const stopHueRef = useRef(0);

  const selectedStopColor = selectedStop?.color;
  const selectedStopId = selectedStop?.id;

  useEffect(() => {
    if (!selectedStopColor) return;
    const parsed = parseCssColor(selectedStopColor);
    if (!parsed) return;
    if (parsed.s > 0 && parsed.v > 0) stopHueRef.current = parsed.h;
    setStopHsva({
      ...parsed,
      h: parsed.s === 0 || parsed.v === 0 ? stopHueRef.current : parsed.h,
    });
  }, [selectedStopId, selectedStopColor]);

  const handleAddStop = useCallback(
    (e: JSX.TargetedMouseEvent<HTMLDivElement>) => {
      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
      const pct = Math.round(((e.clientX - rect.left) / rect.width) * 100);
      const newStop: GradientStop = {
        id: uid(),
        color: '#808080',
        position: Math.max(0, Math.min(100, pct)),
      };
      onChange({
        ...config,
        stops: [...config.stops, newStop],
        selectedStopId: newStop.id,
      });
    },
    [config, onChange],
  );

  const handleSelectStop = useCallback(
    (id: string) => {
      onChange({ ...config, selectedStopId: id });
      setMiniPickerOpen(false);
    },
    [config, onChange],
  );

  const handleStopDrag = useCallback(
    (id: string, position: number) => {
      onChange({
        ...config,
        stops: config.stops.map(
          (s) => s.id === id ? { ...s, position: Math.max(0, Math.min(100, position)) } : s,
        ),
      });
    },
    [config, onChange],
  );

  const handleStopColorChange = useCallback(
    (id: string, color: string) => {
      onChange({
        ...config,
        stops: config.stops.map(
          (s) => s.id === id ? { ...s, color } : s,
        ),
      });
    },
    [config, onChange],
  );

  const handleDeleteStop = useCallback(
    (id: string) => {
      if (config.stops.length <= 2) return;
      const newStops = config.stops.filter((s) => s.id !== id);
      onChange({
        ...config,
        stops: newStops,
        selectedStopId: config.selectedStopId === id
          ? newStops[0]?.id ?? null
          : config.selectedStopId,
      });
      setMiniPickerOpen(false);
    },
    [config, onChange],
  );

  const handleTypeChange = useCallback(
    (type: string) => {
      onChange({ ...config, type: type as GradientConfig['type'] });
    },
    [config, onChange],
  );

  const handleRepeatToggle = useCallback(
    () => {
      const repeating = !config.repeating;
      if (repeating) {
        const size = 20;
        onChange({
          ...config,
          repeating,
          stopUnit: 'px',
          stops: config.stops.map((s) => ({
            ...s,
            position: Math.round((s.position / 100) * size),
          })),
        });
      } else {
        const maxPos = Math.max(1, ...config.stops.map((s) => s.position));
        onChange({
          ...config,
          repeating,
          stopUnit: '%',
          stops: config.stops.map((s) => ({
            ...s,
            position: Math.round((s.position / maxPos) * 100),
          })),
        });
      }
    },
    [config, onChange],
  );

  const handleAngleChange = useCallback(
    (e: JSX.TargetedEvent<HTMLInputElement>) => {
      const num = parseInt((e.target as HTMLInputElement).value) || 0;
      onChange({ ...config, angle: num });
    },
    [config, onChange],
  );

  const handleShapeChange = useCallback(
    (e: JSX.TargetedEvent<HTMLSelectElement>) => {
      onChange({ ...config, shape: (e.target as HTMLSelectElement).value });
    },
    [config, onChange],
  );

  const handlePosXChange = useCallback(
    (e: JSX.TargetedEvent<HTMLInputElement>) => {
      onChange({ ...config, posX: (e.target as HTMLInputElement).value });
    },
    [config, onChange],
  );

  const handlePosYChange = useCallback(
    (e: JSX.TargetedEvent<HTMLInputElement>) => {
      onChange({ ...config, posY: (e.target as HTMLInputElement).value });
    },
    [config, onChange],
  );

  const handlePositionChange = useCallback(
    (id: string, raw: string) => {
      const num = parseInt(raw.replace(/[%px]/g, '')) || 0;
      const max = config.stopUnit === 'px' ? 9999 : 100;
      const clamped = Math.max(0, Math.min(max, num));
      onChange({
        ...config,
        stops: config.stops.map(
          (s) => s.id === id ? { ...s, position: clamped } : s,
        ),
      });
    },
    [config, onChange],
  );

  const handleStopHsvaChange = useCallback(
    (newHsva: HSVA) => {
      if (!selectedStop) return;
      if (newHsva.s > 0 && newHsva.v > 0) stopHueRef.current = newHsva.h;
      setStopHsva(newHsva);
      const { r, g, b, a } = hsvaToRgba(newHsva);
      const color = a < 1
        ? `rgba(${r}, ${g}, ${b}, ${Math.round(a * 100) / 100})`
        : hsvaToHex(newHsva);
      handleStopColorChange(selectedStop.id, color);
    },
    [selectedStop, handleStopColorChange],
  );

  const handleSwatchClick = useCallback(() => {
    setMiniPickerOpen((prev) => !prev);
  }, []);

  const sortedStops = [...config.stops].sort((a, b) => a.position - b.position);
  const maxPos = getMaxStopPosition(config.stops, config.stopUnit ?? '%');
  const stopPreviewCss = `linear-gradient(to right, ${sortedStops.map(
    (s) => `${s.color} ${(s.position / maxPos) * 100}%`,
  ).join(', ')})`;

  return (
    <div class={styles.gradientPicker}>
      {/* Gradient preview bar */}
      <div>
        <div class={styles.previewWrapper}>
          <div class={styles.previewCheckerboard} />
          <div
            class={styles.previewGradient}
            style={{ backgroundImage: stopPreviewCss }}
            onClick={handleAddStop}
          />
        </div>
        <StopBar
          stops={config.stops}
          selectedId={config.selectedStopId}
          stopUnit={config.stopUnit ?? '%'}
          onSelect={handleSelectStop}
          onDrag={handleStopDrag}
          onDelete={handleDeleteStop}
        />
      </div>

      {/* Selected stop editor */}
      {selectedStop && (
        <div class={styles.stopEditor}>
          <div class={styles.stopColorRow}>
            <StopSwatch color={selectedStop.color} onClick={handleSwatchClick} />
            <StopColorField
              color={selectedStop.color}
              onChange={(c) => handleStopColorChange(selectedStop.id, c)}
            />
            <PositionField
              position={selectedStop.position}
              unit={config.stopUnit ?? '%'}
              onChange={(raw) => handlePositionChange(selectedStop.id, raw)}
            />
            {config.stops.length > 2 && (
              <button
                class={styles.deleteStopButton}
                onClick={() => handleDeleteStop(selectedStop.id)}
                title="Remove stop"
              >
                <X size={10} />
              </button>
            )}
          </div>
          {miniPickerOpen && (
            <ColorPickerCore
              hsva={stopHsva}
              mode={stopMode}
              onChange={handleStopHsvaChange}
              onModeChange={setStopMode}
            />
          )}
        </div>
      )}

      {miniPickerOpen && <div class={styles.divider} />}

      {/* Type selector + repeat toggle */}
      <div class={styles.typeRow}>
        <select
          class={styles.typeSelect}
          value={config.type}
          onChange={(e) => handleTypeChange((e.target as HTMLSelectElement).value)}
        >
          {GRADIENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <label class={styles.repeatLabel}>
          <span>Repeat</span>
          <button
            class={`${inputStyles.toggle} ${config.repeating ? inputStyles.toggleOn : ''}`}
            onClick={handleRepeatToggle}
            type="button"
          >
            <span class={inputStyles.thumb} />
          </button>
        </label>
      </div>

      {/* Angle control for linear/conic */}
      {(config.type === 'linear' || config.type === 'conic') && (
        <div class={styles.controlRow}>
          <span class={styles.controlLabel}>Angle</span>
          <input
            class={inputStyles.slider}
            type="range"
            min={0}
            max={360}
            step={1}
            value={Math.round(config.angle)}
            onInput={handleAngleChange}
          />
          <input
            class={styles.angleInput}
            type="number"
            min={0}
            max={360}
            value={Math.round(config.angle)}
            onInput={handleAngleChange}
          />
          <span style={{ color: 'var(--cs-secondary-text)', fontSize: '11px' }}>°</span>
        </div>
      )}

      {/* Radial controls: shape + position */}
      {config.type === 'radial' && (
        <Fragment>
          <div class={styles.controlRow}>
            <span class={styles.controlLabel}>Shape</span>
            <select
              class={styles.typeSelect}
              value={config.shape.startsWith('circle') ? 'circle' : 'ellipse'}
              onChange={handleShapeChange}
            >
              <option value="circle">Circle</option>
              <option value="ellipse">Ellipse</option>
            </select>
          </div>
          <div class={styles.controlRow}>
            <span class={styles.controlLabel}>X</span>
            <input
              class={styles.controlInput}
              value={config.posX ?? '50%'}
              onBlur={handlePosXChange}
              onKeyDown={(e) => { if (e.key === 'Enter') handlePosXChange(e as any); }}
            />
          </div>
          <div class={styles.controlRow}>
            <span class={styles.controlLabel}>Y</span>
            <input
              class={styles.controlInput}
              value={config.posY ?? '50%'}
              onBlur={handlePosYChange}
              onKeyDown={(e) => { if (e.key === 'Enter') handlePosYChange(e as any); }}
            />
          </div>
        </Fragment>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   GradientInput — main exported component (swatch + text + picker)
   ══════════════════════════════════════════════════════════════ */

export interface GradientInputProps {
  label?: string;
  displayName?: string;
  value: string;
  mono?: boolean;
  onChange: (value: string) => void;
  onFocus?: () => void;
}

export function GradientInput({
  label,
  displayName,
  value,
  mono,
  onChange,
  onFocus,
}: GradientInputProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [config, setConfig] = useState<GradientConfig>(
    () => parseGradient(value) ?? createDefaultGradient(),
  );
  const [localText, setLocalText] = useState(value);
  const isEditingRef = useRef(false);
  const swatchRef = useRef<HTMLButtonElement>(null);
  const anchorRectRef = useRef<DOMRect | null>(null);

  // Sync from external value
  useEffect(() => {
    if (isEditingRef.current) return;
    const parsed = parseGradient(value);
    if (parsed) setConfig(parsed);
    setLocalText(value);
  }, [value]);

  const handleConfigChange = useCallback(
    (newConfig: GradientConfig) => {
      setConfig(newConfig);
      isEditingRef.current = true;
      const css = serializeGradient(newConfig);
      setLocalText(css);
      onChange(css);
    },
    [onChange],
  );

  const commitText = useCallback(
    (text: string) => {
      onChange(text);
      const parsed = parseGradient(text);
      if (parsed) setConfig(parsed);
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

  const displayLabel = displayName !== undefined ? displayName : label;
  const previewCss = isGradientValue(value) ? value : serializeGradient(config);

  return (
    <div class={inputStyles.row}>
      {displayLabel && (
        <label class={`${inputStyles.label} ${mono ? inputStyles.mono : ''}`}>
          {displayLabel}
        </label>
      )}
      <div class={styles.gradientGroup}>
        <button ref={swatchRef} class={styles.gradientSwatch} onClick={handleSwatchClick}>
          <span class={styles.gradientSwatchColor} style={{ background: previewCss }} />
        </button>
        <input
          type="text"
          class={styles.gradientText}
          value={localText}
          onInput={handleTextChange}
          onBlur={handleTextBlur}
          onKeyDown={handleTextKeyDown}
          onFocus={handleTextFocus}
        />
      </div>
      {pickerOpen && anchorRectRef.current && (
        <PopoverPanel anchorRect={anchorRectRef.current} onClose={handleClose}>
          <GradientPicker config={config} onChange={handleConfigChange} />
        </PopoverPanel>
      )}
    </div>
  );
}
