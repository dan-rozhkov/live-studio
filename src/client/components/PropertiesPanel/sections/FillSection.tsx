import { h, Fragment } from 'preact';
import { useState, useCallback, useRef } from 'preact/hooks';
import { Eye, EyeOff, Minus } from 'lucide-preact';
import { ColorInput } from '../inputs/ColorInput';
import inputStyles from '../inputs/inputs.module.css';

export interface FillSectionProps {
  getValue: (prop: string) => string;
  onChange: (prop: string, value: string) => void;
}

export function FillSection({ getValue, onChange }: FillSectionProps) {
  const value = getValue('background-color');
  const [visible, setVisible] = useState(true);
  const prevValueRef = useRef<string | null>(null);

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

  return (
    <div class={inputStyles.compactColorRow}>
      <ColorInput
        label="background-color"
        displayName=""
        value={value}
        onChange={(v) => onChange('background-color', v)}
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
