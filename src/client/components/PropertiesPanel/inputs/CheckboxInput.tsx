import { h } from 'preact';
import { Check } from 'lucide-preact';
import styles from './inputs.module.css';

export interface CheckboxInputProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function CheckboxInput({ label, checked, onChange }: CheckboxInputProps) {
  return (
    <div class={styles.checkboxRow} onClick={() => onChange(!checked)}>
      <div class={`${styles.checkbox} ${checked ? styles.checkboxChecked : ''}`}>
        {checked && <Check size={10} />}
      </div>
      <span class={styles.checkboxLabel}>{label}</span>
    </div>
  );
}
