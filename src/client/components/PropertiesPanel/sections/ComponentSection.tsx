import { h, Fragment } from 'preact';
import { useCallback, useState, useEffect } from 'preact/hooks';
import type { JSX } from 'preact';
import { TextInput } from '../inputs/TextInput';
import { Toggle } from '../inputs/Toggle';
import inputStyles from '../inputs/inputs.module.css';
import attrStyles from './AttributesSection.module.css';
import styles from './ComponentSection.module.css';

export interface ComponentSectionProps {
  props: Record<string, unknown>;
  onPropChange: (name: string, value: unknown) => void;
}

function sortKeys(props: Record<string, unknown>): string[] {
  // `children` first when it's a primitive — it's usually the most-edited prop
  return Object.keys(props).sort((a, b) => {
    if (a === 'children') return -1;
    if (b === 'children') return 1;
    return a.localeCompare(b);
  });
}

function readonlyTag(value: unknown): string {
  if (Array.isArray(value)) return '[array]';
  if (value === null) return 'null';
  if (typeof value === 'object') return '[object]';
  return String(value);
}

function NumberPropRow({
  name,
  value,
  onChange,
}: {
  name: string;
  value: number;
  onChange: (next: number) => void;
}) {
  const [local, setLocal] = useState(String(value));

  useEffect(() => {
    setLocal(String(value));
  }, [value]);

  const commit = useCallback(() => {
    const n = Number(local);
    if (Number.isFinite(n) && n !== value) onChange(n);
    else setLocal(String(value));
  }, [local, value, onChange]);

  return (
    <div class={inputStyles.row}>
      <label class={inputStyles.label} title={name}>{name}</label>
      <input
        type="number"
        class={styles.numberInput}
        value={local}
        onInput={(e: JSX.TargetedEvent<HTMLInputElement>) =>
          setLocal((e.target as HTMLInputElement).value)
        }
        onBlur={commit}
        onKeyDown={(e: JSX.TargetedKeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') commit();
        }}
      />
    </div>
  );
}

export function ComponentSection({
  props,
  onPropChange,
}: ComponentSectionProps) {
  const keys = sortKeys(props);

  return (
    <>
      {keys.length === 0 && (
        <div class={attrStyles.emptyHint}>No editable props</div>
      )}

      {keys.map((k) => {
        const v = props[k];
        const t = typeof v;

        if (t === 'string') {
          return (
            <TextInput
              key={k}
              label={k}
              value={v as string}
              onChange={(next) => onPropChange(k, next)}
            />
          );
        }

        if (t === 'number') {
          return (
            <NumberPropRow
              key={k}
              name={k}
              value={v as number}
              onChange={(next) => onPropChange(k, next)}
            />
          );
        }

        if (t === 'boolean') {
          return (
            <Toggle
              key={k}
              label={k}
              value={v as boolean}
              onChange={(next) => onPropChange(k, next)}
            />
          );
        }

        return (
          <div class={styles.readonlyRow} key={k}>
            <span class={styles.readonlyLabel} title={k}>{k}</span>
            <span class={styles.readonlyValue}>{readonlyTag(v)}</span>
          </div>
        );
      })}
    </>
  );
}
