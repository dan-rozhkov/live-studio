import { h } from 'preact';
import { useState, useCallback, useEffect } from 'preact/hooks';
import type { JSX } from 'preact';
import styles from './inputs.module.css';

export interface TextInputProps {
  label?: string;
  displayName?: string;
  value: string;
  mono?: boolean;
  indent?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onLabelDoubleClick?: () => void;
  labelOverride?: JSX.Element;
}

export function TextInput({
  label,
  displayName,
  value,
  mono,
  indent = false,
  placeholder,
  onChange,
  onFocus,
  onLabelDoubleClick,
  labelOverride,
}: TextInputProps) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = useCallback((e: JSX.TargetedEvent<HTMLInputElement>) => {
    setLocalValue((e.target as HTMLInputElement).value);
  }, []);

  const handleBlur = useCallback(() => {
    if (localValue !== value) {
      onChange(localValue);
    }
  }, [localValue, value, onChange]);

  const handleKeyDown = useCallback(
    (e: JSX.TargetedKeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') onChange(localValue);
    },
    [localValue, onChange],
  );

  const labelText = displayName || label;

  return (
    <div class={`${styles.row} ${indent ? styles.indent : ''}`}>
      {labelOverride ?? (
        <label
          class={`${styles.label} ${mono ? styles.mono : ''}`}
          title={labelText}
          onDblClick={onLabelDoubleClick}
        >
          {labelText}
        </label>
      )}
      <input
        type="text"
        class={styles.textInput}
        value={localValue}
        placeholder={placeholder}
        onInput={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
      />
    </div>
  );
}
