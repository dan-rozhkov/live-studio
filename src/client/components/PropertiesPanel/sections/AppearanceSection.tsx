import { h, Fragment } from 'preact';
import { useState } from 'preact/hooks';
import { ChevronRight } from 'lucide-preact';
import { NumberInput } from '../inputs/NumberInput';
import { VariablePicker } from '../inputs/VariablePicker';
import inputStyles from '../inputs/inputs.module.css';

export interface AppearanceSectionProps {
  getValue: (prop: string) => string;
  onChange: (prop: string, value: string) => void;
}

export function AppearanceSection({ getValue, onChange }: AppearanceSectionProps) {
  const [expandRadius, setExpandRadius] = useState(false);

  const opacityRaw = getValue('opacity');
  const opacityNum = parseFloat(opacityRaw) || 1;
  const opacityPercent = `${Math.round(opacityNum * 100)}%`;

  return (
    <>
      <div class={inputStyles.labelAboveRow}>
        <div class={inputStyles.labelAboveCell}>
          <span class={inputStyles.labelAboveLabel}>Opacity</span>
          <NumberInput
            label="opacity"
            displayName=""
            value={opacityRaw}
            min={0}
            max={1}
            step={0.01}
            unit=""
            showSlider={false}
            onChange={(v) => onChange('opacity', v)}
            endContent={<VariablePicker value={opacityRaw} onChange={(v) => onChange('opacity', v)} filter="number" />}
          />
        </div>
        <div class={inputStyles.labelAboveCell}>
          <span class={inputStyles.labelAboveLabel}>Corner radius</span>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <NumberInput
              label="border-radius"
              displayName=""
              value={getValue('border-top-left-radius')}
              showSlider={false}
              onChange={(v) => {
                if (!expandRadius) {
                  onChange('border-top-left-radius', v);
                  onChange('border-top-right-radius', v);
                  onChange('border-bottom-right-radius', v);
                  onChange('border-bottom-left-radius', v);
                } else {
                  onChange('border-top-left-radius', v);
                }
              }}
              endContent={<VariablePicker value={getValue('border-top-left-radius')} onChange={(v) => { onChange('border-top-left-radius', v); onChange('border-top-right-radius', v); onChange('border-bottom-right-radius', v); onChange('border-bottom-left-radius', v); }} filter="number" />}
            />
            <button
              class={inputStyles.pairedEndIcon}
              title={expandRadius ? 'Uniform radius' : 'Individual corners'}
              onClick={() => setExpandRadius(!expandRadius)}
              style={{ flexShrink: 0 }}
            >
              <ChevronRight size={10} style={{ transform: expandRadius ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>
          </div>
        </div>
      </div>
      {expandRadius && (
        <>
          <div class={inputStyles.labelAboveRow} style={{ marginTop: '4px' }}>
            <div class={inputStyles.labelAboveCell}>
              <span class={inputStyles.labelAboveLabel}>Top Left</span>
              <NumberInput
                label="border-top-left-radius"
                displayName=""
                value={getValue('border-top-left-radius')}
                showSlider={false}
                onChange={(v) => onChange('border-top-left-radius', v)}
              />
            </div>
            <div class={inputStyles.labelAboveCell}>
              <span class={inputStyles.labelAboveLabel}>Top Right</span>
              <NumberInput
                label="border-top-right-radius"
                displayName=""
                value={getValue('border-top-right-radius')}
                showSlider={false}
                onChange={(v) => onChange('border-top-right-radius', v)}
              />
            </div>
          </div>
          <div class={inputStyles.labelAboveRow}>
            <div class={inputStyles.labelAboveCell}>
              <span class={inputStyles.labelAboveLabel}>Bottom Left</span>
              <NumberInput
                label="border-bottom-left-radius"
                displayName=""
                value={getValue('border-bottom-left-radius')}
                showSlider={false}
                onChange={(v) => onChange('border-bottom-left-radius', v)}
              />
            </div>
            <div class={inputStyles.labelAboveCell}>
              <span class={inputStyles.labelAboveLabel}>Bottom Right</span>
              <NumberInput
                label="border-bottom-right-radius"
                displayName=""
                value={getValue('border-bottom-right-radius')}
                showSlider={false}
                onChange={(v) => onChange('border-bottom-right-radius', v)}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}
