import { h, Fragment } from 'preact';
import { useState, useCallback, useEffect, useRef } from 'preact/hooks';
import type { JSX } from 'preact';
import { Eye, EyeOff, Minus } from 'lucide-preact';
import { parseCssColor, hsvaToRgba, formatColor, type HSVA } from '../inputs/ColorInput';
import inputStyles from '../inputs/inputs.module.css';
import colorStyles from '../inputs/ColorInput.module.css';

export interface FillSectionProps {
  getValue: (prop: string) => string;
  onChange: (prop: string, value: string) => void;
}

function hexFromColor(value: string): string {
  const parsed = parseCssColor(value);
  if (!parsed) return '';
  const rgba = hsvaToRgba(parsed);
  const r = rgba.r.toString(16).padStart(2, '0');
  const g = rgba.g.toString(16).padStart(2, '0');
  const b = rgba.b.toString(16).padStart(2, '0');
  return `${r}${g}${b}`.toUpperCase();
}

function opacityFromColor(value: string): number {
  const parsed = parseCssColor(value);
  if (!parsed) return 100;
  return Math.round(parsed.a * 100);
}

export function FillSection({ getValue, onChange }: FillSectionProps) {
  const value = getValue('background-color');
  const [visible, setVisible] = useState(true);
  const [hexLocal, setHexLocal] = useState(() => hexFromColor(value));
  const [opacityLocal, setOpacityLocal] = useState(() => String(opacityFromColor(value)));
  const prevValueRef = useRef<string | null>(null);

  useEffect(() => {
    setHexLocal(hexFromColor(value));
    setOpacityLocal(String(opacityFromColor(value)));
  }, [value]);

  const handleHexBlur = useCallback(() => {
    const hex = hexLocal.replace(/^#/, '');
    if (/^[0-9a-fA-F]{3,8}$/.test(hex)) {
      const full = hex.length === 3
        ? hex.split('').map((c) => c + c).join('')
        : hex;
      const opacity = opacityFromColor(value);
      if (opacity < 100) {
        const a = Math.round((opacity / 100) * 255).toString(16).padStart(2, '0');
        onChange('background-color', `#${full}${a}`);
      } else {
        onChange('background-color', `#${full}`);
      }
    }
  }, [hexLocal, value, onChange]);

  const handleOpacityBlur = useCallback(() => {
    const num = parseInt(opacityLocal, 10);
    if (isNaN(num)) return;
    const clamped = Math.max(0, Math.min(100, num));
    const parsed = parseCssColor(value);
    if (parsed) {
      const newHsva: HSVA = { ...parsed, a: clamped / 100 };
      onChange('background-color', formatColor(newHsva, 'hex'));
    }
  }, [opacityLocal, value, onChange]);

  const handleToggleVisibility = useCallback(() => {
    if (visible) {
      prevValueRef.current = value;
      onChange('background-color', 'transparent');
    } else if (prevValueRef.current) {
      onChange('background-color', prevValueRef.current);
    }
    setVisible(!visible);
  }, [visible, value, onChange]);

  const handleRemove = useCallback(() => {
    onChange('background-color', 'transparent');
  }, [onChange]);

  const parsed = parseCssColor(value);
  const swatchRgba = parsed ? hsvaToRgba(parsed) : null;
  const swatchStyle = swatchRgba
    ? { backgroundColor: `rgba(${swatchRgba.r},${swatchRgba.g},${swatchRgba.b},${swatchRgba.a})` }
    : undefined;

  return (
    <div class={inputStyles.compactColorRow}>
      <div class={colorStyles.swatchWrapper} style={{ width: '18px', height: '18px' }}>
        <button
          class={colorStyles.swatchButton}
          style={{ width: '18px', height: '18px' }}
        >
          <span class={colorStyles.swatchColor} style={swatchStyle} />
        </button>
      </div>
      <input
        type="text"
        class={inputStyles.compactColorHex}
        value={hexLocal}
        onInput={(e: JSX.TargetedEvent<HTMLInputElement>) =>
          setHexLocal((e.target as HTMLInputElement).value)
        }
        onBlur={handleHexBlur}
        onKeyDown={(e: JSX.TargetedKeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') handleHexBlur();
        }}
      />
      <input
        type="text"
        class={inputStyles.compactColorOpacity}
        value={`${opacityLocal} %`}
        onFocus={(e: JSX.TargetedEvent<HTMLInputElement>) => {
          (e.target as HTMLInputElement).value = opacityLocal;
        }}
        onInput={(e: JSX.TargetedEvent<HTMLInputElement>) =>
          setOpacityLocal((e.target as HTMLInputElement).value.replace(/[^0-9]/g, ''))
        }
        onBlur={handleOpacityBlur}
        onKeyDown={(e: JSX.TargetedKeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') handleOpacityBlur();
        }}
      />
      <button class={inputStyles.compactColorAction} onClick={handleToggleVisibility} title="Toggle visibility">
        {visible ? <Eye size={14} /> : <EyeOff size={14} />}
      </button>
      <button class={inputStyles.compactColorAction} onClick={handleRemove} title="Remove fill">
        <Minus size={14} />
      </button>
    </div>
  );
}
