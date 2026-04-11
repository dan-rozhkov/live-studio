import { h, Fragment } from 'preact';
import {
  AlignStartHorizontal, AlignCenterHorizontal,
  AlignEndHorizontal, AlignHorizontalJustifyCenter,
  Underline, Strikethrough, RemoveFormatting,
} from 'lucide-preact';
import { NumberInput } from '../inputs/NumberInput';
import { TextInput } from '../inputs/TextInput';
import { SelectInput } from '../inputs/SelectInput';
import { ColorInput } from '../inputs/ColorInput';
import { IconToggleGroup } from '../inputs/IconToggleGroup';
import inputStyles from '../inputs/inputs.module.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FONT_WEIGHT_OPTIONS = [
  '100', '200', '300', '400', '500', '600', '700', '800', '900',
];

const TEXT_ALIGN_OPTIONS = [
  { value: 'left', icon: AlignStartHorizontal, title: 'Left' },
  { value: 'center', icon: AlignCenterHorizontal, title: 'Center' },
  { value: 'right', icon: AlignEndHorizontal, title: 'Right' },
  { value: 'justify', icon: AlignHorizontalJustifyCenter, title: 'Justify' },
];

const TEXT_DECORATION_OPTIONS = [
  { value: 'none', icon: RemoveFormatting, title: 'None' },
  { value: 'underline', icon: Underline, title: 'Underline' },
  { value: 'line-through', icon: Strikethrough, title: 'Strikethrough' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface TextSectionProps {
  getValue: (prop: string) => string;
  onChange: (prop: string, value: string) => void;
}

export function TextSection({ getValue, onChange }: TextSectionProps) {
  const textDecoration = getValue('text-decoration');
  // text-decoration can contain multiple keywords; pick first match
  const decoValue = textDecoration.includes('underline')
    ? 'underline'
    : textDecoration.includes('line-through')
      ? 'line-through'
      : 'none';

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

      <div class={inputStyles.row}>
        <label class={inputStyles.label}>Align</label>
        <IconToggleGroup
          options={TEXT_ALIGN_OPTIONS}
          value={getValue('text-align')}
          onChange={(v) => onChange('text-align', v)}
        />
      </div>

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

      <div class={inputStyles.row}>
        <label class={inputStyles.label}>Decoration</label>
        <IconToggleGroup
          options={TEXT_DECORATION_OPTIONS}
          value={decoValue}
          onChange={(v) => onChange('text-decoration', v)}
        />
      </div>
    </>
  );
}
