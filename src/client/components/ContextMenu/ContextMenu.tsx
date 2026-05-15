import { useEffect, useRef } from 'preact/hooks';
import type { LucideIcon } from 'lucide-preact';
import styles from './ContextMenu.module.css';

export type MenuItem =
  | {
      type?: 'item';
      label: string;
      onSelect: () => void;
      icon?: LucideIcon;
      shortcut?: string;
      danger?: boolean;
      disabled?: boolean;
    }
  | { type: 'separator' };

export interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onScroll = () => onClose();
    document.addEventListener('keydown', onKey);
    window.addEventListener('blur', onClose);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose]);

  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - 4;
    const maxY = window.innerHeight - rect.height - 4;
    if (x > maxX) el.style.left = `${Math.max(4, maxX)}px`;
    if (y > maxY) el.style.top = `${Math.max(4, maxY)}px`;
  }, [x, y]);

  return (
    <>
      <div
        class={styles.backdrop}
        onMouseDown={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div ref={menuRef} class={styles.menu} style={{ left: x, top: y }} role="menu">
        {items.map((item, i) => {
          if ('type' in item && item.type === 'separator') {
            return <div key={`sep-${i}`} class={styles.separator} />;
          }
          const it = item as Exclude<MenuItem, { type: 'separator' }>;
          const Icon = it.icon;
          return (
            <button
              key={`${it.label}-${i}`}
              class={`${styles.item} ${it.danger ? styles.danger : ''}`}
              disabled={it.disabled}
              onClick={() => {
                if (it.disabled) return;
                it.onSelect();
                onClose();
              }}
              role="menuitem"
            >
              <span class={styles.label}>
                {Icon && <Icon size={14} class={styles.icon} />}
                {it.label}
              </span>
              {it.shortcut && <span class={styles.shortcut}>{it.shortcut}</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}
