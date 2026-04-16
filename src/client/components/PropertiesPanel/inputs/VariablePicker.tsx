import { h } from 'preact';
import { useState, useCallback, useEffect, useRef, useMemo } from 'preact/hooks';
import type { JSX } from 'preact';
import { Diamond } from 'lucide-preact';
import { useStore } from '../../../state/store';
import styles from './VariablePicker.module.css';

/** Check whether a CSS value looks like a color. */
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
  const named = [
    'red', 'blue', 'green', 'white', 'black', 'orange', 'yellow', 'purple',
    'pink', 'cyan', 'magenta', 'transparent', 'currentcolor', 'inherit',
  ];
  return named.includes(v);
}

export type VariableFilter = 'color' | 'number' | 'any';

/** Check whether a resolved value looks numeric (e.g. "16px", "1.5rem", "0"). */
function isNumericValue(value: string): boolean {
  return /^-?[\d.]+\s*(px|rem|em|%|vw|vh|vmin|vmax|ch|ex|pt|cm|mm|in|s|ms|deg|rad|turn)?$/.test(value.trim());
}

/* ── Dropdown panel (position: fixed, same pattern as ColorPicker popover) ── */

interface VariableDropdownProps {
  anchorRect: DOMRect;
  filter: VariableFilter;
  onSelect: (tokenName: string) => void;
  onClose: () => void;
}

function VariableDropdown({ anchorRect, filter, onSelect, onClose }: VariableDropdownProps) {
  const designTokens = useStore((s) => s.designTokens);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const typeFiltered = useMemo(() => {
    const tokens = filter === 'any' ? designTokens
      : filter === 'color' ? designTokens.filter((t) => isColorValue(t.value))
      : designTokens.filter((t) => isNumericValue(t.value));
    return tokens.slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [designTokens, filter]);

  const filtered = useMemo(() => {
    if (!search) return typeFiltered;
    const q = search.toLowerCase();
    return typeFiltered.filter((t) => t.name.toLowerCase().includes(q) || t.value.toLowerCase().includes(q));
  }, [typeFiltered, search]);

  // Position: below anchor (flip above if not enough space), aligned right
  const MAX_HEIGHT = 200;
  const GAP = 4;
  const spaceBelow = window.innerHeight - anchorRect.bottom - GAP;
  const spaceAbove = anchorRect.top - GAP;
  const top = spaceBelow >= MAX_HEIGHT || spaceBelow >= spaceAbove
    ? anchorRect.bottom + GAP
    : anchorRect.top - MAX_HEIGHT - GAP;
  const left = Math.max(GAP, anchorRect.right - 240);

  // No autofocus — avoids scroll/layout disruption in the panel

  // Reset active index when filter changes
  useEffect(() => {
    setActiveIndex(0);
  }, [filtered]);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex < 0 || !dropdownRef.current) return;
    const items = dropdownRef.current.querySelectorAll('button');
    items[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  // Close on outside click
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.composedPath()[0] as Node | null;
      if (!target) return;
      if (dropdownRef.current?.contains(target)) return;
      onClose();
    };
    const root = dropdownRef.current?.getRootNode() ?? document;
    (root as Document).addEventListener('pointerdown', handlePointerDown as EventListener);
    return () =>
      (root as Document).removeEventListener('pointerdown', handlePointerDown as EventListener);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleKeyDown = useCallback(
    (e: JSX.TargetedKeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i <= 0 ? filtered.length - 1 : i - 1));
      } else if (e.key === 'Enter' && activeIndex >= 0 && activeIndex < filtered.length) {
        e.preventDefault();
        onSelect(filtered[activeIndex].name);
      }
    },
    [filtered, activeIndex, onSelect],
  );

  return (
    <div ref={dropdownRef} class={styles.dropdown} style={{ top, left }}>
      <input
        ref={searchRef}
        type="text"
        class={styles.search}
        placeholder="Search variables..."
        value={search}
        onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
        onKeyDown={handleKeyDown}
      />
      {filtered.length === 0 ? (
        <div class={styles.empty}>No variables found</div>
      ) : (
        filtered.map((token, i) => (
          <button
            key={token.name}
            class={`${styles.item} ${i === activeIndex ? styles.itemActive : ''}`}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(token.name);
            }}
            onMouseEnter={() => setActiveIndex(i)}
          >
            {isColorValue(token.value) && (
              <span
                class={styles.colorSwatch}
                style={{ background: token.value }}
              />
            )}
            <span class={styles.tokenName}>{token.name}</span>
            <span class={styles.tokenValue}>{token.value}</span>
          </button>
        ))
      )}
    </div>
  );
}

/* ── VariablePicker — button (inside input) + dropdown (fixed popover) ── */

export interface VariablePickerProps {
  /** Current field value — used to detect active variable binding */
  value: string;
  /** Called with `var(--token-name)` when a variable is selected */
  onChange: (value: string) => void;
  /** Filter tokens by type. Defaults to 'any'. */
  filter?: VariableFilter;
}

export function VariablePicker({ value, onChange, filter = 'any' }: VariablePickerProps) {
  const designTokens = useStore((s) => s.designTokens);
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const anchorRectRef = useRef<DOMRect | null>(null);

  const isActive = value.startsWith('var(--');

  const handleToggle = useCallback((e: JSX.TargetedMouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (buttonRef.current) {
      anchorRectRef.current = buttonRef.current.getBoundingClientRect();
    }
    setIsOpen((v) => !v);
  }, []);

  const handleSelect = useCallback(
    (tokenName: string) => {
      onChange(`var(--${tokenName})`);
      setIsOpen(false);
    },
    [onChange],
  );

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  if (designTokens.length === 0) return null;

  return (
    <div class={styles.wrapper}>
      <button
        ref={buttonRef}
        class={`${styles.button} ${isActive ? styles.buttonActive : ''}`}
        title="Set variable"
        tabIndex={-1}
        onMouseDown={handleToggle}
      >
        <Diamond size={10} />
      </button>
      {isOpen && anchorRectRef.current && (
        <VariableDropdown
          anchorRect={anchorRectRef.current}
          filter={filter}
          onSelect={handleSelect}
          onClose={handleClose}
        />
      )}
    </div>
  );
}
