import { h } from 'preact';
import { useCallback } from 'preact/hooks';
import type { JSX } from 'preact';
import styles from './inputs.module.css';

export interface SelectInputProps {
  label?: string;
  displayName?: string;
  value: string;
  options: string[];
  indent?: boolean;
  endContent?: JSX.Element;
  onChange: (value: string) => void;
  onFocus?: () => void;
}

export function SelectInput({
  label,
  displayName,
  value,
  options,
  indent = false,
  endContent,
  onChange,
  onFocus,
}: SelectInputProps) {
  const handleChange = useCallback(
    (e: JSX.TargetedEvent<HTMLSelectElement>) => {
      onChange((e.target as HTMLSelectElement).value);
    },
    [onChange],
  );

  const labelText = displayName !== undefined ? displayName : (label || '');

  return (
    <div class={`${styles.row} ${indent ? styles.indent : ''}`}>
      {labelText && <label class={styles.label} title={labelText}>{labelText}</label>}
      <select
        class={styles.select}
        value={value}
        onChange={handleChange}
        onFocus={onFocus}
      >
        {!options.includes(value) && <option value={value}>{value}</option>}
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      {endContent}
    </div>
  );
}
