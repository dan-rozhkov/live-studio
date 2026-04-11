import { h } from 'preact';
import type { ComponentType } from 'preact';
import styles from './inputs.module.css';

export interface ToggleOption {
  value: string;
  icon: ComponentType<{ size?: number }>;
  title?: string;
}

export interface IconToggleGroupProps {
  options: ToggleOption[];
  value: string;
  onChange: (value: string) => void;
}

export function IconToggleGroup({ options, value, onChange }: IconToggleGroupProps) {
  return (
    <div class={styles.iconToggleGroup}>
      {options.map((opt) => {
        const Icon = opt.icon;
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            class={`${styles.iconToggleBtn} ${isActive ? styles.iconToggleBtnActive : ''}`}
            title={opt.title ?? opt.value}
            onClick={() => onChange(opt.value)}
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}
