import { h } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useStore } from '../../../state/store';
import { validateToken } from '../../../state/validate-token';
import type { DesignToken } from '../../../state/slices/styles-slice';
import styles from './VariablePicker.module.css';

export interface CreateVariableFormProps {
  initialName?: string;
  /** Use onMouseDown for buttons (when rendered inside a popover that closes on pointerdown outside). */
  useMouseDown?: boolean;
  onCancel: () => void;
  onCreated?: (name: string) => void;
  /** Existing tokens for duplicate-name validation. Defaults to store state. */
  existingTokens?: ReadonlyArray<{ name: string }>;
  /** Commit callback receiving pre-validated (name, value). Defaults to store action. */
  onCommit?: (name: string, value: string) => void;
}

export function CreateVariableForm({
  initialName = '',
  useMouseDown = false,
  onCancel,
  onCreated,
  existingTokens,
  onCommit,
}: CreateVariableFormProps) {
  const storeTokens = useStore((s) => s.designTokens) as DesignToken[];
  const storeCommit = useStore((s) => s.createDesignToken);
  const tokens = existingTokens ?? storeTokens;
  const commit = onCommit ?? storeCommit;

  const [name, setName] = useState(initialName);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const canSubmit = name.trim().length > 0 && value.trim().length > 0;

  const submit = useCallback(() => {
    const result = validateToken(name, value, tokens);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    commit(result.name, result.value);
    onCreated?.(result.name);
  }, [name, value, tokens, commit, onCreated]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    if (e.key === 'Escape') { e.stopPropagation(); onCancel(); }
  };

  const buttonHandler = (action: () => void) =>
    useMouseDown
      ? { onMouseDown: (e: MouseEvent) => { e.preventDefault(); action(); } }
      : { onClick: action };

  const clearError = () => { if (error) setError(null); };

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
          onInput={(e) => { setName((e.target as HTMLInputElement).value); clearError(); }}
          onKeyDown={handleKeyDown}
        />
      </div>
      <input
        type="text"
        class={styles.search}
        placeholder="value (e.g. #0af or 16px)"
        value={value}
        onInput={(e) => { setValue((e.target as HTMLInputElement).value); clearError(); }}
        onKeyDown={handleKeyDown}
      />
      {error && <div class={styles.createError} role="alert">{error}</div>}
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
