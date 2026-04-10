import { h } from 'preact';
import styles from './inputs.module.css';

export interface ToggleProps {
  value: boolean;
  label?: string;
  onChange: (value: boolean) => void;
}

export function Toggle({ value, label, onChange }: ToggleProps) {
  return (
    <div class={styles.row}>
      {label && <label class={styles.label} title={label}>{label}</label>}
      <button
        class={`${styles.toggle} ${value ? styles.toggleOn : ''}`}
        onClick={() => onChange(!value)}
        type="button"
      >
        <span class={styles.thumb} />
      </button>
    </div>
  );
}
