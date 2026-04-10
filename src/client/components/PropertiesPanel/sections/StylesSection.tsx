import { h, Fragment } from 'preact';
import { NumberInput } from '../inputs/NumberInput';
import { TextInput } from '../inputs/TextInput';
import { SelectInput } from '../inputs/SelectInput';
import { ColorInput } from '../inputs/ColorInput';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BORDER_STYLE_OPTIONS = [
  'none', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset',
];

const OVERFLOW_OPTIONS = ['visible', 'hidden', 'scroll', 'auto', 'clip'];

const CURSOR_OPTIONS = [
  'auto', 'default', 'pointer', 'move', 'text', 'wait', 'help',
  'crosshair', 'not-allowed', 'grab', 'grabbing',
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface StylesSectionProps {
  getValue: (prop: string) => string;
  onChange: (prop: string, value: string) => void;
}

export function StylesSection({ getValue, onChange }: StylesSectionProps) {
  return (
    <>
      {/* Background */}
      <ColorInput
        label="background-color"
        displayName="Background"
        value={getValue('background-color')}
        onChange={(v) => onChange('background-color', v)}
      />

      {/* Border */}
      <NumberInput
        label="border-width"
        displayName="Border W"
        value={getValue('border-width')}
        min={0}
        max={20}
        step={1}
        unit="px"
        onChange={(v) => onChange('border-width', v)}
      />
      <SelectInput
        label="border-style"
        displayName="Border S"
        value={getValue('border-style')}
        options={BORDER_STYLE_OPTIONS}
        onChange={(v) => onChange('border-style', v)}
      />
      <ColorInput
        label="border-color"
        displayName="Border C"
        value={getValue('border-color')}
        onChange={(v) => onChange('border-color', v)}
      />

      {/* Border Radius — 4 corners */}
      <NumberInput
        label="border-top-left-radius"
        displayName="Radius TL"
        value={getValue('border-top-left-radius')}
        onChange={(v) => onChange('border-top-left-radius', v)}
      />
      <NumberInput
        label="border-top-right-radius"
        displayName="Radius TR"
        value={getValue('border-top-right-radius')}
        onChange={(v) => onChange('border-top-right-radius', v)}
      />
      <NumberInput
        label="border-bottom-right-radius"
        displayName="Radius BR"
        value={getValue('border-bottom-right-radius')}
        onChange={(v) => onChange('border-bottom-right-radius', v)}
      />
      <NumberInput
        label="border-bottom-left-radius"
        displayName="Radius BL"
        value={getValue('border-bottom-left-radius')}
        onChange={(v) => onChange('border-bottom-left-radius', v)}
      />

      {/* Opacity */}
      <NumberInput
        label="opacity"
        displayName="Opacity"
        value={getValue('opacity')}
        min={0}
        max={1}
        step={0.01}
        unit=""
        onChange={(v) => onChange('opacity', v)}
      />

      {/* Overflow */}
      <SelectInput
        label="overflow"
        displayName="Overflow"
        value={getValue('overflow')}
        options={OVERFLOW_OPTIONS}
        onChange={(v) => onChange('overflow', v)}
      />

      {/* Box Shadow */}
      <TextInput
        label="box-shadow"
        displayName="Shadow"
        value={getValue('box-shadow')}
        onChange={(v) => onChange('box-shadow', v)}
      />

      {/* Cursor */}
      <SelectInput
        label="cursor"
        displayName="Cursor"
        value={getValue('cursor')}
        options={CURSOR_OPTIONS}
        onChange={(v) => onChange('cursor', v)}
      />
    </>
  );
}
