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

export function extractDisplay(v: string): { display: string; unit: string } {
  const { num, unit } = parseNumericValue(v);
  if (unit === 'px') return { display: String(Math.round(num)), unit };
  if (unit) return { display: String(num), unit };
  return { display: v, unit: '' };
}

export function PairedField({
  prefix,
  startContent,
  value,
  onChange,
}: {
  prefix?: string;
  startContent?: preact.ComponentChildren;
  value: string;
  onChange: (v: string) => void;
}) {
  const parsed = extractDisplay(value);
  const [local, setLocal] = useState(() => parsed.display);
  const unitRef = useRef(parsed.unit);
  const isEditing = useRef(false);

  useEffect(() => {
    if (!isEditing.current) {
      const p = extractDisplay(value);
      setLocal(p.display);
      unitRef.current = p.unit;
    }
  }, [value]);

  const commit = useCallback((v: string) => {
    return unitRef.current ? `${v}${unitRef.current}` : v;
  }, []);

  const handleInput = useCallback((e: JSX.TargetedEvent<HTMLInputElement>) => {
    isEditing.current = true;
    setLocal((e.target as HTMLInputElement).value);
  }, []);

  const handleBlur = useCallback(() => {
    isEditing.current = false;
    const committed = commit(local);
    if (committed !== value) onChange(committed);
  }, [local, value, commit, onChange]);

  const handleKeyDown = useCallback(
    (e: JSX.TargetedKeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        isEditing.current = false;
        onChange(commit(local));
      }
    },
    [local, commit, onChange],
  );

  const handleFocus = useCallback(() => {
    isEditing.current = true;
  }, []);

  return (
    <div class={styles.pairedInput}>
      {startContent
        ? <span class={styles.paddingInputIcon}>{startContent}</span>
        : prefix && <span class={styles.pairedInputPrefix}>{prefix}</span>
      }
      <input
        type="text"
        class={styles.pairedInputField}
        value={local}
        onInput={handleInput}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
      />
      {unitRef.current && <span class={styles.pairedInputSuffix}>{unitRef.current}</span>}
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
