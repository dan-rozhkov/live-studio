import { h } from 'preact';
import { useState, useCallback, useEffect, useRef, useMemo } from 'preact/hooks';
import type { JSX } from 'preact';
import { useStore } from '../../../state/store';
import styles from './TokenAutocomplete.module.css';

/**
 * Detect whether a CSS value looks like a color (hex, rgb, hsl, named colors
 * that are common).  Used to show a swatch next to matching tokens.
 */
function isColorValue(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v.startsWith('#')) return true;
  if (v.startsWith('rgb')) return true;
  if (v.startsWith('hsl')) return true;
  if (v.startsWith('lch')) return true;
  if (v.startsWith('oklch')) return true;
  if (v.startsWith('lab')) return true;
  if (v.startsWith('oklab')) return true;
  if (v.startsWith('color(')) return true;
  // common named colors
  const named = [
    'red', 'blue', 'green', 'white', 'black', 'orange', 'yellow', 'purple',
    'pink', 'cyan', 'magenta', 'transparent', 'currentcolor', 'inherit',
  ];
  if (named.includes(v)) return true;
  return false;
}

export interface TokenAutocompleteProps {
  /** Current input value */
  value: string;
  /** Called when user selects a token — receives the full `var(--token-name)` string */
  onSelect: (value: string) => void;
  /** Reference to the input element (used for positioning) */
  inputRef: preact.RefObject<HTMLInputElement>;
}

/**
 * Dropdown suggestion list for design tokens.
 *
 * Renders when the input value contains `var(--`.  Filters tokens by the
 * typed prefix after `var(--`.  Supports keyboard navigation (ArrowUp/Down)
 * and selection (Enter).  Click on an item inserts `var(--token-name)`.
 */
export function TokenAutocomplete({ value, onSelect, inputRef }: TokenAutocompleteProps) {
  const designTokens = useStore((s) => s.designTokens);
  const [activeIndex, setActiveIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Extract the prefix typed after "var(--"
  const varMatch = value.match(/var\(--([^)]*)$/i);
  const isOpen = varMatch !== null && designTokens.length > 0;
  const typedPrefix = varMatch ? varMatch[1].toLowerCase() : '';

  // Filter tokens by the prefix
  const filtered = useMemo(() => {
    if (!isOpen) return [];
    if (!typedPrefix) return designTokens;
    return designTokens.filter((t) =>
      t.name.toLowerCase().includes(typedPrefix),
    );
  }, [isOpen, typedPrefix, designTokens]);

  // Reset active index when the list changes
  useEffect(() => {
    setActiveIndex(filtered.length > 0 ? 0 : -1);
  }, [filtered]);

  // Handle keyboard navigation on the input
  const handleKeyDown = useCallback(
    (e: JSX.TargetedKeyboardEvent<HTMLInputElement>) => {
      if (!isOpen || filtered.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i <= 0 ? filtered.length - 1 : i - 1));
      } else if (e.key === 'Enter' && activeIndex >= 0 && activeIndex < filtered.length) {
        e.preventDefault();
        const token = filtered[activeIndex];
        // Replace everything from `var(--...` to the end with the completed token
        const completed = value.replace(/var\(--[^)]*$/i, `var(--${token.name})`);
        onSelect(completed);
      } else if (e.key === 'Escape') {
        // Let parent handle escape — we just reset
        setActiveIndex(-1);
      }
    },
    [isOpen, filtered, activeIndex, value, onSelect],
  );

  // Attach keyboard handler to the input
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const handler = (e: KeyboardEvent) =>
      handleKeyDown(e as unknown as JSX.TargetedKeyboardEvent<HTMLInputElement>);
    input.addEventListener('keydown', handler);
    return () => input.removeEventListener('keydown', handler);
  }, [inputRef, handleKeyDown]);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex < 0 || !dropdownRef.current) return;
    const item = dropdownRef.current.children[activeIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.composedPath()[0] as Node | null;
      if (!target) return;
      if (dropdownRef.current?.contains(target)) return;
      if (inputRef.current?.contains(target)) return;
      setActiveIndex(-1);
    };
    const root = inputRef.current?.getRootNode() ?? document;
    (root as Document).addEventListener('pointerdown', handlePointerDown as EventListener);
    return () =>
      (root as Document).removeEventListener('pointerdown', handlePointerDown as EventListener);
  }, [isOpen, inputRef]);

  if (!isOpen || filtered.length === 0) return null;

  return (
    <div ref={dropdownRef} class={styles.dropdown}>
      {filtered.map((token, i) => (
        <button
          key={token.name}
          class={`${styles.item} ${i === activeIndex ? styles.itemActive : ''}`}
          onMouseDown={(e) => {
            e.preventDefault(); // prevent blur on the input
            const completed = value.replace(/var\(--[^)]*$/i, `var(--${token.name})`);
            onSelect(completed);
          }}
          onMouseEnter={() => setActiveIndex(i)}
        >
          {isColorValue(token.value) && (
            <span
              class={styles.colorSwatch}
              style={{ background: token.value }}
            />
          )}
          <span class={styles.tokenName}>--{token.name}</span>
          <span class={styles.tokenValue}>{token.value}</span>
        </button>
      ))}
    </div>
  );
}
