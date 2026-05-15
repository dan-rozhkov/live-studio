import { h } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useStore } from '../../../state/store';
import styles from './VariablePicker.module.css';

export interface CreateVariableFormProps {
  initialName?: string;
  /** Use onMouseDown for buttons (when rendered inside a popover that closes on pointerdown outside). */
  useMouseDown?: boolean;
  onCancel: () => void;
  onCreated?: (name: string) => void;
}

export function CreateVariableForm({
  initialName = '',
  useMouseDown = false,
  onCancel,
  onCreated,
}: CreateVariableFormProps) {
  const createDesignToken = useStore((s) => s.createDesignToken);
  const [name, setName] = useState(initialName);
  const [value, setValue] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const canSubmit = name.trim().length > 0 && value.trim().length > 0;

  const submit = useCallback(() => {
    if (!canSubmit) return;
    createDesignToken(name, value);
    onCreated?.(name.trim().replace(/^-+/, ''));
  }, [name, value, canSubmit, createDesignToken, onCreated]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    if (e.key === 'Escape') { e.stopPropagation(); onCancel(); }
  };

  const buttonHandler = (action: () => void) =>
    useMouseDown
      ? { onMouseDown: (e: MouseEvent) => { e.preventDefault(); action(); } }
      : { onClick: action };

  return (
    <>
      <div class={styles.createRow}>
        <span class={styles.createPrefix}>--</span>
        <input
          ref={nameRef}
          type="text"
          class={styles.createName}
          placeholder="name"
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
          onKeyDown={handleKeyDown}
        />
      </div>
      <input
        type="text"
        class={styles.search}
        placeholder="value (e.g. #0af or 16px)"
        value={value}
        onInput={(e) => setValue((e.target as HTMLInputElement).value)}
        onKeyDown={handleKeyDown}
      />
      <div class={styles.createActions}>
        <button class={styles.createCancel} {...buttonHandler(onCancel)}>
          Cancel
        </button>
        <button class={styles.createSubmit} disabled={!canSubmit} {...buttonHandler(submit)}>
          Create
        </button>
      </div>
    </>
  );
}
