import { h, Fragment } from 'preact';
import { useMemo, useCallback } from 'preact/hooks';
import { NumberInput, TRANSLATE_UNITS } from '../inputs/NumberInput';

// ---------------------------------------------------------------------------
// Transform parsing utilities
// ---------------------------------------------------------------------------

interface TransformFn {
  name: string;
  args: string;
}

function parseTransformFunctions(value: string): TransformFn[] {
  if (!value || value === 'none') return [];
  const fns: TransformFn[] = [];
  let i = 0;
  while (i < value.length) {
    while (i < value.length && /\s/.test(value[i])) i++;
    if (i >= value.length) break;
    const nameStart = i;
    while (i < value.length && /[\w-]/.test(value[i])) i++;
    const name = value.slice(nameStart, i);
    if (!name) break;
    while (i < value.length && /\s/.test(value[i])) i++;
    if (value[i] !== '(') break;
    i++;
    let depth = 1;
    const argsStart = i;
    while (i < value.length && depth > 0) {
      if (value[i] === '(') depth++;
      else if (value[i] === ')') depth--;
      if (depth > 0) i++;
    }
    fns.push({ name, args: value.slice(argsStart, i).trim() });
    i++;
  }
  return fns;
}

function hasMatrixTransform(value: string): boolean {
  return /matrix3?d?\s*\(/.test(value);
}

function extractTranslateXY(fns: TransformFn[]): { x: string; y: string } {
  let x = '';
  let y = '';
  for (const fn of fns) {
    if (fn.name === 'translate') {
      const parts = fn.args.split(',').map((s) => s.trim());
      x = parts[0] || '';
      y = parts[1] || '';
    } else if (fn.name === 'translateX') {
      x = fn.args;
    } else if (fn.name === 'translateY') {
      y = fn.args;
    }
  }
  return { x, y };
}

function extractTransformValue(fns: TransformFn[], name: string): string {
  return fns.find((f) => f.name === name)?.args ?? '';
}

function extractScaleXY(fns: TransformFn[]): { sx: string; sy: string } {
  let sx = '';
  let sy = '';
  for (const fn of fns) {
    if (fn.name === 'scale') {
      const parts = fn.args.split(',').map((s) => s.trim());
      sx = parts[0] || '';
      sy = parts[1] || sx;
    } else if (fn.name === 'scaleX') {
      sx = fn.args;
    } else if (fn.name === 'scaleY') {
      sy = fn.args;
    }
  }
  return { sx, sy };
}

const HANDLED = new Set([
  'translateX', 'translateY', 'translate',
  'rotate', 'scaleX', 'scaleY', 'scale',
  'skewX', 'skewY',
]);

function getOtherFunctions(fns: TransformFn[]): TransformFn[] {
  return fns.filter((f) => !HANDLED.has(f.name));
}

function isZeroValue(value: string): boolean {
  if (!value) return true;
  const match = value.match(/^(-?[\d.]+)/);
  return match ? parseFloat(match[1]) === 0 : false;
}

function isOneValue(value: string): boolean {
  if (!value) return true;
  const match = value.match(/^(-?[\d.]+)/);
  return match ? parseFloat(match[1]) === 1 : false;
}

interface TransformValues {
  translateX: string;
  translateY: string;
  rotate: string;
  scaleX: string;
  scaleY: string;
  skewX: string;
  skewY: string;
  other: TransformFn[];
}

function composeTransform(values: TransformValues): string {
  const parts: string[] = [];
  if (!isZeroValue(values.translateX)) parts.push(`translateX(${values.translateX})`);
  if (!isZeroValue(values.translateY)) parts.push(`translateY(${values.translateY})`);
  if (!isZeroValue(values.rotate)) parts.push(`rotate(${values.rotate})`);
  if (!isOneValue(values.scaleX)) parts.push(`scaleX(${values.scaleX})`);
  if (!isOneValue(values.scaleY)) parts.push(`scaleY(${values.scaleY})`);
  if (!isZeroValue(values.skewX)) parts.push(`skewX(${values.skewX})`);
  if (!isZeroValue(values.skewY)) parts.push(`skewY(${values.skewY})`);
  for (const fn of values.other) {
    parts.push(`${fn.name}(${fn.args})`);
  }
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface TransformSectionProps {
  getValue: (prop: string) => string;
  onChange: (prop: string, value: string) => void;
}

export function TransformSection({ getValue, onChange }: TransformSectionProps) {
  const transformValue = getValue('transform');
  const isMatrix = hasMatrixTransform(transformValue);

  const parsed = useMemo(
    () => (isMatrix ? [] : parseTransformFunctions(transformValue)),
    [transformValue, isMatrix],
  );

  const { x, y } = useMemo(() => extractTranslateXY(parsed), [parsed]);
  const rotateValue = extractTransformValue(parsed, 'rotate');
  const { sx: scaleXValue, sy: scaleYValue } = useMemo(() => extractScaleXY(parsed), [parsed]);
  const skewXValue = extractTransformValue(parsed, 'skewX');
  const skewYValue = extractTransformValue(parsed, 'skewY');
  const otherFunctions = useMemo(() => getOtherFunctions(parsed), [parsed]);

  const currentTransform = useMemo<TransformValues>(
    () => ({
      translateX: x,
      translateY: y,
      rotate: rotateValue,
      scaleX: scaleXValue,
      scaleY: scaleYValue,
      skewX: skewXValue,
      skewY: skewYValue,
      other: otherFunctions,
    }),
    [x, y, rotateValue, scaleXValue, scaleYValue, skewXValue, skewYValue, otherFunctions],
  );

  const handleChange = useCallback(
    (key: string, value: string) => {
      const next = { ...currentTransform };
      switch (key) {
        case 'x': next.translateX = value; break;
        case 'y': next.translateY = value; break;
        case 'rotate': next.rotate = value; break;
        case 'scaleX': next.scaleX = value; break;
        case 'scaleY': next.scaleY = value; break;
        case 'skewX': next.skewX = value; break;
        case 'skewY': next.skewY = value; break;
      }
      onChange('transform', composeTransform(next));
    },
    [currentTransform, onChange],
  );

  const handleReset = useCallback(() => {
    onChange('transform', '');
  }, [onChange]);

  // For matrix transforms, show raw value as read-only hint
  if (isMatrix) {
    return (
      <>
        <div style={{ padding: '4px 8px', fontSize: '11px', opacity: 0.6 }}>
          Matrix transform detected. Reset to edit individual values.
        </div>
        <button
          onClick={handleReset}
          style={{
            margin: '4px 8px',
            padding: '2px 8px',
            fontSize: '11px',
            cursor: 'pointer',
            background: 'transparent',
            border: '1px solid color-mix(in srgb, var(--cs-foreground) 20%, transparent)',
            borderRadius: '4px',
            color: 'var(--cs-foreground)',
          }}
        >
          Reset Transform
        </button>
      </>
    );
  }

  const hasAnyTransform =
    !isZeroValue(x) || !isZeroValue(y) ||
    !isZeroValue(rotateValue) ||
    !isOneValue(scaleXValue) || !isOneValue(scaleYValue) ||
    !isZeroValue(skewXValue) || !isZeroValue(skewYValue);

  return (
    <>
      {/* Translate */}
      <NumberInput
        displayName="X"
        value={x || '0px'}
        units={TRANSLATE_UNITS}
        onChange={(v) => handleChange('x', v)}
      />
      <NumberInput
        displayName="Y"
        value={y || '0px'}
        units={TRANSLATE_UNITS}
        onChange={(v) => handleChange('y', v)}
      />

      {/* Rotate */}
      <NumberInput
        displayName="Rotate"
        value={rotateValue || '0deg'}
        min={-360}
        max={360}
        sliderMin={-180}
        sliderMax={180}
        step={1}
        unit="deg"
        onChange={(v) => handleChange('rotate', v)}
      />

      {/* Scale */}
      <NumberInput
        displayName="Scale X"
        value={scaleXValue || '1'}
        min={0}
        max={10}
        sliderMin={0}
        sliderMax={3}
        step={0.01}
        unit=""
        onChange={(v) => handleChange('scaleX', v)}
      />
      <NumberInput
        displayName="Scale Y"
        value={scaleYValue || '1'}
        min={0}
        max={10}
        sliderMin={0}
        sliderMax={3}
        step={0.01}
        unit=""
        onChange={(v) => handleChange('scaleY', v)}
      />

      {/* Skew */}
      <NumberInput
        displayName="Skew X"
        value={skewXValue || '0deg'}
        min={-89}
        max={89}
        sliderMin={-45}
        sliderMax={45}
        step={1}
        unit="deg"
        onChange={(v) => handleChange('skewX', v)}
      />
      <NumberInput
        displayName="Skew Y"
        value={skewYValue || '0deg'}
        min={-89}
        max={89}
        sliderMin={-45}
        sliderMax={45}
        step={1}
        unit="deg"
        onChange={(v) => handleChange('skewY', v)}
      />

      {/* Reset button */}
      {hasAnyTransform && (
        <button
          onClick={handleReset}
          style={{
            margin: '4px 8px',
            padding: '2px 8px',
            fontSize: '11px',
            cursor: 'pointer',
            background: 'transparent',
            border: '1px solid color-mix(in srgb, var(--cs-foreground) 20%, transparent)',
            borderRadius: '4px',
            color: 'var(--cs-foreground)',
          }}
        >
          Reset Transform
        </button>
      )}
    </>
  );
}
