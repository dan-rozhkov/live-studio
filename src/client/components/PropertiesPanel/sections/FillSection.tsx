import { h, Fragment } from 'preact';
import { useState, useCallback, useRef } from 'preact/hooks';
import { Eye, EyeOff, Minus } from 'lucide-preact';
import { ColorInput } from '../inputs/ColorInput';
import {
  GradientInput,
  isGradientValue,
  parseGradient,
  serializeGradient,
  createDefaultGradient,
} from '../inputs/GradientInput';
import { VariablePicker } from '../inputs/VariablePicker';
import inputStyles from '../inputs/inputs.module.css';

export interface FillSectionProps {
  getValue: (prop: string) => string;
  onChange: (prop: string, value: string) => void;
}

type FillType = 'solid' | 'gradient';

export function FillSection({ getValue, onChange }: FillSectionProps) {
  const bgColor = getValue('background-color');
  const bgImage = getValue('background-image');

  const fillType: FillType = isGradientValue(bgImage) ? 'gradient' : 'solid';

  const [visible, setVisible] = useState(true);
  const prevSolidRef = useRef<string | null>(null);
  const prevGradientRef = useRef<string | null>(null);

  const switchToGradient = useCallback(() => {
    const base = bgColor && bgColor !== 'transparent' ? bgColor : '#6366f1';
    const gradient = serializeGradient(createDefaultGradient(base));
    onChange('background-image', gradient);
  }, [bgColor, onChange]);

  const switchToSolid = useCallback(() => {
    const parsed = parseGradient(bgImage);
    const firstColor = parsed?.stops[0]?.color;
    if (firstColor) onChange('background-color', firstColor);
    onChange('background-image', 'none');
  }, [bgImage, onChange]);

  const handleSelectType = useCallback(
    (next: FillType) => {
      if (next === fillType) return;
      if (next === 'gradient') switchToGradient();
      else switchToSolid();
    },
    [fillType, switchToGradient, switchToSolid],
  );

  const handleToggleVisibility = useCallback(() => {
    if (fillType === 'solid') {
      if (visible) {
        prevSolidRef.current = bgColor;
        onChange('background-color', 'transparent');
      } else if (prevSolidRef.current) {
        onChange('background-color', prevSolidRef.current);
      }
    } else {
      if (visible) {
        prevGradientRef.current = bgImage;
        onChange('background-image', 'none');
      } else if (prevGradientRef.current) {
        onChange('background-image', prevGradientRef.current);
      }
    }
    setVisible(!visible);
  }, [fillType, visible, bgColor, bgImage, onChange]);

  const handleRemove = useCallback(() => {
    if (fillType === 'solid') {
      onChange('background-color', 'transparent');
    } else {
      onChange('background-image', 'none');
    }
  }, [fillType, onChange]);

  return (
    <Fragment>
      <div class={inputStyles.iconToggleGroup} style={{ marginBottom: 6 }}>
        <button
          type="button"
          class={`${inputStyles.iconToggleBtn} ${fillType === 'solid' ? inputStyles.iconToggleBtnActive : ''}`}
          style={{ fontSize: 11 }}
          onClick={() => handleSelectType('solid')}
        >
          Solid
        </button>
        <button
          type="button"
          class={`${inputStyles.iconToggleBtn} ${fillType === 'gradient' ? inputStyles.iconToggleBtnActive : ''}`}
          style={{ fontSize: 11 }}
          onClick={() => handleSelectType('gradient')}
        >
          Gradient
        </button>
      </div>
      <div class={inputStyles.compactColorRow}>
        {fillType === 'solid' ? (
          <ColorInput
            label="background-color"
            displayName=""
            value={bgColor}
            onChange={(v) => onChange('background-color', v)}
            endContent={<VariablePicker value={bgColor} onChange={(v) => onChange('background-color', v)} filter="color" />}
          />
        ) : (
          <GradientInput
            label="background-image"
            displayName=""
            value={bgImage}
            onChange={(v) => onChange('background-image', v)}
          />
        )}
        <button class={inputStyles.compactColorAction} onClick={handleToggleVisibility} title="Toggle visibility">
          {visible ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
        <button class={inputStyles.compactColorAction} onClick={handleRemove} title="Remove fill">
          <Minus size={14} />
        </button>
      </div>
    </Fragment>
  );
}
