import { h } from 'preact';
import { useState, useCallback, useEffect, useRef } from 'preact/hooks';
import type { JSX } from 'preact';
import { parseNumericValue } from './NumberInput';
import styles from './inputs.module.css';

export interface PairedNumberInputProps {
  prefixA: string;
  prefixB: string;
  valueA: string;
  valueB: string;
  onChangeA: (value: string) => void;
  onChangeB: (value: string) => void;
  endContent?: preact.ComponentChildren;
}

function roundPxValue(v: string): string {
  const { num, unit } = parseNumericValue(v);
  if (unit === 'px') return `${Math.round(num)}px`;
  return v;
}

function PairedField({
  prefix,
  value,
  onChange,
}: {
  prefix: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [local, setLocal] = useState(() => roundPxValue(value));
  const isEditing = useRef(false);

  useEffect(() => {
    if (!isEditing.current) setLocal(roundPxValue(value));
  }, [value]);

  const handleInput = useCallback((e: JSX.TargetedEvent<HTMLInputElement>) => {
    isEditing.current = true;
    setLocal((e.target as HTMLInputElement).value);
  }, []);

  const handleBlur = useCallback(() => {
    isEditing.current = false;
    if (local !== value) onChange(local);
  }, [local, value, onChange]);

  const handleKeyDown = useCallback(
    (e: JSX.TargetedKeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        isEditing.current = false;
        onChange(local);
      }
    },
    [local, onChange],
  );

  const handleFocus = useCallback(() => {
    isEditing.current = true;
  }, []);

  return (
    <div class={styles.pairedInput}>
      <span class={styles.pairedInputPrefix}>{prefix}</span>
      <input
        type="text"
        class={styles.pairedInputField}
        value={local}
        onInput={handleInput}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
      />
    </div>
  );
}

export function PairedNumberInput({
  prefixA,
  prefixB,
  valueA,
  valueB,
  onChangeA,
  onChangeB,
  endContent,
}: PairedNumberInputProps) {
  return (
    <div class={styles.pairedRow}>
      <PairedField prefix={prefixA} value={valueA} onChange={onChangeA} />
      <PairedField prefix={prefixB} value={valueB} onChange={onChangeB} />
      {endContent}
    </div>
  );
}
