import { h, Fragment } from 'preact';
import { useState } from 'preact/hooks';
import {
  ArrowRight, ArrowDown, ArrowLeft, ArrowUp,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  StretchVertical, Baseline, Minus, ChevronRight,
} from 'lucide-preact';
import { NumberInput } from '../inputs/NumberInput';
import { SelectInput } from '../inputs/SelectInput';
import { PairedNumberInput } from '../inputs/PairedNumberInput';
import { IconToggleGroup } from '../inputs/IconToggleGroup';
import inputStyles from '../inputs/inputs.module.css';

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
  { value: 'auto', icon: Minus, title: 'Auto' },
  { value: 'stretch', icon: StretchVertical, title: 'Stretch' },
  { value: 'flex-start', icon: AlignStartVertical, title: 'Start' },
  { value: 'center', icon: AlignCenterVertical, title: 'Center' },
  { value: 'flex-end', icon: AlignEndVertical, title: 'End' },
  { value: 'baseline', icon: Baseline, title: 'Baseline' },
];

const FLEX_WRAP_OPTIONS = ['nowrap', 'wrap', 'wrap-reverse'];

const FLEX_DIRECTION_OPTIONS = [
  { value: 'row', icon: ArrowRight, title: 'Row' },
  { value: 'column', icon: ArrowDown, title: 'Column' },
  { value: 'row-reverse', icon: ArrowLeft, title: 'Row Reverse' },
  { value: 'column-reverse', icon: ArrowUp, title: 'Column Reverse' },
];

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
  const [expandMinMax, setExpandMinMax] = useState(false);

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

      {/* Flex direction toggles */}
      {isFlex && (
        <>
          <div class={inputStyles.subLabel}>Flow</div>
          <IconToggleGroup
            options={FLEX_DIRECTION_OPTIONS}
            value={getValue('flex-direction') || 'row'}
            onChange={(v) => onChange('flex-direction', v)}
          />
        </>
      )}

      {/* Dimensions */}
      <div class={inputStyles.subLabel}>Dimensions</div>
      <PairedNumberInput
        prefixA="W"
        prefixB="H"
        valueA={getValue('width')}
        valueB={getValue('height')}
        onChangeA={(v) => onChange('width', v)}
        onChangeB={(v) => onChange('height', v)}
        endContent={
          <button
            class={inputStyles.pairedEndIcon}
            title={expandMinMax ? 'Hide min/max' : 'Show min/max'}
            onClick={() => setExpandMinMax(!expandMinMax)}
          >
            <ChevronRight size={10} style={{ transform: expandMinMax ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
        }
      />

      {/* Min/Max */}
      {expandMinMax && (
        <>
          <PairedNumberInput
            prefixA="Min W"
            prefixB="Min H"
            valueA={getValue('min-width')}
            valueB={getValue('min-height')}
            onChangeA={(v) => onChange('min-width', v)}
            onChangeB={(v) => onChange('min-height', v)}
          />
          <PairedNumberInput
            prefixA="Max W"
            prefixB="Max H"
            valueA={getValue('max-width')}
            valueB={getValue('max-height')}
            onChangeA={(v) => onChange('max-width', v)}
            onChangeB={(v) => onChange('max-height', v)}
          />
        </>
      )}

      {/* Margin */}
      <div class={inputStyles.subLabel}>Margin</div>
      <PairedNumberInput
        prefixA="T"
        prefixB="B"
        valueA={getValue('margin-top')}
        valueB={getValue('margin-bottom')}
        onChangeA={(v) => onChange('margin-top', v)}
        onChangeB={(v) => onChange('margin-bottom', v)}
      />
      <PairedNumberInput
        prefixA="L"
        prefixB="R"
        valueA={getValue('margin-left')}
        valueB={getValue('margin-right')}
        onChangeA={(v) => onChange('margin-left', v)}
        onChangeB={(v) => onChange('margin-right', v)}
      />

      {/* Padding */}
      <div class={inputStyles.subLabel}>Padding</div>
      <PairedNumberInput
        prefixA="T"
        prefixB="B"
        valueA={getValue('padding-top')}
        valueB={getValue('padding-bottom')}
        onChangeA={(v) => onChange('padding-top', v)}
        onChangeB={(v) => onChange('padding-bottom', v)}
      />
      <PairedNumberInput
        prefixA="L"
        prefixB="R"
        valueA={getValue('padding-left')}
        valueB={getValue('padding-right')}
        onChangeA={(v) => onChange('padding-left', v)}
        onChangeB={(v) => onChange('padding-right', v)}
      />

      {/* Flex container properties */}
      {isFlex && (
        <>
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
          <div class={inputStyles.row}>
            <label class={inputStyles.label}>Align Self</label>
            <IconToggleGroup
              options={ALIGN_SELF_OPTIONS}
              value={getValue('align-self') || 'auto'}
              onChange={(v) => onChange('align-self', v)}
            />
          </div>
        </>
      )}
    </>
  );
}
