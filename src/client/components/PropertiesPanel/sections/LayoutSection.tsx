import { h, Fragment } from 'preact';
import { useState } from 'preact/hooks';
import {
  ArrowRight, ArrowDown, ArrowLeft, ArrowUp,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  StretchVertical, Baseline, Minus, ChevronRight, InspectionPanel,
} from 'lucide-preact';
import { NumberInput } from '../inputs/NumberInput';
import { SelectInput } from '../inputs/SelectInput';
import { PairedNumberInput, PairedField } from '../inputs/PairedNumberInput';
import { IconToggleGroup } from '../inputs/IconToggleGroup';
import inputStyles from '../inputs/inputs.module.css';

const DISPLAY_OPTIONS = [
  'block', 'flex', 'grid', 'inline', 'inline-block', 'inline-flex', 'inline-grid', 'none',
];

const POSITION_OPTIONS = ['static', 'relative', 'absolute', 'fixed', 'sticky'];

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

const JUSTIFY_VALUES = ['flex-start', 'center', 'flex-end'] as const;
const ALIGN_VALUES = ['flex-start', 'center', 'flex-end'] as const;

function normalizeFlexValue(v: string): 'flex-start' | 'center' | 'flex-end' {
  if (v === 'center') return 'center';
  if (v === 'flex-end' || v === 'end') return 'flex-end';
  return 'flex-start';
}

function AlignmentLines({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <line x1="2" y1="4" x2="12" y2="4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <line x1="2" y1="7" x2="10" y2="7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <line x1="2" y1="10" x2="8" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </svg>
  );
}

function AlignmentGrid({
  justifyContent,
  alignItems,
  onChange,
}: {
  justifyContent: string;
  alignItems: string;
  onChange: (justify: string, align: string) => void;
}) {
  const activeJ = normalizeFlexValue(justifyContent);
  const activeA = normalizeFlexValue(alignItems);

  return (
    <div class={inputStyles.alignmentGrid}>
      {ALIGN_VALUES.map((align) =>
        JUSTIFY_VALUES.map((justify) => {
          const isActive = justify === activeJ && align === activeA;
          return (
            <button
              key={`${justify}-${align}`}
              class={`${inputStyles.alignmentCell} ${isActive ? inputStyles.alignmentCellActive : ''}`}
              title={`${justify} / ${align}`}
              onClick={() => onChange(justify, align)}
            >
              {isActive ? <AlignmentLines /> : <span class={inputStyles.alignmentDot} />}
            </button>
          );
        })
      )}
    </div>
  );
}

function MarginHIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="0" y="3" width="1.5" height="8" rx="0.5" fill="currentColor" opacity="0.5" />
      <rect x="12.5" y="3" width="1.5" height="8" rx="0.5" fill="currentColor" opacity="0.5" />
      <line x1="4" y1="7" x2="10" y2="7" stroke="currentColor" stroke-width="1" stroke-dasharray="1.5 1.5" />
    </svg>
  );
}

function MarginVIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="3" y="0" width="8" height="1.5" rx="0.5" fill="currentColor" opacity="0.5" />
      <rect x="3" y="12.5" width="8" height="1.5" rx="0.5" fill="currentColor" opacity="0.5" />
      <line x1="7" y1="4" x2="7" y2="10" stroke="currentColor" stroke-width="1" stroke-dasharray="1.5 1.5" />
    </svg>
  );
}

function PaddingHIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="3" width="1.5" height="8" rx="0.5" fill="currentColor" />
      <rect x="11.5" y="3" width="1.5" height="8" rx="0.5" fill="currentColor" />
      <circle cx="7" cy="7" r="1.5" fill="currentColor" />
    </svg>
  );
}

function PaddingVIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="3" y="1" width="8" height="1.5" rx="0.5" fill="currentColor" />
      <rect x="3" y="11.5" width="8" height="1.5" rx="0.5" fill="currentColor" />
      <circle cx="7" cy="7" r="1.5" fill="currentColor" />
    </svg>
  );
}

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
  const [expandMargin, setExpandMargin] = useState(false);
  const [expandPadding, setExpandPadding] = useState(false);

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
      {!expandMargin ? (
        <div class={inputStyles.paddingCompactRow}>
          <PairedField
            startContent={<MarginHIcon />}
            value={getValue('margin-left')}
            onChange={(v) => {
              onChange('margin-left', v);
              onChange('margin-right', v);
            }}
          />
          <PairedField
            startContent={<MarginVIcon />}
            value={getValue('margin-top')}
            onChange={(v) => {
              onChange('margin-top', v);
              onChange('margin-bottom', v);
            }}
          />
          <button
            class={inputStyles.pairedEndIcon}
            title="Expand individual margin"
            onClick={() => setExpandMargin(true)}
          >
            <InspectionPanel size={10} />
          </button>
        </div>
      ) : (
        <>
          <PairedNumberInput
            prefixA="T"
            prefixB="B"
            valueA={getValue('margin-top')}
            valueB={getValue('margin-bottom')}
            onChangeA={(v) => onChange('margin-top', v)}
            onChangeB={(v) => onChange('margin-bottom', v)}
            endContent={<div style={{ width: 24, flexShrink: 0 }} />}
          />
          <PairedNumberInput
            prefixA="L"
            prefixB="R"
            valueA={getValue('margin-left')}
            valueB={getValue('margin-right')}
            onChangeA={(v) => onChange('margin-left', v)}
            onChangeB={(v) => onChange('margin-right', v)}
            endContent={
              <button
                class={inputStyles.pairedEndIcon}
                title="Collapse margin"
                onClick={() => setExpandMargin(false)}
              >
                <InspectionPanel size={10} />
              </button>
            }
          />
        </>
      )}

      {/* Alignment grid + Gap (flex/grid) */}
      {(isFlex || isGrid) && (
        <div class={inputStyles.alignGapRow}>
          <div class={inputStyles.alignGapCol}>
            <div class={inputStyles.subLabel}>Alignment</div>
            <AlignmentGrid
              justifyContent={getValue('justify-content') || 'flex-start'}
              alignItems={getValue('align-items') || 'stretch'}
              onChange={(j, a) => {
                onChange('justify-content', j);
                onChange('align-items', a);
              }}
            />
          </div>
          <div class={inputStyles.alignGapCol}>
            <div class={inputStyles.labelAboveLabel}>Gap</div>
            <NumberInput
              label="gap"
              displayName=""
              value={getValue('gap')}
              onChange={(v) => onChange('gap', v)}
              showSlider={false}
            />
            {isFlex && (
              <>
                <div class={inputStyles.labelAboveLabel}>Wrap</div>
                <SelectInput
                  label="flex-wrap"
                  displayName=""
                  value={getValue('flex-wrap') || 'nowrap'}
                  options={FLEX_WRAP_OPTIONS}
                  onChange={(v) => onChange('flex-wrap', v)}
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* Padding */}
      <div class={inputStyles.subLabel}>Padding</div>
      {!expandPadding ? (
        <div class={inputStyles.paddingCompactRow}>
          <PairedField
            startContent={<PaddingHIcon />}
            value={getValue('padding-left')}
            onChange={(v) => {
              onChange('padding-left', v);
              onChange('padding-right', v);
            }}
          />
          <PairedField
            startContent={<PaddingVIcon />}
            value={getValue('padding-top')}
            onChange={(v) => {
              onChange('padding-top', v);
              onChange('padding-bottom', v);
            }}
          />
          <button
            class={inputStyles.pairedEndIcon}
            title="Expand individual padding"
            onClick={() => setExpandPadding(true)}
          >
            <InspectionPanel size={10} />
          </button>
        </div>
      ) : (
        <>
          <PairedNumberInput
            prefixA="T"
            prefixB="B"
            valueA={getValue('padding-top')}
            valueB={getValue('padding-bottom')}
            onChangeA={(v) => onChange('padding-top', v)}
            onChangeB={(v) => onChange('padding-bottom', v)}
            endContent={<div style={{ width: 24, flexShrink: 0 }} />}
          />
          <PairedNumberInput
            prefixA="L"
            prefixB="R"
            valueA={getValue('padding-left')}
            valueB={getValue('padding-right')}
            onChangeA={(v) => onChange('padding-left', v)}
            onChangeB={(v) => onChange('padding-right', v)}
            endContent={
              <button
                class={inputStyles.pairedEndIcon}
                title="Collapse padding"
                onClick={() => setExpandPadding(false)}
              >
                <InspectionPanel size={10} />
              </button>
            }
          />
        </>
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
