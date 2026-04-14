import { h, Fragment } from 'preact';
import { NumberInput } from '../inputs/NumberInput';
import { SelectInput } from '../inputs/SelectInput';
import { ColorInput } from '../inputs/ColorInput';
import { VariablePicker } from '../inputs/VariablePicker';

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
        endContent={<VariablePicker value={getValue('border-color')} onChange={(v) => onChange('border-color', v)} filter="color" />}
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
        endContent={<VariablePicker value={getValue('border-width')} onChange={(v) => onChange('border-width', v)} filter="number" />}
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
