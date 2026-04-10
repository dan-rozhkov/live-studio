import { h, Fragment } from 'preact';
import { NumberInput } from '../inputs/NumberInput';
import { TextInput } from '../inputs/TextInput';
import { SelectInput } from '../inputs/SelectInput';
import { ColorInput } from '../inputs/ColorInput';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FONT_WEIGHT_OPTIONS = [
  '100', '200', '300', '400', '500', '600', '700', '800', '900',
];

const TEXT_ALIGN_OPTIONS = ['left', 'center', 'right', 'justify'];

const TEXT_DECORATION_OPTIONS = [
  'none', 'underline', 'overline', 'line-through',
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface TextSectionProps {
  getValue: (prop: string) => string;
  onChange: (prop: string, value: string) => void;
}

export function TextSection({ getValue, onChange }: TextSectionProps) {
  return (
    <>
      <TextInput
        label="font-family"
        displayName="Font"
        value={getValue('font-family')}
        onChange={(v) => onChange('font-family', v)}
      />
      <NumberInput
        label="font-size"
        displayName="Size"
        value={getValue('font-size')}
        onChange={(v) => onChange('font-size', v)}
      />
      <SelectInput
        label="font-weight"
        displayName="Weight"
        value={getValue('font-weight')}
        options={FONT_WEIGHT_OPTIONS}
        onChange={(v) => onChange('font-weight', v)}
      />
      <ColorInput
        label="color"
        displayName="Color"
        value={getValue('color')}
        onChange={(v) => onChange('color', v)}
      />
      <SelectInput
        label="text-align"
        displayName="Align"
        value={getValue('text-align')}
        options={TEXT_ALIGN_OPTIONS}
        onChange={(v) => onChange('text-align', v)}
      />
      <NumberInput
        label="line-height"
        displayName="Line Height"
        value={getValue('line-height')}
        onChange={(v) => onChange('line-height', v)}
      />
      <NumberInput
        label="letter-spacing"
        displayName="Spacing"
        value={getValue('letter-spacing')}
        onChange={(v) => onChange('letter-spacing', v)}
      />
      <SelectInput
        label="text-decoration"
        displayName="Decoration"
        value={getValue('text-decoration')}
        options={TEXT_DECORATION_OPTIONS}
        onChange={(v) => onChange('text-decoration', v)}
      />
    </>
  );
}
