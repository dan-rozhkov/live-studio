import { h, Fragment } from 'preact';
import { NumberInput } from '../inputs/NumberInput';
import { SelectInput } from '../inputs/SelectInput';
import { ColorInput } from '../inputs/ColorInput';

const BORDER_STYLE_OPTIONS = [
  'none', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset',
];

export interface StrokeSectionProps {
  getValue: (prop: string) => string;
  onChange: (prop: string, value: string) => void;
}

export function StrokeSection({ getValue, onChange }: StrokeSectionProps) {
  return (
    <>
      <ColorInput
        label="border-color"
        displayName="Color"
        value={getValue('border-color')}
        onChange={(v) => onChange('border-color', v)}
      />
      <NumberInput
        label="border-width"
        displayName="Width"
        value={getValue('border-width')}
        min={0}
        max={20}
        step={1}
        unit="px"
        onChange={(v) => onChange('border-width', v)}
      />
      <SelectInput
        label="border-style"
        displayName="Style"
        value={getValue('border-style')}
        options={BORDER_STYLE_OPTIONS}
        onChange={(v) => onChange('border-style', v)}
      />
    </>
  );
}
