import { h, Fragment } from 'preact';
import { TextInput } from '../inputs/TextInput';
import { SelectInput } from '../inputs/SelectInput';
import { VariablePicker } from '../inputs/VariablePicker';

const CURSOR_OPTIONS = [
  'auto', 'default', 'pointer', 'move', 'text', 'wait', 'help',
  'crosshair', 'not-allowed', 'grab', 'grabbing',
];

const OVERFLOW_OPTIONS = ['visible', 'hidden', 'scroll', 'auto', 'clip'];

export interface EffectsSectionProps {
  getValue: (prop: string) => string;
  onChange: (prop: string, value: string) => void;
}

export function EffectsSection({ getValue, onChange }: EffectsSectionProps) {
  return (
    <>
      <TextInput
        label="box-shadow"
        displayName="Shadow"
        value={getValue('box-shadow')}
        onChange={(v) => onChange('box-shadow', v)}
        endContent={<VariablePicker value={getValue('box-shadow')} onChange={(v) => onChange('box-shadow', v)} />}
      />
      <SelectInput
        label="cursor"
        displayName="Cursor"
        value={getValue('cursor')}
        options={CURSOR_OPTIONS}
        onChange={(v) => onChange('cursor', v)}
      />
      <SelectInput
        label="overflow"
        displayName="Overflow"
        value={getValue('overflow')}
        options={OVERFLOW_OPTIONS}
        onChange={(v) => onChange('overflow', v)}
      />
    </>
  );
}
