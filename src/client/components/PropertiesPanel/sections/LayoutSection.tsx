import { h, Fragment } from 'preact';
import { NumberInput } from '../inputs/NumberInput';
import { SelectInput } from '../inputs/SelectInput';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DISPLAY_OPTIONS = [
  'block', 'flex', 'grid', 'inline', 'inline-block', 'inline-flex', 'inline-grid', 'none',
];

const POSITION_OPTIONS = ['static', 'relative', 'absolute', 'fixed', 'sticky'];

const JUSTIFY_OPTIONS = [
  'flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly',
];

const ALIGN_ITEMS_OPTIONS = [
  'stretch', 'flex-start', 'center', 'flex-end', 'baseline',
];

const ALIGN_SELF_OPTIONS = [
  'auto', 'stretch', 'flex-start', 'center', 'flex-end', 'baseline',
];

const FLEX_WRAP_OPTIONS = ['nowrap', 'wrap', 'wrap-reverse'];

const FLEX_DIRECTION_OPTIONS = ['row', 'column', 'row-reverse', 'column-reverse'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface LayoutSectionProps {
  getValue: (prop: string) => string;
  onChange: (prop: string, value: string) => void;
  parentDisplay: string;
}

export function LayoutSection({ getValue, onChange, parentDisplay }: LayoutSectionProps) {
  const display = getValue('display');
  const position = getValue('position');
  const isFlex = display === 'flex' || display === 'inline-flex';
  const isGrid = display === 'grid' || display === 'inline-grid';
  const showGap = isFlex || isGrid;
  const isFlexChild = parentDisplay === 'flex' || parentDisplay === 'inline-flex';

  return (
    <>
      {/* Display & Position */}
      <SelectInput
        label="display"
        displayName="Display"
        value={display}
        options={DISPLAY_OPTIONS}
        onChange={(v) => onChange('display', v)}
      />
      <SelectInput
        label="position"
        displayName="Position"
        value={position}
        options={POSITION_OPTIONS}
        onChange={(v) => onChange('position', v)}
      />

      {/* Sizing */}
      <NumberInput
        label="width"
        displayName="Width"
        value={getValue('width')}
        onChange={(v) => onChange('width', v)}
      />
      <NumberInput
        label="height"
        displayName="Height"
        value={getValue('height')}
        onChange={(v) => onChange('height', v)}
      />
      <NumberInput
        label="min-width"
        displayName="Min W"
        value={getValue('min-width')}
        onChange={(v) => onChange('min-width', v)}
        showSlider={false}
      />
      <NumberInput
        label="min-height"
        displayName="Min H"
        value={getValue('min-height')}
        onChange={(v) => onChange('min-height', v)}
        showSlider={false}
      />
      <NumberInput
        label="max-width"
        displayName="Max W"
        value={getValue('max-width')}
        onChange={(v) => onChange('max-width', v)}
        showSlider={false}
      />
      <NumberInput
        label="max-height"
        displayName="Max H"
        value={getValue('max-height')}
        onChange={(v) => onChange('max-height', v)}
        showSlider={false}
      />

      {/* Margin */}
      <NumberInput
        label="margin-top"
        displayName="Margin T"
        value={getValue('margin-top')}
        onChange={(v) => onChange('margin-top', v)}
      />
      <NumberInput
        label="margin-right"
        displayName="Margin R"
        value={getValue('margin-right')}
        onChange={(v) => onChange('margin-right', v)}
      />
      <NumberInput
        label="margin-bottom"
        displayName="Margin B"
        value={getValue('margin-bottom')}
        onChange={(v) => onChange('margin-bottom', v)}
      />
      <NumberInput
        label="margin-left"
        displayName="Margin L"
        value={getValue('margin-left')}
        onChange={(v) => onChange('margin-left', v)}
      />

      {/* Padding */}
      <NumberInput
        label="padding-top"
        displayName="Padding T"
        value={getValue('padding-top')}
        onChange={(v) => onChange('padding-top', v)}
      />
      <NumberInput
        label="padding-right"
        displayName="Padding R"
        value={getValue('padding-right')}
        onChange={(v) => onChange('padding-right', v)}
      />
      <NumberInput
        label="padding-bottom"
        displayName="Padding B"
        value={getValue('padding-bottom')}
        onChange={(v) => onChange('padding-bottom', v)}
      />
      <NumberInput
        label="padding-left"
        displayName="Padding L"
        value={getValue('padding-left')}
        onChange={(v) => onChange('padding-left', v)}
      />

      {/* Flex container properties */}
      {isFlex && (
        <>
          <SelectInput
            label="flex-direction"
            displayName="Direction"
            value={getValue('flex-direction') || 'row'}
            options={FLEX_DIRECTION_OPTIONS}
            onChange={(v) => onChange('flex-direction', v)}
          />
          <SelectInput
            label="justify-content"
            displayName="Justify"
            value={getValue('justify-content')}
            options={JUSTIFY_OPTIONS}
            onChange={(v) => onChange('justify-content', v)}
          />
          <SelectInput
            label="align-items"
            displayName="Align"
            value={getValue('align-items') || 'stretch'}
            options={ALIGN_ITEMS_OPTIONS}
            onChange={(v) => onChange('align-items', v)}
          />
          <SelectInput
            label="flex-wrap"
            displayName="Wrap"
            value={getValue('flex-wrap') || 'nowrap'}
            options={FLEX_WRAP_OPTIONS}
            onChange={(v) => onChange('flex-wrap', v)}
          />
        </>
      )}

      {/* Gap (flex/grid) */}
      {showGap && (
        <NumberInput
          label="gap"
          displayName="Gap"
          value={getValue('gap')}
          onChange={(v) => onChange('gap', v)}
        />
      )}

      {/* Flex child properties */}
      {isFlexChild && (
        <>
          <NumberInput
            label="flex-grow"
            displayName="Grow"
            value={getValue('flex-grow')}
            min={0}
            max={10}
            step={1}
            unit=""
            onChange={(v) => onChange('flex-grow', v)}
          />
          <NumberInput
            label="flex-shrink"
            displayName="Shrink"
            value={getValue('flex-shrink')}
            min={0}
            max={10}
            step={1}
            unit=""
            onChange={(v) => onChange('flex-shrink', v)}
          />
          <NumberInput
            label="flex-basis"
            displayName="Basis"
            value={getValue('flex-basis')}
            onChange={(v) => onChange('flex-basis', v)}
            showSlider={false}
          />
          <SelectInput
            label="align-self"
            displayName="Align Self"
            value={getValue('align-self') || 'auto'}
            options={ALIGN_SELF_OPTIONS}
            onChange={(v) => onChange('align-self', v)}
          />
        </>
      )}
    </>
  );
}
